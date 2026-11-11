import { strFromU8, unzipSync } from "fflate";
import type { ImportPreview, ImportRow } from "./rosterImport";

// On-device port of the backend's roster parser (backend app/imports/parser.py).
// Parsing locally skips the isolated-runner round trip, which spins up a VM per
// file. The commit endpoint re-validates every row server-side.

const MAX_ROWS = 200;
const MAX_COLUMNS = 32;
const MAX_CELL_CHARS = 256;
const MAX_ENTRIES = 128;
const MAX_EXPANDED_BYTES = 16 * 1024 * 1024;

export class RosterFileError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RosterFileError";
  }
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const base64ToBytes = (value: string): Uint8Array => {
  const lookup = new Uint8Array(128);
  for (let index = 0; index < BASE64.length; index += 1) lookup[BASE64.charCodeAt(index)] = index;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let out = 0;
  for (let index = 0; index < value.length; index += 4) {
    const chunk =
      (lookup[value.charCodeAt(index)] << 18) |
      (lookup[value.charCodeAt(index + 1)] << 12) |
      (lookup[value.charCodeAt(index + 2)] << 6) |
      lookup[value.charCodeAt(index + 3)];
    if (out < bytes.length) bytes[out++] = (chunk >> 16) & 255;
    if (out < bytes.length) bytes[out++] = (chunk >> 8) & 255;
    if (out < bytes.length) bytes[out++] = chunk & 255;
  }
  return bytes;
};

const checkDimensions = (rows: number, columns: number) => {
  if (rows > MAX_ROWS + 1) throw new RosterFileError("IMPORT_LIMIT_EXCEEDED", `Spreadsheet exceeds ${MAX_ROWS} data rows plus a header.`);
  if (columns > MAX_COLUMNS) throw new RosterFileError("IMPORT_LIMIT_EXCEEDED", `Spreadsheet exceeds ${MAX_COLUMNS} columns.`);
};

const checkCell = (text: string): string => {
  if (text.length > MAX_CELL_CHARS) throw new RosterFileError("IMPORT_LIMIT_EXCEEDED", `A cell exceeds ${MAX_CELL_CHARS} characters.`);
  if (text.includes("\u0000")) throw new RosterFileError("IMPORT_INVALID_FILE", "Spreadsheet contains invalid text.");
  return text;
};

const decodeXml = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return String.fromCodePoint(code);
  });

// Concatenates every <t> run, ignoring phonetic (<rPh>) annotations.
const textRuns = (xml: string): string => {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetic.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) text += decodeXml(match[1] ?? "");
  return text;
};

const attribute = (tag: string, name: string): string | undefined => {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
};

const columnIndex = (reference: string): number => {
  const letters = reference.match(/^[A-Z]{1,3}/);
  if (!letters) throw new RosterFileError("IMPORT_INVALID_FILE", "Invalid worksheet cell reference.");
  let index = 0;
  for (const letter of letters[0]) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
};

const firstSheetPath = (files: Record<string, Uint8Array>): { name: string; path: string } => {
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const sheetTag = workbook.match(/<sheet\b[^>]*>/);
  if (!sheetTag) throw new RosterFileError("IMPORT_INVALID_FILE", "Workbook has no worksheet.");
  const relationId = attribute(sheetTag[0], "r:id");
  const relationships = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const relation = [...relationships.matchAll(/<Relationship\b[^>]*>/g)].find(match => attribute(match[0], "Id") === relationId);
  const target = relation ? attribute(relation[0], "Target") : undefined;
  if (!target) throw new RosterFileError("IMPORT_INVALID_FILE", "Workbook has no worksheet.");
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  return { name: attribute(sheetTag[0], "name") ?? "Sheet1", path };
};

const parseXlsx = (data: Uint8Array): { worksheet: string; rows: string[][] } => {
  let entries = 0;
  let expanded = 0;
  const files = unzipSync(data, {
    filter: file => {
      entries += 1;
      expanded += file.originalSize;
      if (entries > MAX_ENTRIES) throw new RosterFileError("IMPORT_LIMIT_EXCEEDED", `Workbook exceeds ${MAX_ENTRIES} archive entries.`);
      if (expanded > MAX_EXPANDED_BYTES) throw new RosterFileError("IMPORT_LIMIT_EXCEEDED", "Workbook expands beyond 16 MiB.");
      return file.name.startsWith("xl/") && file.name.endsWith(".xml") || file.name === "xl/_rels/workbook.xml.rels";
    },
  });
  if (!files["xl/workbook.xml"]) throw new RosterFileError("IMPORT_INVALID_FILE", "File is not an XLSX workbook.");
  const sheet = firstSheetPath(files);
  const sheetXml = files[sheet.path] ? strFromU8(files[sheet.path]) : null;
  if (sheetXml === null) throw new RosterFileError("IMPORT_INVALID_FILE", "Workbook has no worksheet.");
  if (/<f\b/.test(sheetXml)) throw new RosterFileError("IMPORT_INVALID_FILE", "Replace formula cells with plain values before importing.");

  const sharedXml = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => textRuns(match[1]));

  const rows: string[][] = [];
  let rowCount = 0;
  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    rowCount += 1;
    const declared = attribute(rowMatch[0], "r");
    const rowNumber = declared === undefined ? rowCount : Number(declared);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new RosterFileError("IMPORT_INVALID_FILE", "Invalid worksheet row reference.");
    checkDimensions(rowNumber, 0);
    rowCount = rowNumber;
    const cells: string[] = [];
    let cellCount = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[0];
      const reference = attribute(tag, "r");
      const column = reference === undefined ? cellCount : columnIndex(reference);
      cellCount = column + 1;
      checkDimensions(rowNumber, cellCount);
      const body = cellMatch[2] ?? "";
      const type = attribute(tag, "t");
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let text = "";
      if (type === "inlineStr") text = textRuns(body);
      else if (raw === undefined) text = "";
      else if (type === "s") text = shared[Number(raw)] ?? "";
      else if (type === "b") text = raw === "1" ? "True" : "False";
      else text = decodeXml(raw);
      while (cells.length < column) cells.push("");
      cells[column] = checkCell(text);
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return { worksheet: sheet.name, rows };
};

