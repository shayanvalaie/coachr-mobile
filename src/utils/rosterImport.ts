import AsyncStorage from "@react-native-async-storage/async-storage";
import { Player } from "../types/lineup";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export type ImportPlayer = Omit<Player, "id" | "rulesContext">;
export type ImportRow = { sourceRow: number; player: ImportPlayer };
export type ImportPreview = {
  worksheet: string;
  rulesContext?: string;
  rows: ImportRow[];
  issues: Array<{ sourceRow: number; column: string; code: string; message: string }>;
  emptySourceRows: number[];
};
export type ImportCommitResult = {
  operationId: string; committed: true; replayed: boolean;
  createdPlayerIds: string[]; createdCount: number; skippedSourceRows: number[];
};
export type PendingRosterImport = {
  accountId: string; teamId: string; operationId: string;
  rows: ImportRow[]; rulesContext?: string; attempted: boolean;
};
export type ImportPreviewApi = (teamId: string, payload: { fileName: string; base64Data: string }, options?: { signal?: AbortSignal }) => Promise<ImportPreview>;


export class RosterImportError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "RosterImportError"; }
}
const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new RosterImportError("CANCELLED", "Import canceled.");
};
const invalid = () => new RosterImportError("IMPORT_INVALID_ROWS", "The import preview could not be read. Choose the file again.");

