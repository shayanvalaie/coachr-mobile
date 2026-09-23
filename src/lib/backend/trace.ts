// TEMPORARY client-side tracing for the sign-in -> league -> lineup walkthrough.
// Forwards events to the backend so both sides land in one ordered timeline.
// Delete this file and its call sites when the walkthrough is done.

const MASK_KEYS = new Set(["password", "newpassword", "currentpassword"]);

// Tokens are deliberately NOT fingerprinted here. The backend sink fingerprints
// every secret with one sha256 before anything touches disk, so leaving them
// raw over this localhost hop is what makes a token render identically on the
// mobile and api rows — fingerprinting on both sides with different algorithms
// produced two unrelated hashes for the same token.
const redact = (value: unknown, key = ""): unknown => {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");

  if (typeof value === "string") {
    if (MASK_KEYS.has(normalized)) return "***";
    return value;
  }

  if (Array.isArray(value)) return value.map((item) => redact(item, key));

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redact(v, k)]),
    );
  }

  return value;
};

let traceBaseUrl: string | null = null;

export const setTraceBaseUrl = (baseUrl: string) => {
  traceBaseUrl = baseUrl;
};

export const trace = (stage: string, fields: Record<string, unknown> = {}) => {
  if (!__DEV__ || !traceBaseUrl) return;

  const body = JSON.stringify({ stage, ...(redact(fields) as object) });
  console.log(`[trace] ${stage}`);

  // Fire-and-forget: raw fetch, never requestJson, or tracing would trace itself.
  void fetch(`${traceBaseUrl}/debug/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // Tracing must never break the flow it is observing.
  });
};
