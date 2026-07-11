import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { requireOptionalNativeModule } from "expo-modules-core";
import GameSetup from "../components/GameSetup";
import LineUp from "../components/LineUp";
import { presentLineupInterstitial } from "../lib/ads/lineupInterstitial";
import { backendClient } from "../lib/backend/client";
import {
  BackendGame,
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
  BackendSession,
} from "../lib/backend/types";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { InningAssignment, Player } from "../types/lineup";
import { LineupLaunchRequest } from "../types/lineupLaunch";
import { parseTeamRulesConfig, TeamRulesConfig } from "../types/rules";
import { generateLineup } from "../utils/lineupGenerator";
import { buildPlayerGenderByName } from "../utils/playerNames";

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenRoster: () => void;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
  launchRequest?: LineupLaunchRequest | null;
  onLaunchRequestHandled?: (requestId: number) => void;
  onEditModeChange?: (editing: boolean) => void;
};

const ORIENTATION_LOCK_PORTRAIT_UP = 3;
const ORIENTATION_LOCK_LANDSCAPE = 5;

type ScreenOrientationNativeModule = {
  lockAsync?: (orientationLock: number) => Promise<void>;
};

const ScreenOrientationModule =
  requireOptionalNativeModule<ScreenOrientationNativeModule>(
    "ExpoScreenOrientation",
  );

const LINEUP_GENERATOR_MODE = (
  process.env.EXPO_PUBLIC_LINEUP_GENERATOR_MODE ?? "fallback"
)
  .trim()
  .toLowerCase();
const USE_LOCAL_LINEUP_GENERATOR = LINEUP_GENERATOR_MODE !== "openai";

const FileSystem = require("expo-file-system/legacy") as {
  cacheDirectory?: string | null;
  documentDirectory?: string | null;
  writeAsStringAsync: (
    uri: string,
    data: string,
    options: {
      encoding: string;
    },
  ) => Promise<void>;
};

