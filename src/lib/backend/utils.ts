import { BackendSession } from "./types";

const extractValidationMessage = (detail: unknown): string | null => {
  if (!Array.isArray(detail) || detail.length === 0) return null;

  const first = detail[0];
  if (!first || typeof first !== "object") return null;

  const msg = "msg" in first ? (first as { msg?: unknown }).msg : null;
  const loc = "loc" in first ? (first as { loc?: unknown }).loc : null;

  const normalizedMsg = typeof msg === "string" ? msg.trim() : "";
  if (!normalizedMsg) return null;

  if (Array.isArray(loc)) {
    const field = loc
      .filter((part) => typeof part === "string")
      .filter((part) => part !== "body")
      .join(".");

    if (field) return `${field}: ${normalizedMsg}`;
  }

  return normalizedMsg;
};

export const hasHttpStatus = (err: unknown, expectedStatus: number): boolean => {
  if (!err || typeof err !== "object") return false;
  const context = (err as { context?: unknown }).context;
  if (!context || typeof context !== "object") return false;
  return (context as { status?: unknown }).status === expectedStatus;
};

export const toError = (value: unknown, fallback = "Unexpected error") => {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);

  const message =
    value && typeof value === "object" && "message" in value
      ? String((value as { message?: unknown }).message)
      : fallback;
  const error = new Error(message);

  if (value && typeof value === "object" && "context" in value) {
    (error as { context?: unknown }).context = (value as { context?: unknown }).context;
  }

  return error;
};

export const toApiError = async (res: Response, fallbackMessage = "Request failed") => {
  const raw = await res.text();
  let parsed: unknown = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      parsed = raw;
    }
  }

  const detail =
    parsed && typeof parsed === "object"
      ? (parsed as { detail?: unknown }).detail
      : null;
  // FastAPI errors carry either a plain-string detail or a structured object
  // ({ code, message, ... }); surface the message in both shapes.
  const detailMessage =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? (detail as { message?: unknown }).message
      : detail;
  const messageFromBody =
    parsed && typeof parsed === "object" && "error" in parsed
      ? (parsed as { error?: unknown }).error
      : detailMessage;

  const validationMessage = extractValidationMessage(
    parsed && typeof parsed === "object" ? (parsed as { detail?: unknown }).detail : null,
  );

  const message =
    typeof messageFromBody === "string" && messageFromBody.trim().length > 0
      ? messageFromBody
      : validationMessage ?? `${fallbackMessage} (${res.status})`;

  const error = new Error(message);
  (error as { context?: unknown }).context = {
    status: res.status,
    statusText: res.statusText,
    body: parsed,
  };

  return error;
};

// The backend rejects saving a lineup identical to one already in history for
// the same game context with a 409 carrying a `duplicate_lineup` code and the
// existing lineup's id, so callers can route the user to it. Older backends
// send a plain-string detail; recognize those too, just without an id.
export const getDuplicateLineupError = (
  err: unknown,
): { lineupId: string | null } | null => {
  if (!hasHttpStatus(err, 409)) return null;

  const context = (err as { context?: unknown }).context;
  const body =
    context && typeof context === "object"
      ? (context as { body?: unknown }).body
      : null;
  const detail =
    body && typeof body === "object"
      ? (body as { detail?: unknown }).detail
      : null;

  if (
    detail &&
    typeof detail === "object" &&
    (detail as { code?: unknown }).code === "duplicate_lineup"
  ) {
    const id = (detail as { duplicateLineupId?: unknown }).duplicateLineupId;
    return { lineupId: typeof id === "string" && id ? id : null };
  }

  if (/already exists/i.test(toError(err).message)) {
    return { lineupId: null };
  }

  return null;
};

export const parseJwtClaims = (
  token: string,
): { exp?: number; sub?: string; email?: string } | null => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (_err) {
    return null;
  }
};

export const shouldRefreshSession = (session: BackendSession | null): boolean => {
  if (!session?.expiresAt) return false;
  const now = Math.floor(Date.now() / 1000);
  return session.expiresAt - now < 60;
};
