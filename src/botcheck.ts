import type { BotSignals } from "./types.js";

/**
 * Deterministic on-site signal scan. Fetches the homepage HTML and detects:
 *   - chat/bot vendors  → has_chatbot / has_whatsapp_bot (product-fit flag)
 *   - WhatsApp links    → has_whatsapp_link + the number
 *   - Instagram, emails, phones (rung-1 enrichment, free)
 *   - ad/analytics pixels (attribution signal)
 * No JS execution — for SPA/Cloudflare-walled sites the production worker
 * re-runs this through Playwright. Honest about what it couldn't see.
 */

const CHAT_VENDORS: [string, RegExp][] = [
  ["Intercom", /widget\.intercom\.io|intercomcdn/i],
  ["Drift", /js\.driftt\.com|drift\.com\/include/i],
  ["tawk.to", /embed\.tawk\.to/i],
  ["Tidio", /code\.tidio\.co/i],
  ["Crisp", /client\.crisp\.chat/i],
  ["LiveChat", /cdn\.livechatinc\.com/i],
  ["Zendesk", /static\.zdassets\.com|zopim/i],
  ["HubSpot", /js\.hs-scripts\.com/i],
  ["Freshchat", /wchat\.freshchat\.com/i],
  ["Gorgias", /config\.gorgias\.chat/i],
  ["Chatwoot", /chatwoot/i],
  ["Kommunicate", /kommunicate\.io/i],
];

// WhatsApp *automation* vendors (a real bot, not just a click-to-chat link).
const WA_BOT_VENDORS = /wati\.io|respond\.io|landbot|gallabox|interakt|chatrace|360dialog/i;

const PIXELS: [string, RegExp][] = [
  ["GA4", /gtag\/js\?id=G-|googletagmanager\.com\/gtag/i],
  ["GTM", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/],
  ["MetaPixel", /connect\.facebook\.net\/.*fbevents\.js|fbq\(/i],
  ["TikTok", /analytics\.tiktok\.com/i],
];

export interface BotCheckResult extends BotSignals {
  reachable: boolean;
  chatVendor: string | null;
  whatsapp: string | null;
  instagram: string | null;
  emails: string[];
  phones: string[];
  pixels: string[];
  note: string | null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function botCheck(url: string, timeoutMs = 15000): Promise<BotCheckResult> {
  const empty = (note: string): BotCheckResult => ({
    reachable: false, hasChatbot: false, hasWhatsAppBot: false, hasWhatsAppLink: false,
    chatVendor: null, whatsapp: null, instagram: null, emails: [], phones: [], pixels: [], note,
  });

  let html: string;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return empty(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return empty(`fetch failed: ${(e as Error).message}`);
  }

  // SPA / challenge wall — HTML is near-empty or a known interstitial.
  const challenged = /just a moment|cf-browser-verification|enable javascript/i.test(html) && html.length < 6000;

  const chatVendor = CHAT_VENDORS.find(([, re]) => re.test(html))?.[0] ?? null;
  const hasWhatsAppBot = WA_BOT_VENDORS.test(html);
  const waMatch = html.match(/wa\.me\/(\d{6,})|api\.whatsapp\.com\/send\?phone=(\d{6,})/i);
  const whatsapp = waMatch ? (waMatch[1] || waMatch[2]) : null;
  const igMatch = html.match(/instagram\.com\/([A-Za-z0-9_.]{2,40})/i);
  const instagram = igMatch && !/\/(p|reel|explore)\//i.test(igMatch[0]) ? igMatch[1] : null;

  const emails = [...new Set((html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])
    .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e)))].slice(0, 6);
  const phones = [...new Set((html.match(/tel:\+?[0-9 ()\-]{7,}/gi) ?? []).map((t) => t.replace(/^tel:/i, "").trim()))].slice(0, 6);
  const pixels = PIXELS.filter(([, re]) => re.test(html)).map(([n]) => n);

  return {
    reachable: true,
    hasChatbot: !!chatVendor,
    hasWhatsAppBot,
    hasWhatsAppLink: !!whatsapp,
    chatVendor,
    whatsapp,
    instagram,
    emails,
    phones,
    pixels,
    note: challenged ? "SPA/challenge wall — re-run via Playwright for full content" : null,
  };
}