let pickerRecovery: Promise<void> | null = null;
export const recoverRosterImportFiles = (): Promise<void> => {
  if (pickerRecovery) return pickerRecovery;
  pickerRecovery = (async () => {
    const FileSystem = await import("expo-file-system/legacy");
    if (!FileSystem.cacheDirectory) return;
    try {
      await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}DocumentPicker/`, { idempotent: true });
    } catch {
      throw new RosterImportError("IMPORT_CLEANUP_FAILED", "Temporary import files could not be cleared. Try again.");
    }
  })().catch(error => {
    pickerRecovery = null;
    throw error;
  });
  return pickerRecovery;
};

export const validateImportPreview = (value: ImportPreview): ImportPreview => {
  if (!value || typeof value.worksheet !== "string" || value.worksheet.length > 256 || !Array.isArray(value.rows) || value.rows.length > 200 || !Array.isArray(value.issues) || value.issues.length > 200 || !Array.isArray(value.emptySourceRows) || value.emptySourceRows.length > 200) throw invalid();
  if (value.rulesContext !== undefined && (typeof value.rulesContext !== "string" || !value.rulesContext || value.rulesContext.length > 256)) throw invalid();
  const sourceRows = new Set<number>();
  for (const row of value.rows) {
    const player = row.player;
    if (!Number.isInteger(row.sourceRow) || row.sourceRow < 2 || row.sourceRow > 201 || sourceRows.has(row.sourceRow) || !player || typeof player.name !== "string" || !player.name.trim() || player.name.length > 120 || !["male", "female"].includes(player.gender) || !Array.isArray(player.desiredPositions) || player.desiredPositions.length > 32 || player.desiredPositions.some(slot => typeof slot !== "string" || !slot.trim() || slot.length > 256) || typeof player.fixedAllGame !== "boolean" || typeof player.lockInPosition !== "boolean" || typeof player.benched !== "boolean") throw invalid();
    sourceRows.add(row.sourceRow);
  }
  for (const issue of value.issues) {
    if (!Number.isInteger(issue.sourceRow) || issue.sourceRow < 1 || issue.sourceRow > 201 || typeof issue.column !== "string" || issue.column.length > 32 || typeof issue.code !== "string" || issue.code.length > 64 || typeof issue.message !== "string" || issue.message.length > 256) throw invalid();
  }
  if (value.emptySourceRows.some(row => !Number.isInteger(row) || row < 2 || row > 201)) throw invalid();
  return value;
};

export const decodedBase64Size = (value: string): number => {
  if (value.length > Math.ceil((MAX_IMPORT_BYTES + 1) / 3) * 4) throw new RosterImportError("IMPORT_LIMIT_EXCEEDED", "Source file exceeds 2 MiB.");
  if (value.length % 4 !== 0) throw new RosterImportError("IMPORT_INVALID_FILE", "The selected file could not be read.");
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  for (let index = 0; index < value.length - padding; index += 1) {
    const char = value.charCodeAt(index);
    if (!((char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 48 && char <= 57) || char === 43 || char === 47)) throw new RosterImportError("IMPORT_INVALID_FILE", "The selected file could not be read.");
  }
  return value.length / 4 * 3 - padding;
};

export const pickRosterImportPreview = async (teamId: string, preview: ImportPreviewApi, signal?: AbortSignal): Promise<ImportPreview | null> => {
  aborted(signal);
  await recoverRosterImportFiles();
  aborted(signal);
  const DocumentPicker = await import("expo-document-picker");
  const FileSystem = await import("expo-file-system/legacy");
  aborted(signal);
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "application/octet-stream"] });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  try {
    aborted(signal);
    if (!/\.(xlsx|xls|csv)$/i.test(asset.name)) throw new RosterImportError("IMPORT_INVALID_FILE", "Choose an .xlsx, .xls, or .csv roster.");
    if (asset.size !== undefined && asset.size > MAX_IMPORT_BYTES) throw new RosterImportError("IMPORT_LIMIT_EXCEEDED", "Source file exceeds 2 MiB.");
    const info = await FileSystem.getInfoAsync(asset.uri);
    aborted(signal);
    if (!info.exists || info.size === undefined || !Number.isFinite(info.size) || info.size < 0) throw new RosterImportError("IMPORT_INVALID_FILE", "The file size could not be checked. Save a local copy and try again.");
    if (info.size > MAX_IMPORT_BYTES) throw new RosterImportError("IMPORT_LIMIT_EXCEEDED", "Source file exceeds 2 MiB.");
    const rawBase64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64", position: 0, length: MAX_IMPORT_BYTES + 1 });
    const base64Data = rawBase64.replace(/\s/g, "");
    aborted(signal);
    if (decodedBase64Size(base64Data) > MAX_IMPORT_BYTES) throw new RosterImportError("IMPORT_LIMIT_EXCEEDED", "Source file exceeds 2 MiB.");
    if (decodedBase64Size(base64Data) !== info.size) throw new RosterImportError("IMPORT_INVALID_FILE", "The file changed or could not be read completely. Save a local copy and try again.");
    const { parseRosterFile } = await import("./rosterFileParser");
    const local = parseRosterFile(asset.name, base64Data);
    if (local) return validateImportPreview(local);
    const result = await preview(teamId, { fileName: asset.name, base64Data }, { signal });
    aborted(signal);
    return validateImportPreview(result);
  } finally {
    if (FileSystem.cacheDirectory && asset.uri.startsWith(`${FileSystem.cacheDirectory}DocumentPicker/`)) {
      await FileSystem.deleteAsync(asset.uri, { idempotent: true });
    }
  }
};

const deletedAccounts = new Set<string>();
const storageOperations = new Map<string, Promise<void>>();
const serializeStorage = (accountId: string, action: () => Promise<void>): Promise<void> => {
  const previous = storageOperations.get(accountId) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(action);
  storageOperations.set(accountId, operation);
  return operation.finally(() => { if (storageOperations.get(accountId) === operation) storageOperations.delete(accountId); });
};
const pendingKey = (accountId: string) => `coachr.roster-import.${accountId}`;
export const savePendingRosterImport = (pending: PendingRosterImport): Promise<void> => serializeStorage(pending.accountId, async () => {
  if (deletedAccounts.has(pending.accountId)) throw new RosterImportError("CANCELLED", "The account was deleted.");
  validateImportPreview({ worksheet: "pending", rows: pending.rows, issues: [], emptySourceRows: [] });
  await AsyncStorage.setItem(pendingKey(pending.accountId), JSON.stringify(pending));
  if (deletedAccounts.has(pending.accountId)) {
    await AsyncStorage.removeItem(pendingKey(pending.accountId));
    throw new RosterImportError("CANCELLED", "The account was deleted.");
  }
});
export const loadPendingRosterImport = async (accountId: string): Promise<PendingRosterImport | null> => {
  await storageOperations.get(accountId);
  const stored = await AsyncStorage.getItem(pendingKey(accountId));
  if (stored === null) return null;
  try {
    const pending = JSON.parse(stored) as PendingRosterImport;
    if (typeof pending.attempted !== "boolean" || pending.accountId !== accountId || typeof pending.teamId !== "string" || !/^[0-9a-f-]{36}$/i.test(pending.operationId)) throw invalid();
    validateImportPreview({ worksheet: "pending", rows: pending.rows, issues: [], emptySourceRows: [] });
    if (pending.rulesContext !== undefined && (typeof pending.rulesContext !== "string" || pending.rulesContext.length > 256)) throw invalid();
    return pending;
  } catch {
    await AsyncStorage.removeItem(pendingKey(accountId));
    throw invalid();
  }
};
export const clearPendingRosterImport = (accountId: string, options: { deleted?: boolean } = {}): Promise<void> => {
  if (options.deleted) deletedAccounts.add(accountId);
  return serializeStorage(accountId, () => AsyncStorage.removeItem(pendingKey(accountId)));
};
