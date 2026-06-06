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

  const messageFromBody =
    parsed && typeof parsed === "object"
      ? ("error" in parsed
          ? (parsed as { error?: unknown }).error
          : "detail" in parsed
            ? (parsed as { detail?: unknown }).detail
            : null)
      : null;

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