const decodeUtf16 = (data: Uint8Array, littleEndian: boolean): string => {
  let text = "";
  for (let index = 2; index + 1 < data.length; index += 2) {
    text += String.fromCharCode(littleEndian ? data[index] | (data[index + 1] << 8) : (data[index] << 8) | data[index + 1]);
  }
  return text;
};

const decodeText = (data: Uint8Array): string => {
  if (data[0] === 0xff && data[1] === 0xfe) return decodeUtf16(data, true);
  if (data[0] === 0xfe && data[1] === 0xff) return decodeUtf16(data, false);
  const hasBom = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf;
  return strFromU8(hasBom ? data.subarray(3) : data);
};

const parseCsv = (data: Uint8Array): { worksheet: string; rows: string[][] } => {
  const text = decodeText(data);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(checkCell(cell));
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    checkDimensions(rows.length, row.length);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") endCell();
    else if (char === "\n") endRow();
    else if (char === "\r") { if (text[index + 1] === "\n") index += 1; endRow(); }
    else cell += char;
  }
  if (quoted) throw new RosterFileError("IMPORT_INVALID_FILE", "Malformed CSV. Check quotes and delimiters.");
  if (cell !== "" || row.length > 0) endRow();
  return { worksheet: "CSV", rows };
};

const normalizeName = (value: string) => value.trim().split(/\s+/).join(" ").toLowerCase();
const TRUTHY = new Set(["true", "yes", "y", "1", "1.0"]);

const previewRows = (worksheet: string, rows: string[][]): ImportPreview => {
  if (rows.length === 0) throw new RosterFileError("IMPORT_INVALID_FILE", "Spreadsheet is empty.");
  const headers = rows[0].map(cell => cell.trim().toLowerCase());
  const column = (...matches: string[]) => {
    const index = headers.findIndex(header => matches.some(match => header.includes(match)));
    return index === -1 ? null : index;
  };
  const nameColumn = column("name", "player");
  if (nameColumn === null) throw new RosterFileError("IMPORT_INVALID_ROWS", "Add a player name column to the first row.");
  const genderColumn = column("gender", "sex");
  const positionsColumn = column("position", "pos");
  const fixedColumn = column("fixed");
  const lockColumn = column("lock");

  const candidates: ImportRow[] = [];
  const issues: ImportPreview["issues"] = [];
  const emptySourceRows: number[] = [];
  const names = new Set<string>();
  rows.slice(1).forEach((row, offset) => {
    const sourceRow = offset + 2;
    if (!row.some(cell => cell.trim())) {
      emptySourceRows.push(sourceRow);
      return;
    }
    const value = (index: number | null) => (index !== null && index < row.length ? row[index].trim() : "");
    const name = value(nameColumn).split(/\s+/).join(" ");
    const key = normalizeName(name);
    if (!key || name.length > 120 || name.startsWith("=")) {
      issues.push({ sourceRow, column: "name", code: "INVALID_NAME", message: "Enter a plain player name of 1 to 120 characters." });
      return;
    }
    if (names.has(key)) {
      issues.push({ sourceRow, column: "name", code: "DUPLICATE_NAME", message: "This player name appears more than once." });
      return;
    }
    names.add(key);
    const positions = [...new Set(value(positionsColumn).split(",").map(part => part.trim().toUpperCase()).filter(Boolean))];
    const gender = value(genderColumn).toLowerCase();
    candidates.push({
      sourceRow,
      player: {
        name,
        gender: gender.startsWith("f") || gender === "woman" ? "female" : "male",
        desiredPositions: positions,
        fixedAllGame: TRUTHY.has(value(fixedColumn).toLowerCase()),
        lockInPosition: TRUTHY.has(value(lockColumn).toLowerCase()) && positions.length === 1,
        benched: false,
      },
    });
  });
  return { worksheet, rows: candidates, issues, emptySourceRows };
};

const isZip = (data: Uint8Array) => data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
const isOle = (data: Uint8Array) => data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0;

// Returns null for legacy .xls, which only the server can parse.
export const parseRosterFile = (fileName: string, base64Data: string): ImportPreview | null => {
  const extension = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (extension === ".xls") return null;
  const data = base64ToBytes(base64Data);
  try {
    if (extension === ".xlsx" && isZip(data)) {
      const sheet = parseXlsx(data);
      return previewRows(sheet.worksheet, sheet.rows);
    }
    if (extension === ".csv" && !isZip(data) && !isOle(data)) {
      const sheet = parseCsv(data);
      return previewRows(sheet.worksheet, sheet.rows);
    }
  } catch (error) {
    if (error instanceof RosterFileError) throw error;
    throw new RosterFileError("IMPORT_INVALID_FILE", "Malformed workbook or CSV. Use an unencrypted file with plain cell values.");
  }
  throw new RosterFileError("IMPORT_INVALID_FILE", "File content does not match its .xlsx, .xls, or .csv extension.");
};
