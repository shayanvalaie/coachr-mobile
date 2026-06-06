import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import LineUp from "../components/LineUp";
import { backendClient } from "../lib/backend/client";
import {
  BackendGame,
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
  BackendSession,
} from "../lib/backend/types";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";
import { InningAssignment } from "../types/lineup";
import { LineupLaunchRequestInput } from "../types/lineupLaunch";
import { parseTeamRulesConfig } from "../types/rules";
import { buildPlayerGenderByName } from "../utils/playerNames";

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

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenLineupPage: (request: LineupLaunchRequestInput) => void;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
};

type GameFormState = {
  id?: string;
  title: string;
  opponentName: string;
  scheduledAtInput: string;
  location: string;
  homeAway: BackendGame["homeAway"];
  status: BackendGame["status"];
  ourScoreInput: string;
  opponentScoreInput: string;
  competition: string;
  season: string;
  notes: string;
  isLeagueGame: boolean;
  isPlayoff: boolean;
};

type MonthCell = {
  day: number;
  dayKey: string;
  inMonth: boolean;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["S", "M", "T", "W", "T", "F", "S"];

const pad2 = (value: number) => String(value).padStart(2, "0");

const toDayKeyFromDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toDayKeyFromIso = (iso: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return toDayKeyFromDate(date);
};

const mergeDayAndTime = (dayKey: string, currentInput: string) => {
  const match = /T(\d{2}:\d{2})/.exec(currentInput);
  const timePart = match?.[1] ?? "18:00";
  return `${dayKey}T${timePart}`;
};

const dayKeyToReadable = (dayKey: string) => {
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatLineupCreatedAt = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const STATIC_EXPANDED_INNINGS = new Set<number>();

const normalizeLineupRows = (
  rows: Record<string, unknown>[] | undefined,
): InningAssignment[] => {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row, index) => {
      const inningRaw = row?.inning;
      const inning =
        typeof inningRaw === "number" && Number.isFinite(inningRaw)
          ? inningRaw
          : index + 1;

      const positionsRaw =
        row && typeof row === "object" && typeof row.positions === "object" && row.positions
          ? (row.positions as Record<string, unknown>)
          : {};
      const positions = Object.entries(positionsRaw).reduce(
        (acc, [slot, player]) => {
          const slotName = String(slot).trim();
          if (!slotName) return acc;
          if (typeof player === "string" && player.trim()) {
            acc[slotName] = player.trim();
          } else if (player == null) {
            acc[slotName] = null;
          } else {
            acc[slotName] = String(player);
          }
          return acc;
        },
        {} as Record<string, string | null>,
      );

      const benchRaw =
        row && typeof row === "object" && Array.isArray(row.bench) ? row.bench : [];
      const bench = benchRaw
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim())
        .filter(Boolean);

      const droppedPosition =
        typeof row.droppedPosition === "string" ? row.droppedPosition : undefined;

      return { inning, positions, bench, droppedPosition };
    })
    .sort((a, b) => a.inning - b.inning);
};

const cloneLineupRows = (rows: InningAssignment[]): InningAssignment[] =>
  rows.map((row) => ({
    inning: row.inning,
    positions: { ...row.positions },
    bench: [...row.bench],
    droppedPosition: row.droppedPosition,
  }));

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

const applyLineupCellEdit = (
  rows: InningAssignment[],
  inning: number,
  playerName: string,
  targetPosition: string,
): InningAssignment[] => {
  const normalizedTarget = targetPosition.trim();
  if (!normalizedTarget) return rows;

  const normalize = (value: string) => value.trim().toLowerCase();
  const playerKey = normalize(playerName);

  return rows.map((row) => {
    if (row.inning !== inning) return row;

    const positions = { ...row.positions };
    const bench = [...row.bench];
    const slotOrder = Object.keys(positions);
    const targetIsBench = normalizedTarget === "X";
    const canTargetSlot = targetIsBench || slotOrder.includes(normalizedTarget);
    if (!canTargetSlot) return row;

    const findSlotForPlayer = () =>
      Object.entries(positions).find(([_slot, value]) => {
        if (typeof value !== "string") return false;
        return normalize(value) === playerKey;
      })?.[0] ?? null;

    const currentSlot = findSlotForPlayer();
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
      const occupyingName = typeof occupying === "string" ? occupying.trim() : "";
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
  });
};

const toLineupRowsPayload = (rows: InningAssignment[]): Record<string, unknown>[] =>
  rows.map((row) => ({
    inning: row.inning,
    positions: row.positions,
    bench: row.bench,
    droppedPosition: row.droppedPosition ?? null,
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
      : Array.from({ length: rulesConfig.playersOnField }, (_unused, idx) => `Slot ${idx + 1}`);

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
      const maxBench = Math.max(rosterNames.size - rulesConfig.playersOnField, 0);
      const onFieldCount = assignedNames.length;
      const benchCount = row.bench.length;
      const missingLabel =
        missingSlots.length === 1 ? "slot is" : "slots are";
      return `Inning ${row.inning}: ${onFieldCount} on field, ${benchCount} benched. You need ${rulesConfig.playersOnField} on field (max ${maxBench} benched). ${missingSlots.length} field ${missingLabel} empty (${missingSlots.join(", ")}).`;
    }

    const normalized = assignedNames.map((name) => name.toLowerCase());
    const duplicates = normalized.filter((name, idx) => normalized.indexOf(name) !== idx);
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      return `Inning ${row.inning} has duplicate player assignments: ${uniqueDuplicates.join(", ")}.`;
    }

    const unknownPlayers = assignedNames.filter((name) => !rosterNames.has(name.toLowerCase()));
    if (unknownPlayers.length > 0) {
      return `Inning ${row.inning} includes players not in roster: ${unknownPlayers.join(", ")}.`;
    }
  }

  return null;
};

