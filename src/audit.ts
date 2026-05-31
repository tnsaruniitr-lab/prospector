import { spawn } from "node:child_process";
import { config, paths } from "./config.js";
import type { AuditResult, AuditSignals } from "./types.js";

interface AuditorJson {
  overall_summary?: {
    classification?: string | null;
    total_checks_run?: number;
    pass?: number; fail?: number; warn?: number; na?: number;
    all_critical_issues?: string[];
  };
  all_checks?: Record<string, { status?: string; evidence?: string }>;
}

/** Find a check whose key contains `idPart` (keys are prefixed like "schema:no_invalid_entities"). */
function findCheck(all: Record<string, { status?: string; evidence?: string }>, idPart: string) {
  const hit = Object.entries(all).find(([k]) => k.includes(idPart));
  return hit ? hit[1] : null;
}

function parseIssue(line: string): { id: string; evidence: string } {
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(line);
  return m ? { id: m[1], evidence: m[2].trim() } : { id: "issue", evidence: line.trim() };
}

/** Fold the auditor JSON into the structured signals the scorer consumes. */
function deriveSignals(json: AuditorJson): AuditSignals {
  const s = json.overall_summary ?? {};
  const all = json.all_checks ?? {};

  const title = findCheck(all, "A2b_title_uniqueness");
  const aiCrawlers = findCheck(all, "ai_crawlers");
  const person = findCheck(all, "D12_person_schema");
  const present = findCheck(all, "schema_entities_present");
  const invalid = findCheck(all, "no_invalid_entities");
  const ttfb = findCheck(all, "B1_ttfb");

  const spaBlocked =
    /just a moment|client-side spa|same title/i.test(title?.evidence ?? "") ||
    /blocked|csr/i.test(s.classification ?? "");
  const ttfbMatch = (ttfb?.evidence ?? "").match(/(\d+)\s*ms/);

  return {
    reachable: (s.total_checks_run ?? 0) > 0,
    classification: s.classification ?? null,
    aiReadable: !spaBlocked && aiCrawlers?.status !== "fail",
    failCount: s.fail ?? 0,
    warnCount: s.warn ?? 0,
    hasValidSchema: present?.status === "pass" && invalid?.status !== "fail",
    hasPersonSchema: person?.status === "pass",
    slowMs: ttfbMatch ? Number(ttfbMatch[1]) : null,
  };
}

/** Run the deterministic auditor over one URL → structured signals + top issues. */
export function runAudit(url: string): Promise<AuditResult> {
  return new Promise((resolve) => {
    const child = spawn("bash", [paths.auditorScript, url], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;

    const finish = (r: AuditResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(errorResult(`timed out after ${config.AUDIT_TIMEOUT_MS}ms`));
    }, config.AUDIT_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => finish(errorResult(`spawn failed: ${err.message}`)));

    child.on("close", () => {
      let json: AuditorJson;
      try {
        json = JSON.parse(stdout) as AuditorJson;
      } catch {
        return finish(errorResult(`unparseable auditor output: ${(stderr || stdout).slice(0, 200)}`));
      }
      const all = json.all_checks ?? {};
      const failing = Object.entries(all)
        .filter(([, c]) => c.status === "fail")
        .map(([id, c]) => ({ id, evidence: (c.evidence ?? "").slice(0, 240) }));
      const critical = json.overall_summary?.all_critical_issues ?? [];
      const topIssues = (failing.length ? failing : critical.map(parseIssue)).slice(0, 5);

      finish({ status: "ok", signals: deriveSignals(json), topIssues });
    });
  });
}

function errorResult(error: string): AuditResult {
  return {
    status: "error",
    error,
    signals: {
      reachable: false, classification: null, aiReadable: false,
      failCount: 0, warnCount: 0, hasValidSchema: false, hasPersonSchema: false, slowMs: null,
    },
    topIssues: [],
  };
}
