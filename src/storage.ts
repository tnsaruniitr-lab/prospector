/**
 * Storage adapter layer for prospect-engine.
 *
 * Controls where researched dossiers are persisted.  The active set of
 * adapters is resolved once from the STORAGE env var and reused for the
 * lifetime of the process.
 *
 * STORAGE=local  (default) → LocalFileAdapter only — no DATABASE_URL needed
 * STORAGE=db               → DbAdapter only        — DATABASE_URL required
 * STORAGE=both             → both in parallel       — DATABASE_URL required
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createGzip } from "node:zlib";
import { promisify } from "node:util";
import { q, T } from "./db.js";
import { paths, config } from "./config.js";
import { flattenDossier, DOSSIER_COLUMNS } from "./dossier.js";
import type { Dossier, DossierContact } from "./dossier.js";

const gzip = promisify(createGzip);

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface StorageAdapter {
  /** Persist a dossier; returns a stable id (domain slug or uuid). */
  save(dossier: Dossier): Promise<string>;
}

export interface SaveOptions {
  /** Override resolved adapters (useful for testing). */
  adapters?: StorageAdapter[];
}

// ── Helpers — number coercions (shared with db-adapter logic) ─────────────────

const numOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n == null ? null : Math.round(n);
};

const kmbToInt = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Math.round(v);
  const m = String(v)
    .trim()
    .replace(/,/g, "")
    .match(/^([0-9]*\.?[0-9]+)\s*([kmb])?/i);
  if (!m) return null;
  const mult =
    ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[
      (m[2] || "").toLowerCase()
    ] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
};