const toDateTimeLocalInput = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const toIsoFromDateTimeInput = (value: string): string | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const buildMonthCells = (year: number, monthIndex: number): MonthCell[] => {
  const firstDay = new Date(year, monthIndex, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const cellDate = new Date(year, monthIndex, 1 - firstWeekday + index);
    return {
      day: cellDate.getDate(),
      dayKey: toDayKeyFromDate(cellDate),
      inMonth: cellDate.getMonth() === monthIndex,
    };
  });
};

const emptyForm = (dayKey?: string): GameFormState => {
  const scheduledAtInput = toDateTimeLocalInput(
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  );

  return {
    title: "",
    opponentName: "",
    scheduledAtInput: dayKey ? mergeDayAndTime(dayKey, scheduledAtInput) : scheduledAtInput,
    location: "",
    homeAway: "home",
    status: "scheduled",
    ourScoreInput: "",
    opponentScoreInput: "",
    competition: "",
    season: "",
    notes: "",
    isLeagueGame: false,
    isPlayoff: false,
  };
};

const gameToForm = (game: BackendGame): GameFormState => ({
  id: game.id,
  title: game.title,
  opponentName: game.opponentName,
  scheduledAtInput: toDateTimeLocalInput(game.scheduledAt),
  location: game.location,
  homeAway: game.homeAway,
  status: game.status,
  ourScoreInput: game.ourScore == null ? "" : String(game.ourScore),
  opponentScoreInput: game.opponentScore == null ? "" : String(game.opponentScore),
  competition: game.competition,
  season: game.season,
  notes: game.notes,
  isLeagueGame: game.isLeagueGame,
  isPlayoff: game.isPlayoff,
});

const parseScore = (raw: string): number | null | "invalid" => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
  return parsed;
};

