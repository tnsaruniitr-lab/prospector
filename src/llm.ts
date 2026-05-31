// Minimal Anthropic Messages API client (no SDK). Reads process.env directly so
// this module carries no hard dependency on the zod config — callers that import
// ./config will already have run dotenv, populating process.env.

const ENDPOINT = "https://api.anthropic.com/v1/messages";

export async function llmJson<T = unknown>(
  prompt: string,
  opts: { system?: string; maxTokens?: number } = {},
): Promise<T | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).map((c) => c.text ?? "").join("").trim();
    const start = text.search(/[[{]/);
    if (start < 0) return null;
    return JSON.parse(text.slice(start).replace(/```\s*$/i, "").trim()) as T;
  } catch {
    return null;
  }
}
