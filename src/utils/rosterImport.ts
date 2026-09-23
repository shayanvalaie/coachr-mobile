import * as DocumentPicker from "expo-document-picker";
import { Player } from "../types/lineup";
import { buildPlayersFromRows } from "./lineupGenerator";
import { findDuplicatePlayerNames } from "./playerNames";

const FileSystem = require("expo-file-system/legacy") as {
  readAsStringAsync: (
    uri: string,
    options: {
      encoding: string;
    },
  ) => Promise<string>;
};

const SPREADSHEET_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/octet-stream",
];

// Opens the document picker and parses the chosen spreadsheet into players.
// Resolves null when the coach cancels; throws a user-facing Error when the
// file can't be read or holds nothing usable.
export const pickRosterFromSpreadsheet = async (): Promise<Player[] | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: SPREADSHEET_TYPES,
  });
  if (result.canceled || !result.assets?.length) return null;

  let players: Player[];
  try {
    const asset = result.assets[0];
    const fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: "base64",
    });
    // xlsx is ~800 KB and only needed here; load it on first import instead
    // of at app launch.
    const XLSX = require("xlsx") as typeof import("xlsx");
    const workbook = XLSX.read(fileBase64, { type: "base64" });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    players = buildPlayersFromRows(rows);
  } catch (_err) {
    throw new Error(
      "Unable to read the file. Make sure it is a valid Excel or CSV spreadsheet.",
    );
  }

  if (players.length === 0) {
    throw new Error("No players found in the uploaded file.");
  }

  const duplicateNames = findDuplicatePlayerNames(players);
  if (duplicateNames.length > 0) {
    throw new Error(
      `Duplicate player names found in sheet: ${duplicateNames.join(", ")}.`,
    );
  }

  return players;
};
