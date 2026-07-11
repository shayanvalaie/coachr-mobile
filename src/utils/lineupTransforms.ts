// Pure lineup data helpers shared by the lineup screens. No React imports —
// everything here is a plain function of its inputs.

import { BackendGame } from "../lib/backend/types";
import { InningAssignment } from "../types/lineup";
import { parseTeamRulesConfig } from "../types/rules";

export const normalizeLineupRows = (rows: any[]): InningAssignment[] => {
  if (!Array.isArray(rows)) return [];

  const parsed = rows.map((row, idx) => {
    const positionsInput =
      row && typeof row.positions === "object" ? row.positions : {};
    const assignment = Object.entries(positionsInput).reduce(
      (acc, [slot, value]) => {
        const key = String(slot).trim();
        if (!key) return acc;
        if (typeof value === "string" && value.trim()) {
          acc[key] = value.trim();
        } else if (value == null) {
          acc[key] = null;
        } else {
          acc[key] = String(value);
        }
        return acc;
      },
      {} as Record<string, string | null>,
    );

    const inning =
      typeof row?.inning === "number" && Number.isFinite(row.inning)
        ? row.inning
        : idx + 1;
    const bench = Array.isArray(row?.bench)
      ? row.bench
          .filter((name: unknown) => typeof name === "string")
          .map((name: string) => name.trim())
          .filter(Boolean)
      : [];
    const droppedPosition =
      typeof row?.droppedPosition === "string"
        ? row.droppedPosition
        : undefined;

    return { inning, positions: assignment, bench, droppedPosition };
  });

  return parsed.sort((a, b) => a.inning - b.inning);
};

export const extractRowsFromResponse = (payload: unknown): any[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;
  const keys = ["rows", "lineup", "lineUp", "innings", "assignments"];

  for (const key of keys) {
    if (Array.isArray(obj[key])) {
      return obj[key] as any[];
    }
  }

  return [];
};

