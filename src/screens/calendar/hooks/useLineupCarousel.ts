import { useCallback, useState } from "react";
import { Share } from "react-native";
import { backendClient } from "../../../lib/backend/client";
import {
  BackendGame,
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
} from "../../../lib/backend/types";
import { useToast } from "../../../components/ui";
import { InningAssignment } from "../../../types/lineup";
import { parseTeamRulesConfig } from "../../../types/rules";
import {
  cloneLineupRows,
  normalizeBenchNames,
  toLineupRowsPayload,
  validateEditedLineupForSave,
} from "../../../utils/lineupTransforms";

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

// Applies a single cell edit (player -> position or bench) to a draft lineup.
// Mirrors the swap semantics of the lineup screen's inline editor.
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

type Params = {
  ensureTeam: () => Promise<string | null>;
  loadGames: () => Promise<void>;
  lineupsByGameId: Map<string, BackendLineupVersionSummary[]>;
};

// Saved-lineups sheet state: which game's lineups are showing, the carousel
// position, lazily loaded lineup details, and the draft-edit/save flow.
export const useLineupCarousel = ({
  ensureTeam,
  loadGames,
  lineupsByGameId,
}: Params) => {
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalGameId, setModalGameId] = useState<string | null>(null);
  const [lineups, setLineups] = useState<BackendLineupVersionSummary[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [detailsById, setDetailsById] = useState<
    Record<string, BackendLineupVersionDetail>
  >({});
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [activeLineupId, setActiveLineupId] = useState<string | null>(null);
  const [editingLineupId, setEditingLineupId] = useState<string | null>(null);
  const [draftRowsByLineupId, setDraftRowsByLineupId] = useState<
    Record<string, InningAssignment[]>
  >({});

  const close = useCallback(() => {
    setIsOpen(false);
    setEditingLineupId(null);
  }, []);

  const openForGame = useCallback(
    async (game: BackendGame) => {
      const title = `${game.title || "Untitled Game"} vs ${game.opponentName || "TBD"}`;
      const versions = game.id ? lineupsByGameId.get(game.id) ?? [] : [];
      setModalTitle(title);
      setModalGameId(game.id ?? null);
      setLineups(versions);
      setCarouselIndex(0);
      setDetailsError(null);
      setEditingLineupId(null);
      setDraftRowsByLineupId({});
      setIsOpen(true);

      if (versions.length === 0) return;

      try {
        const team = await ensureTeam();
        if (!team) return;
        setIsDetailsLoading(true);
        const pending = versions.filter((version) => !detailsById[version.id]);
        if (pending.length === 0) return;

        const loaded = await Promise.all(
          pending.map((version) => backendClient.getLineupVersion(team, version.id)),
        );

        setDetailsById((prev) => {
          const next = { ...prev };
          loaded.forEach((detail) => {
            next[detail.id] = detail;
          });
          return next;
        });
      } catch (_err) {
        setDetailsError("Unable to load lineup details.");
      } finally {
        setIsDetailsLoading(false);
      }
    },
    [detailsById, ensureTeam, lineupsByGameId],
  );

  const toggleEditing = useCallback(
    (lineupId: string, normalizedRows: InningAssignment[] | null) => {
      if (!normalizedRows || normalizedRows.length === 0) return;
      if (editingLineupId === lineupId) {
        setEditingLineupId(null);
        return;
      }
      setEditingLineupId(lineupId);
      setDraftRowsByLineupId((prev) => {
        if (prev[lineupId]) return prev;
        return {
          ...prev,
          [lineupId]: cloneLineupRows(normalizedRows),
        };
      });
    },
    [editingLineupId],
  );

  const applyCellEdit = useCallback(
    (
      lineupId: string,
      normalizedRows: InningAssignment[] | null,
      inning: number,
      playerName: string,
      targetPosition: string,
    ) => {
      if (!normalizedRows || normalizedRows.length === 0) return;
      setDraftRowsByLineupId((prev) => {
        const currentRows = prev[lineupId] ?? cloneLineupRows(normalizedRows);
        return {
          ...prev,
          [lineupId]: applyLineupCellEdit(currentRows, inning, playerName, targetPosition),
        };
      });
    },
    [],
  );

  const exportLineupVersion = useCallback(
    async (lineupId: string, format: "xlsx" | "pdf") => {
      try {
        const team = await ensureTeam();
        if (!team) return;

        setActiveLineupId(lineupId);
        setDetailsError(null);

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
        toast.show({ type: "success", message: `${format.toUpperCase()} exported.` });
      } catch (_err) {
        setDetailsError(`Unable to export ${format.toUpperCase()}.`);
      } finally {
        setActiveLineupId(null);
      }
    },
    [ensureTeam, toast],
  );

  const saveEditedLineupVersion = useCallback(
    async (lineupVersion: BackendLineupVersionSummary) => {
      try {
        const editedRows = draftRowsByLineupId[lineupVersion.id];
        if (!editedRows || editedRows.length === 0) {
          setDetailsError("No edited lineup to save.");
          return;
        }

        const team = await ensureTeam();
        if (!team) return;

        setActiveLineupId(lineupVersion.id);
        setDetailsError(null);

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
          setDetailsError(validationError);
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
          gameTitle: lineupVersion.gameTitle || modalTitle || null,
          lineupName: lineupVersion.lineupName || `Lineup v${lineupVersion.versionNumber}`,
          rows: toLineupRowsPayload(editedRows),
          parentLineupId: lineupVersion.id,
          source: "manualEdit",
          rulesConfig,
        });

        setDetailsById((prev) => ({
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
        setLineups(refreshedLineups);
        setCarouselIndex(0);
        setEditingLineupId(null);
        setDraftRowsByLineupId({});

        await loadGames();
        toast.show({
          type: "success",
          message: `Saved ${saved.lineupName || `v${saved.versionNumber}`}.`,
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Unable to save edited lineup.";
        setDetailsError(message);
      } finally {
        setActiveLineupId(null);
      }
    },
    [draftRowsByLineupId, ensureTeam, loadGames, modalTitle, toast],
  );

  return {
    isOpen,
    close,
    openForGame,
    modalTitle,
    modalGameId,
    lineups,
    carouselIndex,
    setCarouselIndex,
    detailsById,
    isDetailsLoading,
    detailsError,
    activeLineupId,
    editingLineupId,
    draftRowsByLineupId,
    toggleEditing,
    applyCellEdit,
    exportLineupVersion,
    saveEditedLineupVersion,
  };
};