const CalendarScreen = ({
  session,
  onBack,
  onOpenProfile,
  onOpenLineupPage,
  hasProSubscription,
  onRequirePro,
}: Props) => {
  const initialTodayKey = toDayKeyFromDate(new Date());

  const [teamId, setTeamId] = useState<string | null>(null);
  const [games, setGames] = useState<BackendGame[]>([]);
  const [lineupHistory, setLineupHistory] = useState<BackendLineupVersionSummary[]>([]);
  const [playerGenderByName, setPlayerGenderByName] = useState<
    Record<string, "male" | "female">
  >({});
  const [selectedDateKey, setSelectedDateKey] = useState(initialTodayKey);
  const [viewMode, setViewMode] = useState<"calendar" | "day">("calendar");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isLineupsModalOpen, setIsLineupsModalOpen] = useState(false);
  const [lineupsModalTitle, setLineupsModalTitle] = useState("");
  const [lineupsModalGameId, setLineupsModalGameId] = useState<string | null>(null);
  const [lineupsForModal, setLineupsForModal] = useState<BackendLineupVersionSummary[]>([]);
  const [lineupCarouselIndex, setLineupCarouselIndex] = useState(0);
  const [lineupCarouselWidth, setLineupCarouselWidth] = useState(0);
  const [lineupDetailsById, setLineupDetailsById] = useState<
    Record<string, BackendLineupVersionDetail>
  >({});
  const [isLineupDetailsLoading, setIsLineupDetailsLoading] = useState(false);
  const [lineupDetailsError, setLineupDetailsError] = useState<string | null>(null);
  const [activeLineupId, setActiveLineupId] = useState<string | null>(null);
  const [editingLineupId, setEditingLineupId] = useState<string | null>(null);
  const [draftRowsByLineupId, setDraftRowsByLineupId] = useState<
    Record<string, InningAssignment[]>
  >({});
  const [form, setForm] = useState<GameFormState>(() => emptyForm(initialTodayKey));
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;
    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;
    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadGames = useCallback(async () => {
    try {
      setError(null);
      const team = await ensureTeam();
      if (!team) return;
      const [list, versions, roster] = await Promise.all([
        backendClient.getTeamGames(team),
        backendClient.getLineupVersions(team),
        backendClient.getTeamRoster(team).catch(() => null),
      ]);
      setGames(list);
      setLineupHistory(versions);
      setPlayerGenderByName(roster ? buildPlayerGenderByName(roster) : {});
    } catch (_err) {
      setError("Unable to load games.");
    }
  }, [ensureTeam]);

  useEffect(() => {
    loadGames().catch(() => {
      setError("Unable to load games.");
    });
  }, [loadGames]);

  const gamesByDay = useMemo(() => {
    const map = new Map<string, BackendGame[]>();
    for (const game of games) {
      const dayKey = toDayKeyFromIso(game.scheduledAt);
      if (!dayKey) continue;
      const current = map.get(dayKey);
      if (current) current.push(game);
      else map.set(dayKey, [game]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
    }
    return map;
  }, [games]);

  const upcomingCount = useMemo(
    () =>
      games.filter((game) => {
        const when = new Date(game.scheduledAt).getTime();
        return Number.isFinite(when) && when >= Date.now();
      }).length,
    [games],
  );

  const selectedGames = useMemo(
    () => gamesByDay.get(selectedDateKey) ?? [],
    [gamesByDay, selectedDateKey],
  );
  const lineupsByGameId = useMemo(() => {
    const grouped = new Map<string, BackendLineupVersionSummary[]>();
    lineupHistory.forEach((version) => {
      if (!version.gameId) return;
      const current = grouped.get(version.gameId);
      if (current) current.push(version);
      else grouped.set(version.gameId, [version]);
    });

    for (const list of grouped.values()) {
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return grouped;
  }, [lineupHistory]);
  const calendarMonthDate = useMemo(() => {
    const [yearRaw, monthRaw] = selectedDateKey.split("-");
    const year = Number.parseInt(yearRaw ?? "", 10);
    const month = Number.parseInt(monthRaw ?? "", 10);
    const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
    const safeMonth = Number.isFinite(month) ? month : new Date().getMonth() + 1;
    return new Date(safeYear, safeMonth - 1, 1);
  }, [selectedDateKey]);
  const calendarYear = calendarMonthDate.getFullYear();
  const calendarMonthIndex = calendarMonthDate.getMonth();
  const calendarCells = useMemo(
    () => buildMonthCells(calendarYear, calendarMonthIndex),
    [calendarMonthIndex, calendarYear],
  );

  const openCreateModalForDate = useCallback((dayKey: string) => {
    setSelectedDateKey(dayKey);
    setForm(emptyForm(dayKey));
    setIsFormModalOpen(true);
  }, []);

  const openGamesPageForDate = useCallback((dayKey: string) => {
    setSelectedDateKey(dayKey);
    setViewMode("day");
  }, []);

  const handleDateCellPress = useCallback(
    (dayKey: string) => {
      const dayGameCount = gamesByDay.get(dayKey)?.length ?? 0;
      if (dayGameCount > 0) {
        openGamesPageForDate(dayKey);
        return;
      }
      openCreateModalForDate(dayKey);
    },
    [gamesByDay, openCreateModalForDate, openGamesPageForDate],
  );

  const startEditingGame = useCallback((game: BackendGame) => {
    setForm(gameToForm(game));
    const dayKey = toDayKeyFromIso(game.scheduledAt);
    if (dayKey) {
      setSelectedDateKey(dayKey);
    }
    setIsFormModalOpen(true);
  }, []);

  const closeFormModal = useCallback(() => {
    if (isSaving) return;
    setIsFormModalOpen(false);
  }, [isSaving]);

  const handleSaveGame = useCallback(async () => {
    setIsSaving(true);
    setStatus("");
    setError(null);
    try {
      const team = await ensureTeam();
      if (!team) {
        setError("Unable to find team for saving game.");
        return;
      }

      const scheduledAt = toIsoFromDateTimeInput(form.scheduledAtInput);
      if (!scheduledAt) {
        setError("Please enter a valid game date and time.");
        return;
      }

      const ourScore = parseScore(form.ourScoreInput);
      const opponentScore = parseScore(form.opponentScoreInput);
      if (ourScore === "invalid" || opponentScore === "invalid") {
        setError("Scores must be whole numbers or empty.");
        return;
      }

      const payload: BackendGame = {
        id: form.id,
        title: form.title.trim(),
        opponentName: form.opponentName.trim(),
        scheduledAt,
        location: form.location.trim(),
        homeAway: form.homeAway,
        status: form.status,
        ourScore,
        opponentScore,
        competition: form.competition.trim(),
        season: form.season.trim(),
        notes: form.notes.trim(),
        isLeagueGame: form.isLeagueGame,
        isPlayoff: form.isPlayoff,
      };

      await backendClient.saveTeamGame(team, payload);
      await loadGames();

      const savedDayKey = toDayKeyFromIso(scheduledAt) ?? selectedDateKey;
      setSelectedDateKey(savedDayKey);
      setIsFormModalOpen(false);
      setForm(emptyForm(savedDayKey));
      setViewMode("day");
      setStatus(form.id ? "Game updated." : "Game added.");
    } catch (_err) {
      setError("Unable to save game.");
    } finally {
      setIsSaving(false);
    }
  }, [ensureTeam, form, loadGames, selectedDateKey]);

  const handleDeleteGame = useCallback(
    (gameId: string) => {
      Alert.alert("Delete game?", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setIsSaving(true);
            setStatus("");
            setError(null);
            ensureTeam()
              .then(async (team) => {
                if (!team) {
                  setError("Unable to find team for deleting game.");
                  return;
                }
                await backendClient.deleteTeamGame(team, gameId);
                await loadGames();
                if (form.id === gameId) {
                  setForm(emptyForm(selectedDateKey));
                }
                setStatus("Game deleted.");
              })
              .catch(() => setError("Unable to delete game."))
              .finally(() => setIsSaving(false));
          },
        },
      ]);
    },
    [ensureTeam, form.id, loadGames, selectedDateKey],
  );

  const moveMonth = useCallback((offset: number) => {
    setSelectedDateKey((prevDayKey) => {
      const [year, month, day] = prevDayKey.split("-");
      const yearNum = Number.parseInt(year ?? "", 10) || new Date().getFullYear();
      const monthNum = Number.parseInt(month ?? "", 10) || 1;
      const dayNum = Number.parseInt(day ?? "", 10) || 1;
      return toDayKeyFromDate(new Date(yearNum, monthNum - 1 + offset, dayNum));
    });
  }, []);

  const jumpToToday = useCallback(() => {
    setSelectedDateKey(toDayKeyFromDate(new Date()));
  }, []);

  const setHomeAway = (next: BackendGame["homeAway"]) =>
    setForm((prev) => ({ ...prev, homeAway: next }));
  const setGameStatus = (next: BackendGame["status"]) =>
    setForm((prev) => ({ ...prev, status: next }));
  const openLineupsModal = useCallback(
    async (game: BackendGame) => {
      const title = `${game.title || "Untitled Game"} vs ${game.opponentName || "TBD"}`;
      const versions = game.id ? lineupsByGameId.get(game.id) ?? [] : [];
      setLineupsModalTitle(title);
      setLineupsModalGameId(game.id ?? null);
      setLineupsForModal(versions);
      setLineupCarouselIndex(0);
      setLineupDetailsError(null);
      setEditingLineupId(null);
      setDraftRowsByLineupId({});
      setIsLineupsModalOpen(true);

      if (versions.length === 0) return;

      try {
        const team = await ensureTeam();
        if (!team) return;
        setIsLineupDetailsLoading(true);
        const pending = versions.filter((version) => !lineupDetailsById[version.id]);
        if (pending.length === 0) return;

        const loaded = await Promise.all(
          pending.map((version) => backendClient.getLineupVersion(team, version.id)),
        );

        setLineupDetailsById((prev) => {
          const next = { ...prev };
          loaded.forEach((detail) => {
            next[detail.id] = detail;
          });
          return next;
        });
      } catch (_err) {
        setLineupDetailsError("Unable to load lineup details.");
      } finally {
        setIsLineupDetailsLoading(false);
      }
    },
    [ensureTeam, lineupDetailsById, lineupsByGameId],
  );

  const openLineupWorkspace = useCallback(
    (request: LineupLaunchRequestInput) => {
      if (!hasProSubscription && request.gameId) {
        onRequirePro("Per-game lineup generation");
        return;
      }
      setIsLineupsModalOpen(false);
      onOpenLineupPage(request);
    },
    [hasProSubscription, onOpenLineupPage, onRequirePro],
  );

  const exportLineupVersion = useCallback(
    async (lineupId: string, format: "xlsx" | "pdf") => {
      try {
        const team = await ensureTeam();
        if (!team) return;

        setActiveLineupId(lineupId);
        setLineupDetailsError(null);

        const exported = await backendClient.exportLineupVersion(team, lineupId, format);
        const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
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
        setLineupDetailsError(`Unable to export ${format.toUpperCase()}.`);
      } finally {
        setActiveLineupId(null);
      }
    },
    [ensureTeam],
  );

  const saveEditedLineupVersion = useCallback(
    async (lineupVersion: BackendLineupVersionSummary) => {
      try {
        const editedRows = draftRowsByLineupId[lineupVersion.id];
        if (!editedRows || editedRows.length === 0) {
          setLineupDetailsError("No edited lineup to save.");
          return;
        }

        const team = await ensureTeam();
        if (!team) return;

        setActiveLineupId(lineupVersion.id);
        setLineupDetailsError(null);

        const [roster, rawRules] = await Promise.all([
          backendClient.getTeamRoster(team),
          backendClient.getTeamRules(team),
        ]);

        const rulesConfig = parseTeamRulesConfig(rawRules);
        const rosterNames = new Set(
          roster
            .map((player) => player.name.trim().toLowerCase())
            .filter((name) => name.length > 0),
        );
        const validationError = validateEditedLineupForSave(
          editedRows,
          rulesConfig,
          rosterNames,
        );
        if (validationError) {
          setLineupDetailsError(validationError);
          return;
        }

        const payloadRoster = roster.map((player) => ({
          id: player.id,
          name: player.name,
          gender: player.gender,
          desiredPositions: player.desiredPositions,
          fixedAllGame: false,
          lockInPosition: player.lockInPosition,
        }));

        const saved = await backendClient.saveLineupVersion({
          teamId: team,
          sport: lineupVersion.sport || "softball",
          roster: payloadRoster,
          gameId: lineupVersion.gameId ?? null,
          gameTitle: lineupVersion.gameTitle || lineupsModalTitle || null,
          lineupName: lineupVersion.lineupName || `Lineup v${lineupVersion.versionNumber}`,
          rows: toLineupRowsPayload(editedRows),
          parentLineupId: lineupVersion.id,
          source: "manualEdit",
          rulesConfig,
        });

        setLineupDetailsById((prev) => ({
          ...prev,
          [saved.id]: {
            id: saved.id,
            gameId: saved.gameId ?? lineupVersion.gameId ?? null,
            gameTitle: saved.gameTitle || lineupVersion.gameTitle || "",
            lineupName: saved.lineupName || lineupVersion.lineupName || "",
            sport: saved.sport || lineupVersion.sport || "softball",
            versionNumber: saved.versionNumber,
            createdAt: saved.createdAt,
            segmentCount: saved.segmentCount ?? lineupVersion.segmentCount ?? null,
            source: saved.source,
            parentLineupId: saved.parentLineupId ?? lineupVersion.id,
            rows: toLineupRowsPayload(editedRows),
            output: {},
          },
        }));

        const refreshedLineups = await backendClient.getLineupVersions(
          team,
          lineupVersion.gameId ?? null,
        );
        setLineupsForModal(refreshedLineups);
        setLineupCarouselIndex(0);
        setEditingLineupId(null);
        setDraftRowsByLineupId({});

        await loadGames();
        setStatus(`Saved ${saved.lineupName || `v${saved.versionNumber}`}.`);
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Unable to save edited lineup.";
        setLineupDetailsError(message);
      } finally {
        setActiveLineupId(null);
      }
    },
    [draftRowsByLineupId, ensureTeam, lineupsModalTitle, loadGames],
  );

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
            onPress={onBack}
          >
            <Feather name="arrow-left" size={18} color={palette.text} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerEyebrow}>Calendar Workspace</Text>
            <Text style={styles.headerTitle}>Calendar</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
            onPress={onOpenProfile}
          >
            <Feather name="user" size={18} color={palette.text} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Plan games and track outcomes</Text>
          <Text style={styles.heroSubtext}>
            Total games: {games.length} | Upcoming: {upcomingCount}
          </Text>
        </View>

        {viewMode === "calendar" ? (
          <View style={styles.card}>
            <View style={styles.yearHeader}>
              <Text style={styles.cardTitle}>Calendar</Text>
              <View style={styles.yearActions}>
                <Pressable
                  style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.8 }]}
                  onPress={() => moveMonth(-1)}
                >
                  <Feather name="chevron-left" size={15} color={palette.text} />
                </Pressable>
                <Text style={styles.yearText}>
                  {MONTH_NAMES[calendarMonthIndex]} {calendarYear}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.8 }]}
                  onPress={() => moveMonth(1)}
                >
                  <Feather name="chevron-right" size={15} color={palette.text} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.85 }]}
                  onPress={jumpToToday}
                >
                  <Text style={styles.secondaryText}>Today</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.selectedBar}>
              <Text style={styles.selectedDateText}>Selected: {dayKeyToReadable(selectedDateKey)}</Text>
              <View style={styles.dayPageActions}>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.85 }]}
                  onPress={() => setViewMode("day")}
                >
                  <Text style={styles.secondaryText}>Open Games</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.85 }]}
                  onPress={() => openCreateModalForDate(selectedDateKey)}
                >
                  <Feather name="plus" size={16} color={palette.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.monthCard}>
              <View style={styles.weekdaysRow}>
                {WEEKDAY_NAMES.map((weekday, weekdayIndex) => (
                  <Text
                    key={`${calendarYear}-${calendarMonthIndex}-${weekdayIndex}-${weekday}`}
                    style={styles.weekdayLabel}
                  >
                    {weekday}
                  </Text>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {calendarCells.map((cell) => {
                  const dayGameCount = gamesByDay.get(cell.dayKey)?.length ?? 0;
                  const isToday = cell.dayKey === initialTodayKey;
                  const isSelected = cell.dayKey === selectedDateKey;

                  return (
                    <Pressable
                      key={`${calendarYear}-${calendarMonthIndex}-${cell.dayKey}`}
                      style={({ pressed }) => [
                        styles.dayCell,
                        !cell.inMonth && styles.dayCellOutside,
                        isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => handleDateCellPress(cell.dayKey)}
                    >
                      <Text
                        style={[
                          styles.dayCellText,
                          !cell.inMonth && styles.dayCellTextOutside,
                          isSelected && styles.dayCellTextSelected,
                        ]}
                      >
                        {cell.day}
                      </Text>
                      {dayGameCount > 0 ? (
                        <View style={styles.dayBadge}>
                          <Text style={styles.dayBadgeText}>{dayGameCount}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.dayPageHeader}>
              <View>
                <Text style={styles.cardTitle}>Games</Text>
                <Text style={styles.dayPageSubtext}>{dayKeyToReadable(selectedDateKey)}</Text>
              </View>
              <View style={styles.dayPageActions}>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.85 }]}
                  onPress={() => setViewMode("calendar")}
                >
                  <Text style={styles.secondaryText}>Calendar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.85 }]}
                  onPress={() => openCreateModalForDate(selectedDateKey)}
                >
                  <Feather name="plus" size={16} color={palette.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.gameList}>
              {selectedGames.length === 0 ? (
                <Text style={styles.emptyText}>No games on this date yet.</Text>
              ) : (
                selectedGames.map((game) => {
                  const date = new Date(game.scheduledAt);
                  const savedLineups = game.id ? lineupsByGameId.get(game.id) ?? [] : [];
                  return (
                    <View key={game.id ?? `${game.title}-${game.scheduledAt}`} style={styles.gameRow}>
                      <View style={styles.gameInfo}>
                        <Text style={styles.gameTitle}>
                          {game.title || "Untitled Game"} vs {game.opponentName || "TBD"}
                        </Text>
                        <Text style={styles.gameMeta}>
                          {Number.isNaN(date.getTime()) ? game.scheduledAt : date.toLocaleString()}
                        </Text>
                        <Text style={styles.gameMeta}>
                          {game.homeAway.toUpperCase()} - {game.location || "No location"} - {game.status}
                        </Text>
                        {(game.ourScore != null || game.opponentScore != null) && (
                          <Text style={styles.scoreText}>
                            Score: {game.ourScore ?? "-"} - {game.opponentScore ?? "-"}
                          </Text>
                        )}
                        {savedLineups.length > 0 ? (
                          <View style={styles.lineupInfoWrap}>
                            <Text style={styles.lineupCountText}>
                              Saved lineups: {savedLineups.length}
                            </Text>
                            <Text style={styles.lineupMetaText}>
                              Latest: {savedLineups[0].lineupName || `v${savedLineups[0].versionNumber}`}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.lineupMetaText}>No lineup saved for this game yet.</Text>
                        )}
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && { opacity: 0.85 },
                          ]}
                          onPress={() => {
                            if (savedLineups.length === 0) {
                              openLineupWorkspace({
                                gameId: game.id ?? null,
                                autoGenerate: true,
                              });
                              return;
                            }

                            openLineupsModal(game).catch(() => {
                              setLineupDetailsError("Unable to load lineup details.");
                            });
                          }}
                        >
                          <Text style={styles.secondaryText}>Line Up</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && { opacity: 0.85 },
                          ]}
                          onPress={() => startEditingGame(game)}
                        >
                          <Text style={styles.secondaryText}>Edit</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.85 }]}
                          onPress={() => game.id && handleDeleteGame(game.id)}
                        >
                          <Text style={styles.deleteText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </ScrollView>

      <Modal
        visible={isLineupsModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setIsLineupsModalOpen(false);
          setEditingLineupId(null);
        }}
      >
        <View style={styles.lineupModalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setIsLineupsModalOpen(false);
              setEditingLineupId(null);
            }}
          />
          <View style={styles.lineupModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Saved Lineups</Text>
                <Text style={styles.modalSubtext}>{lineupsModalTitle}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setIsLineupsModalOpen(false);
                  setEditingLineupId(null);
                }}
              >
                <Feather name="x" size={16} color={palette.text} />
              </Pressable>
            </View>

            {lineupsForModal.length === 0 ? (
              <View style={styles.lineupEmptyState}>
                <Text style={styles.emptyText}>No saved lineups for this game.</Text>
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
                  onPress={() =>
                    openLineupWorkspace({
                      gameId: lineupsModalGameId,
                      autoGenerate: true,
                    })
                  }
                >
                  <Text style={styles.primaryText}>Generate In Lineup Page</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {lineupDetailsError ? (
                  <Text style={styles.error}>{lineupDetailsError}</Text>
                ) : null}
                <View
                  style={styles.lineupCarouselViewport}
                  onLayout={(event) => {
                    const width = Math.round(event.nativeEvent.layout.width);
                    if (width > 0 && width !== lineupCarouselWidth) {
                      setLineupCarouselWidth(width);
                    }
                  }}
                >
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(event) => {
                      const width = event.nativeEvent.layoutMeasurement.width || 1;
                      const index = Math.round(event.nativeEvent.contentOffset.x / width);
                      setLineupCarouselIndex(index);
                    }}
                  >
                    {lineupsForModal.map((lineupVersion) => (
                      (() => {
                        const detail = lineupDetailsById[lineupVersion.id];
                        const normalizedRows = detail
                          ? normalizeLineupRows(detail.rows as Record<string, unknown>[])
                          : null;
                        const displayRows = draftRowsByLineupId[lineupVersion.id] ?? normalizedRows;
                        return (
                          <View
                            key={lineupVersion.id}
                            style={[
                              styles.lineupSlide,
                              { width: lineupCarouselWidth > 0 ? lineupCarouselWidth : 280 },
                            ]}
                          >
                            <Text style={styles.lineupSlideTitle}>
                              {lineupVersion.lineupName || `Lineup v${lineupVersion.versionNumber}`}
                            </Text>
                            <Text style={styles.lineupSlideMeta}>
                              Version: v{lineupVersion.versionNumber}
                            </Text>
                            <Text style={styles.lineupSlideMeta}>
                              Created: {formatLineupCreatedAt(lineupVersion.createdAt)}
                            </Text>
                            <Text style={styles.lineupSlideMeta}>
                              Innings: {lineupVersion.segmentCount ?? "-"}
                            </Text>
                            <View style={styles.lineupActionsRow}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.secondaryButton,
                                  pressed && { opacity: 0.85 },
                                  !detail && { opacity: 0.6 },
                                  activeLineupId === lineupVersion.id && { opacity: 0.7 },
                                ]}
                                onPress={() => {
                                  if (!detail || !normalizedRows || normalizedRows.length === 0) return;
                                  if (editingLineupId === lineupVersion.id) {
                                    setEditingLineupId(null);
                                    return;
                                  }
                                  setEditingLineupId(lineupVersion.id);
                                  setDraftRowsByLineupId((prev) => {
                                    if (prev[lineupVersion.id]) return prev;
                                    return {
                                      ...prev,
                                      [lineupVersion.id]: cloneLineupRows(normalizedRows),
                                    };
                                  });
                                }}
                                disabled={!detail || activeLineupId === lineupVersion.id}
                              >
                                <Text style={styles.secondaryText}>
                                  {editingLineupId === lineupVersion.id ? "Done Editing" : "Edit"}
                                </Text>
                              </Pressable>
                              {editingLineupId === lineupVersion.id ? (
                                <Pressable
                                  style={({ pressed }) => [
                                    styles.primarySmallButton,
                                    pressed && { opacity: 0.85 },
                                    activeLineupId === lineupVersion.id && { opacity: 0.7 },
                                  ]}
                                  onPress={() => saveEditedLineupVersion(lineupVersion)}
                                  disabled={activeLineupId === lineupVersion.id}
                                >
                                  <Text style={styles.primarySmallText}>
                                    {activeLineupId === lineupVersion.id ? "Saving..." : "Save"}
                                  </Text>
                                </Pressable>
                              ) : null}
                              <Pressable
                                style={({ pressed }) => [
                                  styles.secondaryButton,
                                  pressed && { opacity: 0.85 },
                                  activeLineupId === lineupVersion.id && { opacity: 0.7 },
                                ]}
                                onPress={() => {
                                  if (!hasProSubscription) {
                                    onRequirePro("Lineup exports");
                                    return;
                                  }
                                  void exportLineupVersion(lineupVersion.id, "xlsx");
                                }}
                                disabled={activeLineupId === lineupVersion.id}
                              >
                                <Text style={styles.secondaryText}>Export Excel</Text>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.secondaryButton,
                                  pressed && { opacity: 0.85 },
                                  activeLineupId === lineupVersion.id && { opacity: 0.7 },
                                ]}
                                onPress={() => {
                                  if (!hasProSubscription) {
                                    onRequirePro("Lineup exports");
                                    return;
                                  }
                                  void exportLineupVersion(lineupVersion.id, "pdf");
                                }}
                                disabled={activeLineupId === lineupVersion.id}
                              >
                                <Text style={styles.secondaryText}>Export PDF</Text>
                              </Pressable>
                            </View>

                            {detail ? (
                              displayRows && displayRows.length > 0 ? (
                                <ScrollView
                                  style={styles.lineupTableScroll}
                                  contentContainerStyle={styles.lineupTableContent}
                                  nestedScrollEnabled
                                >
                                  <LineUp
                                    lineup={displayRows}
                                    expandedInnings={STATIC_EXPANDED_INNINGS}
                                    onToggleInning={() => {}}
                                    editable={editingLineupId === lineupVersion.id}
                                    playerGenderByName={playerGenderByName}
                                    onSetPlayerPosition={(inning, playerName, targetPosition) => {
                                      if (!normalizedRows || normalizedRows.length === 0) return;
                                      setDraftRowsByLineupId((prev) => {
                                        const currentRows =
                                          prev[lineupVersion.id] ?? cloneLineupRows(normalizedRows);
                                        return {
                                          ...prev,
                                          [lineupVersion.id]: applyLineupCellEdit(
                                            currentRows,
                                            inning,
                                            playerName,
                                            targetPosition,
                                          ),
                                        };
                                      });
                                    }}
                                  />
                                </ScrollView>
                              ) : (
                                <Text style={styles.lineupSlideMeta}>
                                  No player assignments found for this lineup.
                                </Text>
                              )
                            ) : (
                              <View style={styles.lineupLoadingWrap}>
                                <ActivityIndicator color={palette.accent} size="small" />
                                <Text style={styles.lineupSlideMeta}>
                                  {isLineupDetailsLoading
                                    ? "Loading lineup players..."
                                    : "Lineup details not loaded."}
                                </Text>
                              </View>
                            )}
                            {editingLineupId === lineupVersion.id ? (
                              <Text style={styles.lineupEditHint}>
                                Editing in modal. Tap Save to create a new edited version.
                              </Text>
                            ) : null}
                          </View>
                        );
                      })()
                    ))}
                  </ScrollView>
                </View>
                {lineupsForModal.length > 1 ? (
                  <View style={styles.carouselFooter}>
                    <Text style={styles.carouselCountText}>
                      {lineupCarouselIndex + 1} / {lineupsForModal.length}
                    </Text>
                    <View style={styles.carouselDots}>
                      {lineupsForModal.map((lineupVersion, index) => (
                        <View
                          key={`${lineupVersion.id}-${index}`}
                          style={[
                            styles.carouselDot,
                            index === lineupCarouselIndex && styles.carouselDotActive,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={isFormModalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeFormModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeFormModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalGrabber} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{form.id ? "Edit Game" : "New Game"}</Text>
              <Pressable
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
                onPress={closeFormModal}
                disabled={isSaving}
              >
                <Feather name="x" size={16} color={palette.text} />
              </Pressable>
            </View>

            <Text style={styles.modalSubtext}>Date: {dayKeyToReadable(selectedDateKey)}</Text>

            <ScrollView style={styles.modalFormScroll} contentContainerStyle={styles.modalFormContent}>
              <View style={styles.row}>
                <View style={styles.field}>
                  <Text style={styles.label}>Title</Text>
                  <TextInput
                    value={form.title}
                    onChangeText={(title) => setForm((prev) => ({ ...prev, title }))}
                    placeholder="Week 4 Matchup"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Opponent</Text>
                  <TextInput
                    value={form.opponentName}
                    onChangeText={(opponentName) =>
                      setForm((prev) => ({ ...prev, opponentName }))
                    }
                    placeholder="Tigers"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.field}>
                  <Text style={styles.label}>Date + Time</Text>
                  <TextInput
                    value={form.scheduledAtInput}
                    onChangeText={(scheduledAtInput) =>
                      setForm((prev) => ({ ...prev, scheduledAtInput }))
                    }
                    placeholder="2026-03-15T14:30"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Location</Text>
                  <TextInput
                    value={form.location}
                    onChangeText={(location) => setForm((prev) => ({ ...prev, location }))}
                    placeholder="Main Field"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.field}>
                  <Text style={styles.label}>Competition</Text>
                  <TextInput
                    value={form.competition}
                    onChangeText={(competition) =>
                      setForm((prev) => ({ ...prev, competition }))
                    }
                    placeholder="League"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Season</Text>
                  <TextInput
                    value={form.season}
                    onChangeText={(season) => setForm((prev) => ({ ...prev, season }))}
                    placeholder="Spring 2026"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.field}>
                  <Text style={styles.label}>Home/Away</Text>
                  <View style={styles.chipRow}>
                    {(["home", "away", "neutral"] as const).map((value) => (
                      <Pressable
                        key={value}
                        style={[styles.chip, form.homeAway === value && styles.chipActive]}
                        onPress={() => setHomeAway(value)}
                      >
                        <Text style={[styles.chipText, form.homeAway === value && styles.chipTextActive]}>
                          {value}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Status</Text>
                  <View style={styles.chipRow}>
                    {(["scheduled", "completed", "postponed", "cancelled"] as const).map(
                      (value) => (
                        <Pressable
                          key={value}
                          style={[styles.chip, form.status === value && styles.chipActive]}
                          onPress={() => setGameStatus(value)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              form.status === value && styles.chipTextActive,
                            ]}
                          >
                            {value}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.field}>
                  <Text style={styles.label}>Our Score</Text>
                  <TextInput
                    value={form.ourScoreInput}
                    onChangeText={(ourScoreInput) =>
                      setForm((prev) => ({ ...prev, ourScoreInput }))
                    }
                    keyboardType="number-pad"
                    placeholder="Optional"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Opponent Score</Text>
                  <TextInput
                    value={form.opponentScoreInput}
                    onChangeText={(opponentScoreInput) =>
                      setForm((prev) => ({ ...prev, opponentScoreInput }))
                    }
                    keyboardType="number-pad"
                    placeholder="Optional"
                    placeholderTextColor={palette.subtext}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <Pressable
                  style={[styles.flagButton, form.isLeagueGame && styles.flagButtonActive]}
                  onPress={() =>
                    setForm((prev) => ({ ...prev, isLeagueGame: !prev.isLeagueGame }))
                  }
                >
                  <Text style={styles.flagText}>League Game</Text>
                </Pressable>
                <Pressable
                  style={[styles.flagButton, form.isPlayoff && styles.flagButtonActive]}
                  onPress={() => setForm((prev) => ({ ...prev, isPlayoff: !prev.isPlayoff }))}
                >
                  <Text style={styles.flagText}>Playoff</Text>
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  value={form.notes}
                  onChangeText={(notes) => setForm((prev) => ({ ...prev, notes }))}
                  placeholder="Travel details, lineup notes, weather, officials..."
                  placeholderTextColor={palette.subtext}
                  style={styles.textarea}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.modalActionRow}>
                <Pressable
                  style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.85 }]}
                  onPress={closeFormModal}
                  disabled={isSaving}
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && { opacity: 0.85 },
                    isSaving && { opacity: 0.7 },
                  ]}
                  onPress={handleSaveGame}
                  disabled={isSaving}
                >
                  <Text style={styles.primaryText}>{isSaving ? "Saving..." : "Save Game"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.cardAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroCard: {
    backgroundColor: palette.cardAlt,
    borderRadius: 20,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 22,
  },
  heroSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 10,
  },
  yearHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  yearActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  yearText: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 20,
    minWidth: 64,
    textAlign: "center",
  },
  selectedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectedDateText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
    flex: 1,
  },
  monthCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    padding: 10,
    gap: 8,
  },
  weekdaysRow: {
    flexDirection: "row",
  },
  weekdayLabel: {
    width: "14.2857%",
    textAlign: "center",
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 11,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  dayCell: {
    width: "14.2857%",
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dayCellOutside: {
    opacity: 0.5,
  },
  dayCellToday: {
    borderColor: "rgba(126,207,157,0.65)",
  },
  dayCellSelected: {
    borderColor: "rgba(242,166,59,0.9)",
    backgroundColor: "rgba(242,166,59,0.16)",
  },
  dayCellText: {
    color: palette.text,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  dayCellTextOutside: {
    color: palette.subtext,
  },
  dayCellTextSelected: {
    fontFamily: typeface.heading,
  },
  dayBadge: {
    position: "absolute",
    top: 2,
    right: 1,
    minWidth: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  dayBadgeText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 8,
    lineHeight: 10,
  },
  cardTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 15,
  },
  dayPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dayPageSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  dayPageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    color: palette.text,
    fontFamily: typeface.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    color: palette.text,
    fontFamily: typeface.body,
    paddingHorizontal: 12,
    paddingVertical: 10,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
  },
  chipActive: {
    borderColor: palette.accent,
    backgroundColor: "rgba(242, 166, 59, 0.16)",
  },
  chipText: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 12,
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: palette.text,
  },
  flagButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  flagButtonActive: {
    borderColor: "rgba(126,207,157,0.6)",
    backgroundColor: "rgba(126,207,157,0.16)",
  },
  flagText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  primaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.75)",
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 130,
  },
  primaryText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  primarySmallButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.75)",
    backgroundColor: palette.accent,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  primarySmallText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  smallButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
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
  error: {
    color: palette.danger,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  status: {
    color: palette.success,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  gameList: {
    gap: 10,
  },
  gameRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12,
    gap: 10,
  },
  gameInfo: {
    gap: 3,
  },
  gameTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 14,
  },
  gameMeta: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  scoreText: {
    color: palette.success,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  lineupInfoWrap: {
    marginTop: 2,
    gap: 2,
  },
  lineupCountText: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  lineupMetaText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  deleteButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,107,91,0.45)",
    backgroundColor: "rgba(239,107,91,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  deleteText: {
    color: palette.danger,
    fontFamily: typeface.heading,
    fontSize: 12,
  },
  emptyText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  lineupEmptyState: {
    gap: 10,
    alignItems: "flex-start",
  },
  lineupModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(7, 14, 11, 0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  lineupModalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    padding: 14,
    gap: 10,
  },
  lineupCarouselViewport: {
    width: "100%",
  },
  lineupSlide: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    padding: 12,
    gap: 6,
  },
  lineupSlideTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 14,
  },
  lineupSlideMeta: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  lineupEditHint: {
    color: palette.accent,
    fontFamily: typeface.body,
    fontSize: 11,
    marginTop: 4,
  },
  lineupActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  lineupTableScroll: {
    marginTop: 6,
    maxHeight: 330,
  },
  lineupTableContent: {
    paddingBottom: 4,
  },
  lineupLoadingWrap: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  carouselFooter: {
    alignItems: "center",
    gap: 6,
  },
  carouselCountText: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
  },
  carouselDots: {
    flexDirection: "row",
    gap: 6,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  carouselDotActive: {
    backgroundColor: palette.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(7, 14, 11, 0.62)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
  },
  modalGrabber: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 99,
    backgroundColor: palette.border,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 16,
  },
  modalSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 12,
  },
  modalFormScroll: {
    maxHeight: "100%",
  },
  modalFormContent: {
    gap: 10,
    paddingBottom: 10,
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 2,
  },
});

export default CalendarScreen;
