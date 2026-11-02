// Explicitly enabled local diagnostics. No network, console, or persistent writes.
export const TRACE_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_TRACE === "true";
export const MAX_TRACE_RECORDS = 100;

const STAGES = new Set([
  "session INITIAL_SESSION", "session SIGNED_IN", "session SIGNED_OUT", "session TOKEN_REFRESHED",
  "request GET", "request HEAD", "request POST", "request PUT", "request PATCH", "request DELETE", "request OPTIONS",
  "response", "wizard rules mode", "wizard join league", "wizard create league submit",
  "wizard create league ok", "wizard create league failed", "wizard own rules submit",
  "leagues screen create submit", "leagues screen create failed",
]);
const NUMBER_FIELDS = ["segmentCount", "playersOnField", "elapsedMs", "retryCount", "count"];
const BOOLEAN_FIELDS = ["signedIn", "confirmDistinct", "anyLeaguesExist"];
const ENUM_FIELDS: Record<string, ReadonlySet<string>> = {
  method: new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
  event: new Set(["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED"]),
  rulesMode: new Set(["join", "create", "own"]),
};
const RULESET_STATUSES = new Set(["active", "baking", "review", "rejected"]);
const UUID_PATTERN = /^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/;
const STRING_FIELDS: Record<string, RegExp> = {
  leagueId: UUID_PATTERN,
  rulesetId: UUID_PATTERN,
  requestId: /^[A-Za-z0-9_-]{1,64}$/,
  errorCode: /^[A-Z][A-Z0-9_]{0,63}$/,
};

type Metadata = Record<string, string | number | boolean>;
export type TraceRecord = { timestamp: number; stage: string; fields: Metadata };
const records: TraceRecord[] = [];

const dataField = (fields: Record<string, unknown>, key: string): unknown => {
  // Do not evaluate getters or traverse arbitrary payload objects for diagnostics.
  const descriptor = Object.getOwnPropertyDescriptor(fields, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
};

const metadata = (fields: Record<string, unknown>): Metadata => {
  const result: Metadata = {};
  for (const key of NUMBER_FIELDS) {
    const value = dataField(fields, key);
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) {
      result[key] = value;
    }
  }
  for (const key of BOOLEAN_FIELDS) {
    const value = dataField(fields, key);
    if (typeof value === "boolean") result[key] = value;
  }
  for (const [key, allowed] of Object.entries(ENUM_FIELDS)) {
    const value = dataField(fields, key);
    if (typeof value === "string" && allowed.has(value)) result[key] = value;
  }
  for (const [key, pattern] of Object.entries(STRING_FIELDS)) {
    const value = dataField(fields, key);
    if (typeof value === "string" && pattern.test(value)) result[key] = value;
  }
  const status = dataField(fields, "status");
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
    result.status = status;
  } else if (typeof status === "string" && RULESET_STATUSES.has(status)) {
    result.status = status;
  }
  return result;
};

export const trace = (
  stage: string,
  fields: Record<string, unknown> | (() => Record<string, unknown>) = {},
): void => {
  if (!TRACE_ENABLED || !STAGES.has(stage)) return;
  try {
    const safeFields = metadata(typeof fields === "function" ? fields() : fields);
    records.push({ timestamp: Date.now(), stage, fields: safeFields });
    if (records.length > MAX_TRACE_RECORDS) records.shift();
  } catch {
    // Optional diagnostic data must not interrupt the action being observed.
  }
};

export const readTraceRecords = (): TraceRecord[] =>
  records.map(record => ({ ...record, fields: { ...record.fields } }));

export const clearTraceRecords = (): void => {
  records.length = 0;
};