// ── Minimal xlsx writer (no external deps) ────────────────────────────────────
// Produces a valid Office Open XML workbook as a Buffer.

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Remove characters illegal in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** Build an xlsx Buffer from a header row + data rows (all strings). */
export async function buildXlsx(
  headers: readonly string[],
  rows: string[][],
): Promise<Buffer> {
  const xmlRow = (cells: string[], rowIdx: number): string => {
    const cols = cells
      .map((v, ci) => {
        const col = String.fromCharCode(65 + (ci % 26));
        const ref = `${col}${rowIdx}`;
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c>`;
      })
      .join("");
    return `<row r="${rowIdx}">${cols}</row>`;
  };

  const sheetData = [
    xmlRow(headers as string[], 1),
    ...rows.map((r, i) => xmlRow(r, i + 2)),
  ].join("");

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetData}</sheetData>` +
    `</worksheet>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Prospects" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;

  const topRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  // Build a zip manually using the ZIP local-file-header format.
  // We store files without compression (method=0) to keep this dependency-free.
  type ZipEntry = { name: string; data: Buffer };
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypesXml, "utf-8") },
    { name: "_rels/.rels", data: Buffer.from(topRelsXml, "utf-8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbookXml, "utf-8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(relsXml, "utf-8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml, "utf-8") },
  ];

  const crc32 = (buf: Buffer): number => {
    // Standard CRC-32 table
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  const u16le = (n: number) => {
    const b = Buffer.allocUnsafe(2);
    b.writeUInt16LE(n, 0);
    return b;
  };
  const u32le = (n: number) => {
    const b = Buffer.allocUnsafe(4);
    b.writeUInt32LE(n, 0);
    return b;
  };

  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf-8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
      u16le(20), // version needed
      u16le(0), // flags
      u16le(0), // compression: stored
      u16le(0), u16le(0), // mod time/date
      u32le(crc),
      u32le(size),
      u32le(size),
      u16le(nameBytes.length),
      u16le(0), // extra length
      nameBytes,
      entry.data,
    ]);
    localHeaders.push(local);

    // Central directory entry
    const cd = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
      u16le(20), // version made by
      u16le(20), // version needed
      u16le(0), // flags
      u16le(0), // compression
      u16le(0), u16le(0), // mod time/date
      u32le(crc),
      u32le(size),
      u32le(size),
      u16le(nameBytes.length),
      u16le(0), // extra length
      u16le(0), // comment length
      u16le(0), // disk start
      u16le(0), // int file attrs
      u32le(0), // ext file attrs
      u32le(offset), // local header offset
      nameBytes,
    ]);
    centralDirs.push(cd);
    offset += local.length;
  }

  const cdBuf = Buffer.concat(centralDirs);
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), // end of central directory signature
    u16le(0), u16le(0), // disk numbers
    u16le(entries.length),
    u16le(entries.length),
    u32le(cdBuf.length),
    u32le(offset),
    u16le(0), // comment length
  ]);

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

// ── LocalFileAdapter ──────────────────────────────────────────────────────────

export class LocalFileAdapter implements StorageAdapter {
  private readonly dossiersDir: string;
  private readonly csvPath: string;
  private readonly xlsxPath: string;

  constructor() {
    this.dossiersDir = resolve(paths.outputsDir, "dossiers");
    this.csvPath = resolve(paths.outputsDir, "prospects.csv");
    this.xlsxPath = resolve(paths.outputsDir, "prospects.xlsx");
  }

  async save(dossier: Dossier): Promise<string> {
    await mkdir(this.dossiersDir, { recursive: true });

    const domain = dossier.domain.toLowerCase();
    const slug = domain.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // 1. Write raw dossier JSON
    await writeFile(
      resolve(this.dossiersDir, `${slug}.json`),
      JSON.stringify(dossier, null, 2),
      "utf-8",
    );

    // 2. Append row to prospects.csv
    const flat = flattenDossier(dossier);
    await this._appendCsv(flat);

    // 3. Append row to prospects.xlsx
    await this._appendXlsx(flat);

    return domain;
  }

  private _csvCell(v: string): string {
    return `"${(v ?? "").replace(/"/g, '""')}"`;
  }

  private async _appendCsv(flat: Record<string, string>): Promise<void> {
    const row =
      DOSSIER_COLUMNS.map((col) => this._csvCell(flat[col] ?? "")).join(",") +
      "\n";

    if (!existsSync(this.csvPath)) {
      // Write header + first row
      const header =
        DOSSIER_COLUMNS.map((c) => this._csvCell(c)).join(",") + "\n";
      await writeFile(this.csvPath, header + row, "utf-8");
    } else {
      // Append row only (header already present)
      const existing = await readFile(this.csvPath, "utf-8");
      await writeFile(this.csvPath, existing + row, "utf-8");
    }
  }

  private async _appendXlsx(flat: Record<string, string>): Promise<void> {
    const newRow = DOSSIER_COLUMNS.map((col) => flat[col] ?? "");

    let headers: readonly string[] = DOSSIER_COLUMNS;
    let rows: string[][] = [];

    if (existsSync(this.xlsxPath)) {
      // Re-parse existing xlsx to preserve prior rows.
      // Our homegrown xlsx uses inlineStr cells — parse with a minimal regex.
      try {
        const existing = await readFile(this.xlsxPath);
        const parsed = this._parseXlsxRows(existing);
        if (parsed.length > 0) {
          // First parsed row is the header row
          headers = parsed[0] as string[];
          rows = parsed.slice(1);
        }
      } catch {
        // If parse fails, start fresh
        rows = [];
      }
    }

    rows.push(newRow);
    const buf = await buildXlsx(headers, rows);
    await writeFile(this.xlsxPath, buf);
  }

  /**
   * Minimal xlsx row parser for our own format only.
   * Reads inlineStr cells from xl/worksheets/sheet1.xml inside the zip.
   */
  private _parseXlsxRows(buf: Buffer): string[][] {
    // Find sheet1.xml inside the zip by scanning local file headers
    let pos = 0;
    let sheetXml: string | null = null;

    while (pos + 30 < buf.length) {
      if (
        buf[pos] === 0x50 &&
        buf[pos + 1] === 0x4b &&
        buf[pos + 2] === 0x03 &&
        buf[pos + 3] === 0x04
      ) {
        const nameLen = buf.readUInt16LE(pos + 26);
        const extraLen = buf.readUInt16LE(pos + 28);
        const name = buf.slice(pos + 30, pos + 30 + nameLen).toString("utf-8");
        const dataSize = buf.readUInt32LE(pos + 18);
        const dataStart = pos + 30 + nameLen + extraLen;

        if (name === "xl/worksheets/sheet1.xml") {
          sheetXml = buf.slice(dataStart, dataStart + dataSize).toString("utf-8");
          break;
        }
        pos = dataStart + dataSize;
      } else {
        pos++;
      }
    }

    if (!sheetXml) return [];

    // Parse rows from inlineStr cells: <row r="N"><c ...><is><t>VALUE</t></is></c></row>
    const rowMatches = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
    return rowMatches.map((rm) => {
      const cellMatches = [...rm[1].matchAll(/<t>([^<]*)<\/t>/g)];
      return cellMatches.map((cm) =>
        cm[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'"),
      );
    });
  }
}

// ── DbAdapter ─────────────────────────────────────────────────────────────────

export class DbAdapter implements StorageAdapter {
  async save(dossier: Dossier): Promise<string> {
    if (!config.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is required when STORAGE=db or STORAGE=both. " +
          "Add it to prospect-engine/.env.",
      );
    }

    const c = dossier.contacts;
    const cv = dossier.competitive;
    const domain = dossier.domain.toLowerCase();

    const vals = {
      playbook: dossier.category || "dossier",
      name: dossier.name,
      website: dossier.domain.startsWith("http")
        ? dossier.domain
        : `https://${dossier.domain}`,
      city: dossier.geo ?? null,
      email: c.businessEmail ?? null,
      instagram: c.instagram ?? null,
      whatsapp: c.whatsapp ?? null,
      phone: c.businessPhone ?? null,
      booking_link: c.bookingLink ?? null,
      has_chatbot: dossier.audit.hasChatWidget ?? null,
      has_whatsapp_bot: dossier.audit.hasWhatsAppBot ?? null,
      lead_offer: dossier.leadOffer,
      rating: numOrNull(dossier.googleRating),
      review_count: intOrNull(dossier.googleReviews),
      authority_score: numOrNull(cv.authorityScore),
      organic_traffic: kmbToInt(cv.organicTraffic),
      traffic_trend: cv.trafficTrend ?? null,
      organic_keywords: kmbToInt(cv.organicKeywords),
      backlinks: kmbToInt(cv.backlinks),
      ref_domains: kmbToInt(cv.refDomains),
      ai_mentions: intOrNull(cv.aiVisibility?.mentions),
      ai_visibility: JSON.stringify(cv.aiVisibility ?? {}),
      competitors: JSON.stringify(cv.competitors ?? []),
      weak_points: JSON.stringify(dossier.weakPoints ?? []),
      dossier: JSON.stringify(dossier),
      dossier_summary: dossier.hook ?? dossier.pitch ?? null,
    };

    const existing = await q<{ id: string }>(
      `select id from ${T.prospects} where lower(domain) = $1 limit 1`,
      [domain],
    );

    let id: string;
    if (existing.length) {
      id = existing[0].id;
      await q(
        `update ${T.prospects} set
           playbook=$2, name=$3, website=$4, city=$5, email=$6, instagram=$7, whatsapp=$8,
           has_chatbot=$9, has_whatsapp_bot=$10, lead_offer=$11, rating=$12, review_count=$13,
           authority_score=$14, ai_mentions=$15, ai_visibility=$16::jsonb, competitors=$17::jsonb,
           dossier=$18::jsonb, dossier_summary=$19,
           phone=$20, booking_link=$21, organic_traffic=$22, traffic_trend=$23, organic_keywords=$24,
           backlinks=$25, ref_domains=$26, weak_points=$27::jsonb,
           research_status='researched', qual_status='qualified',
           researched_at=now(), updated_at=now()
         where id=$1`,
        [
          id,
          vals.playbook, vals.name, vals.website, vals.city, vals.email,
          vals.instagram, vals.whatsapp, vals.has_chatbot, vals.has_whatsapp_bot,
          vals.lead_offer, vals.rating, vals.review_count, vals.authority_score,
          vals.ai_mentions, vals.ai_visibility, vals.competitors, vals.dossier,
          vals.dossier_summary, vals.phone, vals.booking_link, vals.organic_traffic,
          vals.traffic_trend, vals.organic_keywords, vals.backlinks, vals.ref_domains,
          vals.weak_points,
        ],
      );
    } else {
      const r = await q<{ id: string }>(
        `insert into ${T.prospects}
           (playbook, name, website, domain, city, email, instagram, whatsapp, has_chatbot, has_whatsapp_bot,
            lead_offer, rating, review_count, authority_score, ai_mentions, ai_visibility, competitors,
            dossier, dossier_summary, phone, booking_link, organic_traffic, traffic_trend, organic_keywords,
            backlinks, ref_domains, weak_points, research_status, qual_status, researched_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19,
            $20,$21,$22,$23,$24,$25,$26,$27::jsonb,'researched','qualified',now())
         returning id`,
        [
          vals.playbook, vals.name, vals.website, domain, vals.city, vals.email,
          vals.instagram, vals.whatsapp, vals.has_chatbot, vals.has_whatsapp_bot,
          vals.lead_offer, vals.rating, vals.review_count, vals.authority_score,
          vals.ai_mentions, vals.ai_visibility, vals.competitors, vals.dossier,
          vals.dossier_summary, vals.phone, vals.booking_link, vals.organic_traffic,
          vals.traffic_trend, vals.organic_keywords, vals.backlinks, vals.ref_domains,
          vals.weak_points,
        ],
      );
      id = r[0].id;
    }

    // Contacts — replace the set for this prospect.
    await q(`delete from ${T.contacts} where prospect_id = $1`, [id]);
    const people = [c.founder, c.decisionMaker2, ...(c.others ?? [])].filter(
      (p): p is DossierContact => !!p,
    );
    for (const p of people) {
      await q(
        `insert into ${T.contacts}
           (prospect_id, name, role, email, email_status, linkedin_url, instagram, phone, source, confidence, evidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id, p.name, p.role, p.email ?? null,
          p.email ? "valid_domain" : null,
          p.linkedin ?? null, null, p.phone ?? null,
          p.source ?? "dossier",
          p.linkedinVerified ? 0.9 : 0.6,
          null,
        ],
      );
    }

    // One audit row — replace on re-record.
    await q(`delete from ${T.audits} where prospect_id = $1`, [id]);
    await q(
      `insert into ${T.audits}
         (prospect_id, tier, status, classification, lead_offer, signals, top_issues)
       values ($1,'deep','ok',$2,$3,$4::jsonb,$5::jsonb)`,
      [
        id,
        dossier.audit.title ?? null,
        dossier.leadOffer,
        JSON.stringify(dossier.audit),
        JSON.stringify(dossier.topAiProblems ?? []),
      ],
    );

    return id;
  }
}

// ── Adapter resolution ────────────────────────────────────────────────────────

let _resolved: StorageAdapter[] | null = null;

/** Resolve adapters from STORAGE env var. Result is cached for the process lifetime. */
export function resolveAdapters(): StorageAdapter[] {
  if (_resolved) return _resolved;
  const mode = (config.STORAGE ?? "local").toLowerCase();
  if (mode === "local") {
    _resolved = [new LocalFileAdapter()];
  } else if (mode === "db") {
    _resolved = [new DbAdapter()];
  } else if (mode === "both") {
    _resolved = [new LocalFileAdapter(), new DbAdapter()];
  } else {
    throw new Error(
      `Unknown STORAGE="${mode}". Must be local | db | both`,
    );
  }
  return _resolved;
}

/** Reset cached adapter list (used in tests). */
export function _resetAdapters(): void {
  _resolved = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a dossier via all active adapters (in parallel).
 * Returns the first adapter's id as the canonical id.
 */
export async function saveProspect(
  dossier: Dossier,
  options: SaveOptions = {},
): Promise<string> {
  const adapters = options.adapters ?? resolveAdapters();
  const ids = await Promise.all(adapters.map((a) => a.save(dossier)));
  return ids[0];
}