const normalizeLineupRows = (rows: any[]): InningAssignment[] => {
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

const extractRowsFromResponse = (payload: unknown): any[] => {
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

const describeInvokeError = async (
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

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatGameLabel = (game: BackendGame): string => {
  const opponent = game.opponentName?.trim();
  const title = game.title?.trim();
  const head = title || (opponent ? `vs ${opponent}` : "Game");
  const date = new Date(game.scheduledAt);
  const suffix = Number.isNaN(date.getTime())
    ? ""
    : ` · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return `${head}${suffix}`;
};

const buildPositionMap = (rows: InningAssignment[]) => {
  const map = new Map<string, string>();
  rows.forEach((row) => {
    Object.entries(row.positions).forEach(([slot, name]) => {
      if (!name) return;
      map.set(`${row.inning}:${slot}`, name);
    });
  });
  return map;
};

const buildBenchMap = (rows: InningAssignment[]) => {
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

const summarizeLineupComparison = (
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

const toLineupRowsPayload = (
  rows: InningAssignment[],
): Record<string, unknown>[] =>
  rows.map((row) => ({
    inning: row.inning,
    positions: row.positions,
    bench: row.bench,
    droppedPosition: row.droppedPosition ?? null,
  }));

const cloneLineupRows = (rows: InningAssignment[]): InningAssignment[] =>
  rows.map((row) => ({
    inning: row.inning,
    positions: { ...row.positions },
    bench: [...row.bench],
    droppedPosition: row.droppedPosition,
  }));

const validateEditedLineupForSave = (
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

const normalizeBenchNames = (names: string[]): string[] => {
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

const LineupScreen = ({
  session,
  onBack,
  onOpenProfile,
  onOpenRoster,
  hasProSubscription,
  onRequirePro,
  launchRequest = null,
  onLaunchRequestHandled,
  onEditModeChange,
}: Props) => {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [games, setGames] = useState<BackendGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [rulesConfig, setRulesConfig] = useState<TeamRulesConfig | null>(null);
  const [lineup, setLineup] = useState<InningAssignment[] | null>(null);
  const [lineupParentVersionId, setLineupParentVersionId] = useState<
    string | null
  >(null);
  const [lineupInlineEditMode, setLineupInlineEditMode] = useState(false);
  const [expandedInnings, setExpandedInnings] = useState<Set<number>>(
    new Set(),
  );
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"build" | "history">("build");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveLineupName, setSaveLineupName] = useState("");
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [lineupHistory, setLineupHistory] = useState<
    BackendLineupVersionSummary[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryDetail, setSelectedHistoryDetail] =
    useState<BackendLineupVersionDetail | null>(null);
  const [historyEditRows, setHistoryEditRows] = useState<
    InningAssignment[] | null
  >(null);
  const [compareBase, setCompareBase] =
    useState<BackendLineupVersionDetail | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [pendingDeleteLineup, setPendingDeleteLineup] =
    useState<BackendLineupVersionSummary | null>(null);
  const [isDeletingLineup, setIsDeletingLineup] = useState(false);
  const [rosterRequirement, setRosterRequirement] = useState<{
    required: number;
    have: number;
    detail: string;
  } | null>(null);
  const [gameSetupCollapsed, setGameSetupCollapsed] = useState(false);
  const [isDraggingLineupRow, setIsDraggingLineupRow] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState<{
    requestId: number;
    gameId: string | null;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saveLineupNameInputRef = useRef<TextInput | null>(null);
  const handledLaunchRequestIdsRef = useRef<Set<number>>(new Set());

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;

    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;

    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadTeamContext = useCallback(async () => {
    try {
      setError(null);
      const team = await ensureTeam();
      if (!team) return;

      const [loadedRoster, loadedRules, loadedGames] = await Promise.all([
        backendClient.getTeamRoster(team),
        backendClient.getTeamRules(team),
        backendClient.getTeamGames(team),
      ]);
      setRoster(loadedRoster);
      setActiveIds(new Set(loadedRoster.map((player) => player.id)));
      setRulesConfig(parseTeamRulesConfig(loadedRules));
      setGames(loadedGames);
      setSelectedGameId((prev) => {
        if (prev && loadedGames.some((game) => game.id === prev)) {
          return prev;
        }
        const nextUpcoming = [...loadedGames]
          .filter((game) => game.status === "scheduled")
          .sort(
            (a, b) =>
              new Date(a.scheduledAt).getTime() -
              new Date(b.scheduledAt).getTime(),
          )[0];
        return nextUpcoming?.id ?? null;
      });
    } catch (_err) {
      setError("Unable to load lineup context.");
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadTeamContext().catch(() => {
      setError("Unable to load lineup context.");
    });
  }, [loadTeamContext]);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!saveModalVisible) return;
    const timer = setTimeout(() => {
      saveLineupNameInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [saveModalVisible]);

  const lockOrientation = useCallback(async (lock: number) => {
    if (Platform.OS === "web") return;
    if (!ScreenOrientationModule?.lockAsync) return;
    try {
      await ScreenOrientationModule.lockAsync(lock);
    } catch (err) {
      console.log("[screen orientation]", err);
    }
  }, []);

  useEffect(
    () => () => {
      lockOrientation(ORIENTATION_LOCK_PORTRAIT_UP);
    },
    [lockOrientation],
  );

  const activePlayers = useMemo(
    () => roster.filter((player) => activeIds.has(player.id)),
    [roster, activeIds],
  );
  const playerGenderByName = useMemo(
    () => buildPlayerGenderByName(roster),
    [roster],
  );

  const handleToggleActive = useCallback((playerId: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const dismissEditModal = useCallback(() => {
    setEditModalVisible(false);
    setSaveModalVisible(false);
    setLineupInlineEditMode(false);
    setHistoryEditRows(null);
    setSelectedHistoryDetail(null);
    setError(null);
    lockOrientation(ORIENTATION_LOCK_PORTRAIT_UP);
    onEditModeChange?.(false);
  }, [lockOrientation, onEditModeChange]);

  const finishInlineEdit = useCallback(() => {
    if (selectedHistoryDetail) {
      setLineupInlineEditMode(false);
      setSaveModalVisible(false);
      setHistoryEditRows(null);
      setActiveTab("history");
      setError(null);
      onEditModeChange?.(false);
      setStatus(`Returned to lineup v${selectedHistoryDetail.versionNumber}.`);
      return;
    }

    dismissEditModal();
  }, [dismissEditModal, onEditModeChange, selectedHistoryDetail]);

  const toggleInlineEditMode = useCallback(async () => {
    if (!lineup) {
      setError("Generate or restore a lineup first.");
      return;
    }
    if (editModalVisible) {
      dismissEditModal();
      return;
    }
    await lockOrientation(ORIENTATION_LOCK_LANDSCAPE);
    setLineupInlineEditMode(true);
    setEditModalVisible(true);
    onEditModeChange?.(true);
    setStatus("Edit mode enabled. Use the wider editor to change positions.");
    setError(null);
  }, [
    dismissEditModal,
    editModalVisible,
    lineup,
    lockOrientation,
    onEditModeChange,
  ]);

  const applyInlinePositionSwap = useCallback(
    (inning: number, playerName: string, targetPosition: string) => {
      const normalizedTarget = targetPosition.trim();
      if (!normalizedTarget) return;

      const normalize = (value: string) => value.trim().toLowerCase();
      const playerKey = normalize(playerName);

      const findSlotForPlayer = (positions: Record<string, string | null>) => {
        return (
          Object.entries(positions).find(([_slot, value]) => {
            if (typeof value !== "string") return false;
            return normalize(value) === playerKey;
          })?.[0] ?? null
        );
      };

      const applySwap = (rows: InningAssignment[] | null) =>
        rows?.map((row) => {
          if (row.inning !== inning) return row;

          const positions = { ...row.positions };
          const bench = [...row.bench];
          const slotOrder = Object.keys(positions);
          const targetIsBench = normalizedTarget === "X";
          const canTargetSlot =
            targetIsBench || slotOrder.includes(normalizedTarget);
          if (!canTargetSlot) return row;

          const currentSlot = findSlotForPlayer(positions);
          const currentBenchIndex = bench.findIndex(
            (name) => normalize(name) === playerKey,
          );
          if (!currentSlot && currentBenchIndex < 0) return row;

          if (targetIsBench) {
            if (!currentSlot) return row;
            positions[currentSlot] = null;
            if (currentBenchIndex < 0) {
              bench.push(playerName);
            }
          } else {
            const occupying = positions[normalizedTarget];
            const occupyingName =
              typeof occupying === "string" ? occupying.trim() : "";
            const occupyingKey = occupyingName ? normalize(occupyingName) : "";
            const isSelfOccupying = occupyingKey && occupyingKey === playerKey;

            if (currentSlot && currentSlot !== normalizedTarget) {
              positions[currentSlot] = null;
            }

            if (occupyingName && !isSelfOccupying) {
              const occupyingBenchIndex = bench.findIndex(
                (name) => normalize(name) === occupyingKey,
              );
              if (occupyingBenchIndex < 0) {
                bench.push(occupyingName);
              }
            }

            positions[normalizedTarget] = playerName;
            if (currentBenchIndex >= 0) {
              bench.splice(currentBenchIndex, 1);
            }
          }

          return {
            ...row,
            positions,
            bench: normalizeBenchNames(bench),
          };
        }) ?? null;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (selectedHistoryDetail) {
        setHistoryEditRows((prev) => applySwap(prev));
      } else {
        setLineup((prev) => applySwap(prev));
      }
      setStatus(
        "Manual edits applied inline. Save lineup if you want to keep this version.",
      );
      setError(null);
    },
    [selectedHistoryDetail],
  );

  const loadLineupHistory = useCallback(
    async (team: string, gameId: string | null) => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const versions = await backendClient.getLineupVersions(team, gameId);
        setLineupHistory(versions);
      } catch (_err) {
        setHistoryError("Unable to load lineup history.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    ensureTeam()
      .then((team) => {
        if (!team) return;
        return loadLineupHistory(team, selectedGameId);
      })
      .catch(() => {
        setHistoryError("Unable to load lineup history.");
      });
  }, [ensureTeam, loadLineupHistory, selectedGameId]);

  const openLineupHistoryDetail = useCallback(
    async (lineupId: string) => {
      try {
        const team = await ensureTeam();
        if (!team) return;
        setError(null);
        setActiveHistoryId(lineupId);
        const detail = await backendClient.getLineupVersion(team, lineupId);
        setSelectedHistoryDetail(detail);
        setHistoryEditRows(null);
        setActiveTab("history");
        await lockOrientation(ORIENTATION_LOCK_LANDSCAPE);
        setEditModalVisible(true);
        setLineupInlineEditMode(false);
        onEditModeChange?.(true);
      } catch (_err) {
        setError("Unable to open lineup details.");
      } finally {
        setActiveHistoryId(null);
      }
    },
    [ensureTeam, lockOrientation, onEditModeChange],
  );

  const confirmDeleteLineup = useCallback(async () => {
    if (!pendingDeleteLineup || isDeletingLineup) return;
    const lineupId = pendingDeleteLineup.id;
    setIsDeletingLineup(true);
    try {
      const team = await ensureTeam();
      if (!team) return;
      await backendClient.deleteLineupVersion(team, lineupId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLineupHistory((prev) => prev.filter((v) => v.id !== lineupId));
      setStatus("Lineup deleted.");
      setError(null);
      setPendingDeleteLineup(null);
    } catch (_err) {
      setError("Unable to delete lineup.");
    } finally {
      setIsDeletingLineup(false);
    }
  }, [ensureTeam, pendingDeleteLineup, isDeletingLineup]);

  const restoreLineupVersion = useCallback(
    async (lineupId: string) => {
      try {
        const team = await ensureTeam();
        if (!team) return;
        setActiveHistoryId(lineupId);
        const detail = await backendClient.getLineupVersion(team, lineupId);
        const restoredRows = normalizeLineupRows(detail.rows as any[]);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLineup(restoredRows);
        setLineupInlineEditMode(false);
        setEditModalVisible(false);
        setLineupParentVersionId(detail.id);
        setHistoryEditRows(null);
        setStatus(`Restored lineup v${detail.versionNumber}.`);
        setActiveTab("build");
        setCompareBase(null);
        setSelectedHistoryDetail(null);
      } catch (_err) {
        setError("Unable to restore lineup version.");
      } finally {
        setActiveHistoryId(null);
      }
    },
    [ensureTeam],
  );

  const compareLineupVersion = useCallback(
    async (lineupId: string) => {
      try {
        const team = await ensureTeam();
        if (!team) return;
        setActiveHistoryId(lineupId);
        const detail = await backendClient.getLineupVersion(team, lineupId);
        const nextRows = normalizeLineupRows(detail.rows as any[]);

        if (!compareBase) {
          setCompareBase(detail);
          setStatus(
            `Selected v${detail.versionNumber} for compare. Pick another version.`,
          );
          return;
        }

        const baseRows = normalizeLineupRows(compareBase.rows as any[]);
        const summary = summarizeLineupComparison(baseRows, nextRows);
        setStatus(
          `Compare v${compareBase.versionNumber} vs v${detail.versionNumber}: ${summary}`,
        );
        setCompareBase(null);
      } catch (_err) {
        setError("Unable to compare lineup versions.");
      } finally {
        setActiveHistoryId(null);
      }
    },
    [compareBase, ensureTeam],
  );

  const exportLineupVersion = useCallback(
    async (lineupId: string, format: "xlsx" | "pdf") => {
      try {
        const team = await ensureTeam();
        if (!team) return;
        setActiveHistoryId(lineupId);

        const exported = await backendClient.exportLineupVersion(
          team,
          lineupId,
          format,
        );
        const baseDir =
          FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!baseDir) {
          throw new Error("No writable directory available for export.");
        }
        const uri = `${baseDir}${Date.now()}-${exported.fileName}`;
        await FileSystem.writeAsStringAsync(uri, exported.base64Data, {
          encoding: "base64",
        });
        await Share.share({
          title: exported.fileName,
          message: `Lineup export: ${exported.fileName}`,
          url: uri,
        });
        setStatus(`${format.toUpperCase()} exported.`);
      } catch (_err) {
        setError(`Unable to export ${format.toUpperCase()}.`);
      } finally {
        setActiveHistoryId(null);
      }
    },
    [ensureTeam],
  );

  const saveCurrentLineupVersion = useCallback(
    async (overrideName?: string) => {
      const isHistoryEdit = !!selectedHistoryDetail;
      const selectedHistoryRowsForSave = selectedHistoryDetail
        ? normalizeLineupRows(selectedHistoryDetail.rows as any[])
        : null;
      const rowsToSave = isHistoryEdit
        ? (historyEditRows ?? selectedHistoryRowsForSave)
        : lineup;
      if (!rowsToSave) {
        setError("Generate a lineup first.");
        return;
      }
      if (rowsToSave.length === 0) {
        setError("No lineup rows available to save.");
        return;
      }
      if (!rulesConfig && !isHistoryEdit) {
        setError("Rules are required before saving lineup versions.");
        return;
      }
      const trimmedName = (overrideName ?? saveLineupName).trim();
      if (!trimmedName) {
        setError("Enter a lineup name before saving.");
        return;
      }

      try {
        const team = await ensureTeam();
        if (!team) return;
        setIsSavingVersion(true);
        setError(null);

        const [rosterForSave, rawRules] = await Promise.all([
          backendClient.getTeamRoster(team),
          backendClient.getTeamRules(team),
        ]);
        const effectiveRulesConfig = parseTeamRulesConfig(rawRules);
        const rosterNames = new Set(
          rosterForSave
            .map((player) => player.name.trim().toLowerCase())
            .filter((name) => name.length > 0),
        );
        const validationError = validateEditedLineupForSave(
          rowsToSave,
          effectiveRulesConfig,
          rosterNames,
        );
        if (validationError) {
          setError(validationError);
          return;
        }

        const rosterPayload = rosterForSave.map((player) => ({
          id: player.id,
          name: player.name,
          gender: player.gender,
          desiredPositions: player.desiredPositions,
          fixedAllGame: false,
          lockInPosition: player.lockInPosition,
        }));

        const historyGameId = selectedHistoryDetail?.gameId ?? null;
        const effectiveGameId = isHistoryEdit ? historyGameId : selectedGameId;
        const game =
          games.find((entry) => entry.id === effectiveGameId) ?? null;
        const fallbackGameTitle = game
          ? game.title.trim() ||
            game.opponentName.trim() ||
            formatGameLabel(game)
          : null;
        const gameTitle = isHistoryEdit
          ? selectedHistoryDetail?.gameTitle || fallbackGameTitle
          : fallbackGameTitle;
        const parentLineupId = isHistoryEdit
          ? (selectedHistoryDetail?.id ?? lineupParentVersionId)
          : lineupParentVersionId;

        const saved = await backendClient.saveLineupVersion({
          teamId: team,
          sport: selectedHistoryDetail?.sport || effectiveRulesConfig.sport,
          roster: rosterPayload,
          gameId: effectiveGameId,
          gameTitle,
          lineupName: trimmedName,
          rows: toLineupRowsPayload(rowsToSave),
          parentLineupId,
          source: parentLineupId ? "manualEdit" : "manualSave",
          rulesConfig: effectiveRulesConfig,
        });

        await loadLineupHistory(team, effectiveGameId);
        setLineupParentVersionId(saved.id);
        if (selectedHistoryDetail) {
          setSelectedHistoryDetail((prev) =>
            prev
              ? {
                  ...prev,
                  ...saved,
                  rows: toLineupRowsPayload(rowsToSave),
                  output: prev.output ?? {},
                }
              : prev,
          );
        }
        setSaveLineupName("");
        setSaveModalVisible(false);
        if (selectedHistoryDetail) {
          setHistoryEditRows(cloneLineupRows(rowsToSave));
          setActiveTab("history");
        }
        setStatus(`Saved ${saved.lineupName || `v${saved.versionNumber}`}.`);
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Unable to save lineup version.";
        setError(message);
      } finally {
        setIsSavingVersion(false);
      }
    },
    [
      ensureTeam,
      games,
      historyEditRows,
      lineup,
      lineupParentVersionId,
      loadLineupHistory,
      rulesConfig,
      saveLineupName,
      selectedHistoryDetail,
      selectedGameId,
    ],
  );

  const runLineupGeneration = useCallback(
    async (overrideGameId?: string | null) => {
      const effectiveGameId =
        overrideGameId === undefined ? selectedGameId : overrideGameId;

      setIsGenerating(true);
      setStatus("Generating...");
      setError(null);

      try {
        const team = await ensureTeam();
        if (!team) {
          setError("Unable to load your team.");
          setStatus("");
          return;
        }
        if (!rulesConfig) {
          setError("No rules configuration found.");
          setStatus("");
          return;
        }

        if (activePlayers.length < rulesConfig.minimumPlayers) {
          setRosterRequirement({
            required: rulesConfig.minimumPlayers,
            have: activePlayers.length,
            detail: `Your rules require at least ${rulesConfig.minimumPlayers} active players to generate a lineup.`,
          });
          setStatus("");
          return;
        }

        if (activePlayers.length < rulesConfig.playersOnField) {
          setRosterRequirement({
            required: rulesConfig.playersOnField,
            have: activePlayers.length,
            detail: `You need at least ${rulesConfig.playersOnField} active players so every ${rulesConfig.segmentLabel} can be filled on the field.`,
          });
          setStatus("");
          return;
        }

        await presentLineupInterstitial(hasProSubscription);

        const fallbackSport = rulesConfig.sport.toLowerCase();
        const canUseLocalFallback = fallbackSport === "softball";

        if (USE_LOCAL_LINEUP_GENERATOR) {
          if (!canUseLocalFallback) {
            setError(
              "Local lineup generator only supports softball. Set EXPO_PUBLIC_LINEUP_GENERATOR_MODE=openai to use AI generation.",
            );
            setStatus("");
            return;
          }

          const fallback = generateLineup(activePlayers);
          if (fallback.error) {
            setError(fallback.error);
            setLineup(null);
            setLineupInlineEditMode(false);
            setEditModalVisible(false);
            setHistoryEditRows(null);
            setLineupParentVersionId(null);
            setExpandedInnings(new Set());
            setStatus("");
            return;
          }

          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setLineup(fallback.lineup ?? null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("Lineup generated locally.");
          setSaveModalVisible(false);
          setSaveLineupName("");
          return;
        }

        const payloadRoster = activePlayers.map((player) => ({
          id: player.id,
          name: player.name,
          gender: player.gender,
          desiredPositions: player.desiredPositions,
          fixedAllGame: false,
          lockInPosition: player.lockInPosition,
        }));

        const data = await backendClient.generateLineup({
          teamId: team,
          sport: rulesConfig.sport,
          roster: payloadRoster,
          gameId: effectiveGameId,
          gameTitle: (() => {
            const game = games.find((entry) => entry.id === effectiveGameId);
            if (!game) return null;
            const baseTitle = game.title.trim() || game.opponentName.trim();
            return baseTitle || formatGameLabel(game);
          })(),
          saveLineup: false,
          lineupName: null,
          rulesConfig,
        });

        const nextLineup = normalizeLineupRows(extractRowsFromResponse(data));
        if (nextLineup.length === 0) {
          throw new Error("AI returned an empty lineup");
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setLineup(nextLineup);
        setLineupInlineEditMode(false);
        setEditModalVisible(false);
        setLineupParentVersionId(null);
        setExpandedInnings(new Set());
        setStatus("Lineup generated. Save it if you like it.");
        setSaveModalVisible(false);
        setSaveLineupName("");
      } catch (invokeErr) {
        const { message, detail } = await describeInvokeError(invokeErr);
        const context =
          invokeErr && typeof invokeErr === "object"
            ? (invokeErr as { context?: unknown }).context
            : null;
        const httpStatus =
          context && typeof context === "object"
            ? (context as { status?: unknown }).status
            : null;

        console.log(
          "[lineup invoke error]",
          message,
          detail ? `(${detail})` : "",
        );

        if (typeof httpStatus === "number") {
          setError(message || "Unable to generate lineup.");
          setLineup(null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("");
          return;
        }

        const fallbackSport = rulesConfig?.sport.toLowerCase() ?? "";
        const canUseLocalFallback = fallbackSport === "softball";

        if (!canUseLocalFallback) {
          setError(message || "Unable to generate lineup right now.");
          setLineup(null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("");
          return;
        }

        const fallback = generateLineup(activePlayers);
        if (fallback.error) {
          setError(fallback.error);
          setLineup(null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("");
        } else {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setLineup(fallback.lineup ?? null);
          setLineupInlineEditMode(false);
          setEditModalVisible(false);
          setHistoryEditRows(null);
          setLineupParentVersionId(null);
          setExpandedInnings(new Set());
          setStatus("Generated locally (AI unavailable).");
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [
      activePlayers,
      ensureTeam,
      hasProSubscription,
      onRequirePro,
      selectedGameId,
      games,
      rulesConfig,
    ],
  );

  useEffect(() => {
    if (!launchRequest) return;
    if (handledLaunchRequestIdsRef.current.has(launchRequest.id)) return;
    handledLaunchRequestIdsRef.current.add(launchRequest.id);

    let cancelled = false;

    const applyLaunchRequest = async () => {
      try {
        setError(null);
        setActiveTab("build");
        setSelectedHistoryDetail(null);
        setHistoryEditRows(null);
        setCompareBase(null);
        setEditModalVisible(false);
        setSaveModalVisible(false);
        setShowPlayerPicker(false);
        setGameSetupCollapsed(false);

        if (launchRequest.gameId !== undefined) {
          setSelectedGameId(launchRequest.gameId);
        }

        if (launchRequest.lineupVersionId) {
          const team = await ensureTeam();
          if (!team || cancelled) return;

          setActiveHistoryId(launchRequest.lineupVersionId);
          const detail = await backendClient.getLineupVersion(
            team,
            launchRequest.lineupVersionId,
          );
          if (cancelled) return;

          const restoredRows = normalizeLineupRows(detail.rows as any[]);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setLineup(restoredRows);
          setLineupParentVersionId(detail.id);
          setExpandedInnings(new Set());
          const shouldStartInEditMode = launchRequest.startInEditMode !== false;
          if (shouldStartInEditMode) {
            await lockOrientation(ORIENTATION_LOCK_LANDSCAPE);
          }
          setLineupInlineEditMode(shouldStartInEditMode);
          setEditModalVisible(shouldStartInEditMode);
          if (shouldStartInEditMode) onEditModeChange?.(true);

          if (detail.gameId) {
            setSelectedGameId(detail.gameId);
          }

          setStatus(
            shouldStartInEditMode
              ? `Editing lineup v${detail.versionNumber} in the wider editor.`
              : `Loaded lineup v${detail.versionNumber}.`,
          );
          return;
        }

        if (launchRequest.autoGenerate) {
          setPendingAutoGenerate({
            requestId: launchRequest.id,
            gameId: launchRequest.gameId,
          });
        }
      } catch (_err) {
        if (!cancelled) {
          setError("Unable to open lineup context.");
        }
      } finally {
        if (!cancelled) {
          setActiveHistoryId(null);
          onLaunchRequestHandled?.(launchRequest.id);
        }
      }
    };

    applyLaunchRequest().catch(() => {
      setError("Unable to open lineup context.");
      onLaunchRequestHandled?.(launchRequest.id);
    });

    return () => {
      cancelled = true;
    };
  }, [ensureTeam, launchRequest, onLaunchRequestHandled]);

  useEffect(() => {
    if (!pendingAutoGenerate) return;
    if (isGenerating) return;
    if (!rulesConfig) return;

    runLineupGeneration(pendingAutoGenerate.gameId).finally(() => {
      setPendingAutoGenerate((prev) =>
        prev && prev.requestId === pendingAutoGenerate.requestId ? null : prev,
      );
    });
  }, [isGenerating, pendingAutoGenerate, rulesConfig, runLineupGeneration]);

  const activeCount = activePlayers.length;
  const isManualEditSave = !!lineupParentVersionId;
  const selectedHistoryRows = useMemo(
    () =>
      selectedHistoryDetail
        ? normalizeLineupRows(selectedHistoryDetail.rows as any[])
        : null,
    [selectedHistoryDetail],
  );
  const showingHistoryDetail = !!selectedHistoryDetail && !lineupInlineEditMode;
  const editModalLineup = lineupInlineEditMode
    ? selectedHistoryDetail
      ? historyEditRows
      : lineup
    : selectedHistoryDetail
      ? selectedHistoryRows
      : lineup;
  const editModalExpandedInnings = showingHistoryDetail
    ? new Set<number>()
    : expandedInnings;
  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  return (
    <View style={styles.screenRoot}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        scrollEnabled={!isDraggingLineupRow}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={onBack}
          >
            <Feather name="arrow-left" size={18} color={palette.text} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerEyebrow}>
              {activeTab === "build" ? "Generate Lineup" : "Lineup History"}
            </Text>
            <Text style={styles.headerTitle}>Line Ups</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.iconButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={onOpenProfile}
          >
            <Feather name="user" size={18} color={palette.text} />
          </Pressable>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            style={[
              styles.tabButton,
              activeTab === "build" && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab("build")}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "build" && styles.tabButtonTextActive,
              ]}
            >
              Generate
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tabButton,
              activeTab === "history" && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab("history")}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === "history" && styles.tabButtonTextActive,
              ]}
            >
              Line Ups
            </Text>
          </Pressable>
        </View>

        {activeTab === "build" ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroSubtext}>
                Active {activeCount} / {roster.length} players
              </Text>
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Sport</Text>
                  <Text style={styles.metricValue}>
                    {rulesConfig?.sport ?? "-"}
                  </Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Innings</Text>
                  <Text style={styles.metricValue}>
                    {rulesConfig
                      ? `${rulesConfig.segmentCount} ${rulesConfig.segmentLabel}`
                      : "-"}
                  </Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>On Field</Text>
                  <Text style={styles.metricValue}>
                    {rulesConfig ? String(rulesConfig.playersOnField) : "-"}
                  </Text>
                </View>
              </View>
            </View>

            {hasProSubscription && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Game Context</Text>
                <Text style={styles.cardSubtext}>
                  {selectedGame
                    ? `Saving versions under ${formatGameLabel(selectedGame)}`
                    : "Saving versions under General lineup history"}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.contextChipRow}>
                    <Pressable
                      style={[
                        styles.contextChip,
                        selectedGameId === null && styles.contextChipActive,
                      ]}
                      onPress={() => setSelectedGameId(null)}
                    >
                      <Text
                        style={[
                          styles.contextChipText,
                          selectedGameId === null &&
                            styles.contextChipTextActive,
                        ]}
                      >
                        General
                      </Text>
                    </Pressable>
                    {games.map((game) => (
                      <Pressable
                        key={game.id ?? game.scheduledAt}
                        style={[
                          styles.contextChip,
                          selectedGameId === game.id &&
                            styles.contextChipActive,
                        ]}
                        onPress={() => setSelectedGameId(game.id ?? null)}
                      >
                        <Text
                          style={[
                            styles.contextChipText,
                            selectedGameId === game.id &&
                              styles.contextChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {formatGameLabel(game)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <GameSetup
              activePlayersCount={activeCount}
              lineup={lineup}
              canEditLineup={!!lineup}
              isInlineEditing={lineupInlineEditMode}
              expandedInnings={expandedInnings}
              collapsed={gameSetupCollapsed}
              isGenerating={isGenerating}
              status={status}
              error={error}
              onToggleCollapse={() => {
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut,
                );
                setGameSetupCollapsed((prev) => !prev);
              }}
              onEditSelection={() => setShowPlayerPicker(true)}
              onEditLineup={toggleInlineEditMode}
              onSelectAll={() =>
                setActiveIds(new Set(roster.map((player) => player.id)))
              }
              onGenerate={runLineupGeneration}
              onSaveLineup={() => setSaveModalVisible(true)}
              onToggleInning={(inning) => {
                LayoutAnimation.configureNext(
                  LayoutAnimation.Presets.easeInEaseOut,
                );
                setExpandedInnings((prev) => {
                  const next = new Set(prev);
                  if (next.has(inning)) next.delete(inning);
                  else next.add(inning);
                  return next;
                });
              }}
              onSetLineupCell={applyInlinePositionSwap}
              playerGenderByName={playerGenderByName}
              onLineupDragStateChange={setIsDraggingLineupRow}
            />
          </>
        ) : (
          <>
            {hasProSubscription && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Game Context</Text>
                <Text style={styles.cardSubtext}>
                  {selectedGame
                    ? `Saving versions under ${formatGameLabel(selectedGame)}`
                    : "Saving versions under General lineup history"}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.contextChipRow}>
                    <Pressable
                      style={[
                        styles.contextChip,
                        selectedGameId === null && styles.contextChipActive,
                      ]}
                      onPress={() => setSelectedGameId(null)}
                    >
                      <Text
                        style={[
                          styles.contextChipText,
                          selectedGameId === null &&
                            styles.contextChipTextActive,
                        ]}
                      >
                        General
                      </Text>
                    </Pressable>
                    {games.map((game) => (
                      <Pressable
                        key={game.id ?? game.scheduledAt}
                        style={[
                          styles.contextChip,
                          selectedGameId === game.id &&
                            styles.contextChipActive,
                        ]}
                        onPress={() => setSelectedGameId(game.id ?? null)}
                      >
                        <Text
                          style={[
                            styles.contextChipText,
                            selectedGameId === game.id &&
                              styles.contextChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {formatGameLabel(game)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Lineup History</Text>
                {historyLoading ? (
                  <ActivityIndicator color={palette.accent} size="small" />
                ) : null}
              </View>

              {historyError ? (
                <Text style={styles.errorText}>{historyError}</Text>
              ) : null}

              {lineupHistory.length === 0 ? (
                <Text style={styles.previewEmpty}>
                  No saved versions yet for this context.
                </Text>
              ) : (
                <View style={styles.historyList}>
                  <Text style={styles.historyHint}>
                    Tap to open • Long-press to delete
                  </Text>
                  {lineupHistory.map((version) => (
                    <Pressable
                      key={version.id}
                      style={({ pressed }) => [
                        styles.historyRow,
                        pressed && { opacity: 0.85 },
                        activeHistoryId === version.id && { opacity: 0.65 },
                      ]}
                      onPress={() => openLineupHistoryDetail(version.id)}
                      onLongPress={() => setPendingDeleteLineup(version)}
                      delayLongPress={350}
                      disabled={activeHistoryId === version.id}
                    >
                      <View style={styles.historyRowContent}>
                        <View style={styles.historyMeta}>
                          <Text style={styles.historyTitle}>
                            {version.lineupName ||
                              `Lineup v${version.versionNumber}`}
                          </Text>
                          <Text style={styles.historySubtext}>
                            v{version.versionNumber} •{" "}
                            {version.gameTitle || "General"} •{" "}
                            {formatDateTime(version.createdAt)}
                          </Text>
                        </View>
                        {activeHistoryId === version.id ? (
                          <ActivityIndicator
                            color={palette.accent}
                            size="small"
                          />
                        ) : (
                          <Feather
                            name="chevron-right"
                            size={18}
                            color={palette.subtext}
                          />
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {editModalVisible && (
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalScreen}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>
                {showingHistoryDetail
                  ? selectedHistoryDetail!.lineupName ||
                    `Lineup v${selectedHistoryDetail!.versionNumber}`
                  : "Edit lineup"}
              </Text>
              {showingHistoryDetail ? (
                <View style={styles.editModalActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={async () => {
                      if (
                        !selectedHistoryRows ||
                        selectedHistoryRows.length === 0
                      ) {
                        setError("Unable to edit this lineup.");
                        return;
                      }
                      LayoutAnimation.configureNext(
                        LayoutAnimation.Presets.easeInEaseOut,
                      );
                      setHistoryEditRows(cloneLineupRows(selectedHistoryRows));
                      setLineupParentVersionId(selectedHistoryDetail!.id);
                      setLineupInlineEditMode(true);
                      setSaveModalVisible(false);
                      setActiveTab("history");
                      onEditModeChange?.(true);
                      setStatus(
                        `Editing lineup v${selectedHistoryDetail!.versionNumber} in the wider editor.`,
                      );
                      setError(null);
                    }}
                  >
                    <Text style={styles.secondaryText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => {
                      if (!hasProSubscription) {
                        onRequirePro("Lineup exports");
                        return;
                      }
                      void exportLineupVersion(
                        selectedHistoryDetail!.id,
                        "xlsx",
                      );
                    }}
                    disabled={activeHistoryId === selectedHistoryDetail!.id}
                  >
                    <Text style={styles.secondaryText}>Excel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => {
                      if (!hasProSubscription) {
                        onRequirePro("Lineup exports");
                        return;
                      }
                      void exportLineupVersion(
                        selectedHistoryDetail!.id,
                        "pdf",
                      );
                    }}
                    disabled={activeHistoryId === selectedHistoryDetail!.id}
                  >
                    <Text style={styles.secondaryText}>PDF</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={dismissEditModal}
                  >
                    <Text style={styles.primaryButtonText}>Close</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.editModalActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && { opacity: 0.85 },
                      isSavingVersion && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      if (selectedHistoryDetail) {
                        void saveCurrentLineupVersion(
                          saveLineupName ||
                            selectedHistoryDetail.lineupName ||
                            `Lineup v${selectedHistoryDetail.versionNumber}`,
                        );
                        return;
                      }
                      setSaveModalVisible(true);
                    }}
                    disabled={isSavingVersion}
                  >
                    <Text style={styles.secondaryText}>
                      {isSavingVersion ? "Saving..." : "Save"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={finishInlineEdit}
                  >
                    <Text style={styles.primaryButtonText}>Done</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <ScrollView
              style={styles.editModalBody}
              contentContainerStyle={styles.editModalBodyContent}
            >
              <LineUp
                lineup={editModalLineup}
                expandedInnings={editModalExpandedInnings}
                onToggleInning={() => {}}
                editable={lineupInlineEditMode}
                onSetPlayerPosition={applyInlinePositionSwap}
                playerGenderByName={playerGenderByName}
                onDragStateChange={setIsDraggingLineupRow}
                presentation="editModal"
              />
            </ScrollView>
          </View>
        </View>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={saveModalVisible}
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save lineup</Text>
            <Text style={styles.modalSubtext}>
              {isManualEditSave
                ? "This will save as a new edited version in lineup history."
                : "Name this lineup to store it in lineup history."}
            </Text>
            <TextInput
              ref={saveLineupNameInputRef}
              value={saveLineupName}
              onChangeText={setSaveLineupName}
              placeholder="Lineup name (e.g. Playoff Plan A)"
              placeholderTextColor={palette.subtext}
              style={styles.lineupNameInput}
              autoCapitalize="words"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setSaveModalVisible(false)}
                disabled={isSavingVersion}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && { opacity: 0.85 },
                  isSavingVersion && { opacity: 0.7 },
                ]}
                onPress={() => {
                  void saveCurrentLineupVersion();
                }}
                disabled={isSavingVersion}
              >
                <Text style={styles.primaryButtonText}>
                  {isSavingVersion ? "Saving..." : "Save lineup"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={showPlayerPicker}
        onRequestClose={() => setShowPlayerPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.playerModalCard]}>
            <View style={styles.playerModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Active Players</Text>
                <Text style={styles.modalSubtext}>
                  Choose players used for this lineup run.
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => setShowPlayerPicker(false)}
              >
                <Feather name="x" size={16} color={palette.text} />
              </Pressable>
            </View>

            <View style={styles.selectionActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() =>
                  setActiveIds(new Set(roster.map((player) => player.id)))
                }
              >
                <Text style={styles.secondaryText}>Select all</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setActiveIds(new Set())}
              >
                <Text style={styles.secondaryText}>Clear</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.playerPickerScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.playerGrid}>
                {roster.map((player) => {
                  const active = activeIds.has(player.id);
                  return (
                    <Pressable
                      key={player.id}
                      style={[
                        styles.playerTile,
                        active
                          ? styles.playerTileActive
                          : styles.playerTileInactive,
                      ]}
                      onPress={() => handleToggleActive(player.id)}
                    >
                      <View style={styles.playerTileContent}>
                        {player.gender === "female" ? (
                          <View style={styles.genderBadge}>
                            <Text style={styles.genderBadgeText}>F</Text>
                          </View>
                        ) : null}
                        <Text style={styles.playerName} numberOfLines={1}>
                          {player.name || "Unnamed"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={pendingDeleteLineup !== null}
        onRequestClose={() =>
          isDeletingLineup ? undefined : setPendingDeleteLineup(null)
        }
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete lineup?</Text>
            <Text style={styles.modalSubtext}>
              {pendingDeleteLineup
                ? `“${
                    pendingDeleteLineup.lineupName ||
                    `Lineup v${pendingDeleteLineup.versionNumber}`
                  }” will be permanently removed. This can’t be undone.`
                : ""}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setPendingDeleteLineup(null)}
                disabled={isDeletingLineup}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dangerButton,
                  pressed && { opacity: 0.9 },
                  isDeletingLineup && { opacity: 0.7 },
                ]}
                onPress={confirmDeleteLineup}
                disabled={isDeletingLineup}
              >
                {isDeletingLineup ? (
                  <ActivityIndicator color={palette.accentText} size="small" />
                ) : (
                  <Text style={styles.dangerButtonText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={rosterRequirement !== null}
        onRequestClose={() => setRosterRequirement(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.rosterModalIcon}>
              <Feather name="users" size={22} color={palette.accent} />
            </View>
            <Text style={styles.modalTitle}>Add players to your roster</Text>
            <Text style={styles.modalSubtext}>
              {rosterRequirement?.detail} You currently have{" "}
              {rosterRequirement?.have}{" "}
              {rosterRequirement?.have === 1 ? "active player" : "active players"}
              . Add or activate more players in your roster to generate a lineup.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setRosterRequirement(null)}
              >
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.rosterModalPrimary,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => {
                  setRosterRequirement(null);
                  onOpenRoster();
                }}
              >
                <Text style={styles.primaryButtonText}>Go to Roster</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: palette.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 4,
    gap: 6,
  },
  tabButton: {
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
  },
  tabButtonActive: {
    backgroundColor: "rgba(126,207,157,0.18)",
    borderWidth: 1,
    borderColor: "rgba(126,207,157,0.5)",
  },
  tabButtonText: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  tabButtonTextActive: {
    color: palette.success,
  },
  historyToolbar: {
    alignItems: "flex-start",
  },
  historyBackButton: {
    alignSelf: "flex-start",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  headerTextWrap: {
    alignItems: "center",
    gap: 2,
  },
  headerEyebrow: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 24,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cardAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroCard: {
    backgroundColor: palette.cardAlt,
    borderRadius: 20,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },

  heroSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  metric: {
    flex: 1,
    minWidth: 92,
    backgroundColor: palette.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricLabel: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  metricValue: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
    marginTop: 2,
    textTransform: "capitalize",
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 15,
  },
  cardSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  contextChipRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 8,
  },
  contextChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
  },
  contextChipActive: {
    borderColor: "rgba(126,207,157,0.55)",
    backgroundColor: "rgba(126,207,157,0.2)",
  },
  contextChipText: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  contextChipTextActive: {
    color: palette.success,
  },
  lineupNameInput: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    color: palette.text,
    fontFamily: typeface.body,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  primaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.75)",
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  primaryButtonText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  previewEmpty: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  errorText: {
    color: palette.danger,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  historyList: {
    gap: 8,
  },
  historyHint: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
    marginBottom: 2,
  },
  historyRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 8,
  },
  historyMeta: {
    gap: 2,
  },
  historyTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  historySubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  historyRowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyDetailActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  historyDetailActionButton: {
    alignSelf: "auto",
  },
  selectionActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  playerPickerScroll: {
    maxHeight: 380,
  },
  playerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  playerTile: {
    width: "31.5%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 38,
  },
  playerTileInactive: {
    opacity: 0.65,
  },
  playerTileActive: {
    borderColor: "rgba(126,207,157,0.5)",
    backgroundColor: "rgba(126,207,157,0.12)",
  },
  playerName: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
    flex: 1,
    textAlign: "left",
  },
  playerTileContent: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  genderBadge: {
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.58)",
    backgroundColor: "rgba(242,166,59,0.2)",
  },
  genderBadgeText: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 10,
    lineHeight: 16,
    width: 16,
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  editModalOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  editModalScreen: {
    flex: 1,
    backgroundColor: palette.background,
    paddingTop: Platform.OS === "ios" ? 56 : 24,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  editModalHeaderText: {
    flex: 1,
    gap: 4,
  },
  editModalTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 24,
  },
  editModalSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 13,
  },
  editModalActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  editModalBody: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  editModalBodyContent: {
    padding: 12,
  },
  editModalHint: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    padding: 16,
    gap: 10,
  },
  playerModalCard: {
    maxHeight: "86%",
  },
  playerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  modalTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 17,
  },
  modalSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  dangerButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.danger,
    backgroundColor: palette.danger,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 88,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rosterModalIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(242,166,59,0.14)",
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.35)",
  },
  rosterModalPrimary: {
    alignSelf: "auto",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dangerButtonText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
});

export default LineupScreen;