export const describeInvokeError = async (
  err: unknown,
): Promise<{ message: string; detail: string }> => {
  if (!err || typeof err !== "object") {
    return { message: "Unknown error", detail: "" };
  }

  const message =
    typeof (err as { message?: unknown }).message === "string"
      ? ((err as { message?: string }).message ?? "Unknown error")
      : "Unknown error";
  const context = (err as { context?: unknown }).context;

  if (!context) {
    return { message, detail: "" };
  }

  const detailParts: string[] = [];
  const status =
    typeof (context as { status?: unknown }).status === "number"
      ? (context as { status: number }).status
      : null;
  const statusText =
    typeof (context as { statusText?: unknown }).statusText === "string"
      ? (context as { statusText: string }).statusText
      : "";

  if (status) {
    detailParts.push(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
  }

  try {
    detailParts.push(JSON.stringify(context));
  } catch (_err) {
    // Best effort only.
  }

  return { message, detail: detailParts.filter(Boolean).join(" - ") };
};

export const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatGameLabel = (game: BackendGame): string => {
  const opponent = game.opponentName?.trim();
  const title = game.title?.trim();
  const head = title || (opponent ? `vs ${opponent}` : "Game");
  const date = new Date(game.scheduledAt);
  const suffix = Number.isNaN(date.getTime())
    ? ""
    : ` · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return `${head}${suffix}`;
};

export const buildPositionMap = (rows: InningAssignment[]) => {
  const map = new Map<string, string>();
  rows.forEach((row) => {
    Object.entries(row.positions).forEach(([slot, name]) => {
      if (!name) return;
      map.set(`${row.inning}:${slot}`, name);
    });
  });
  return map;
};

export const buildBenchMap = (rows: InningAssignment[]) => {
  const map = new Map<number, string[]>();
  rows.forEach((row) => {
    map.set(
      row.inning,
      [...row.bench]
        .map((name) => name.trim())
        .filter(Boolean)
        .sort(),
    );
  });
  return map;
};

export const summarizeLineupComparison = (
  baseRows: InningAssignment[],
  nextRows: InningAssignment[],
): string => {
  const basePositions = buildPositionMap(baseRows);
  const nextPositions = buildPositionMap(nextRows);
  const allPositionKeys = new Set([
    ...basePositions.keys(),
    ...nextPositions.keys(),
  ]);

  let positionChanges = 0;
  allPositionKeys.forEach((key) => {
    if ((basePositions.get(key) ?? "") !== (nextPositions.get(key) ?? "")) {
      positionChanges += 1;
    }
  });

  const baseBench = buildBenchMap(baseRows);
  const nextBench = buildBenchMap(nextRows);
  const innings = new Set([...baseBench.keys(), ...nextBench.keys()]);
  let benchChanges = 0;
  innings.forEach((inning) => {
    if (
      JSON.stringify(baseBench.get(inning) ?? []) !==
      JSON.stringify(nextBench.get(inning) ?? [])
    ) {
      benchChanges += 1;
    }
  });

  return `${positionChanges} position changes, ${benchChanges} bench changes`;
};

export const toLineupRowsPayload = (
  rows: InningAssignment[],
): Record<string, unknown>[] =>
  rows.map((row) => ({
    inning: row.inning,
    positions: row.positions,
    bench: row.bench,
    droppedPosition: row.droppedPosition ?? null,
  }));

export const cloneLineupRows = (rows: InningAssignment[]): InningAssignment[] =>
  rows.map((row) => ({
    inning: row.inning,
    positions: { ...row.positions },
    bench: [...row.bench],
    droppedPosition: row.droppedPosition,
  }));

export const validateEditedLineupForSave = (
  rows: InningAssignment[],
  rulesConfig: ReturnType<typeof parseTeamRulesConfig>,
  rosterNames: Set<string>,
): string | null => {
  if (rows.length !== rulesConfig.segmentCount) {
    return `This lineup has ${rows.length} innings, but your rules require ${rulesConfig.segmentCount}.`;
  }

  const expectedSlots =
    rulesConfig.lineupSlots.length > 0
      ? rulesConfig.lineupSlots
      : Array.from(
          { length: rulesConfig.playersOnField },
          (_unused, idx) => `Slot ${idx + 1}`,
        );

  if (expectedSlots.length !== rulesConfig.playersOnField) {
    return "Rules configuration is invalid: lineup slots must match players on field.";
  }

  if (rosterNames.size < rulesConfig.playersOnField) {
    return `Roster has ${rosterNames.size} players, but rules require ${rulesConfig.playersOnField} on field.`;
  }

  for (const row of rows) {
    const assignedNames: string[] = [];
    const missingSlots: string[] = [];

    expectedSlots.forEach((slot) => {
      const value = row.positions[slot];
      if (typeof value === "string" && value.trim()) {
        assignedNames.push(value.trim());
      } else {
        missingSlots.push(slot);
      }
    });

    if (missingSlots.length > 0) {
      const maxBench = Math.max(
        rosterNames.size - rulesConfig.playersOnField,
        0,
      );
      const onFieldCount = assignedNames.length;
      const benchCount = row.bench.length;
      const missingLabel = missingSlots.length === 1 ? "slot is" : "slots are";
      return `Inning ${row.inning}: ${onFieldCount} on field, ${benchCount} benched. You need ${rulesConfig.playersOnField} on field (max ${maxBench} benched). ${missingSlots.length} field ${missingLabel} empty (${missingSlots.join(", ")}).`;
    }

    const normalized = assignedNames.map((name) => name.toLowerCase());
    const duplicates = normalized.filter(
      (name, idx) => normalized.indexOf(name) !== idx,
    );
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      return `Inning ${row.inning} has duplicate player assignments: ${uniqueDuplicates.join(", ")}.`;
    }

    const unknownPlayers = assignedNames.filter(
      (name) => !rosterNames.has(name.toLowerCase()),
    );
    if (unknownPlayers.length > 0) {
      return `Inning ${row.inning} includes players not in roster: ${unknownPlayers.join(", ")}.`;
    }
  }

  return null;
};

export const normalizeBenchNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  names.forEach((name) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(cleaned);
  });
  return normalized;
};
