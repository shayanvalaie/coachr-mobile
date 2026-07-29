import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { LayoutAnimation, TextInput } from "react-native";
import { backendClient } from "../../../lib/backend/client";
import {
  BackendGame,
  BackendLineupVersionDetail,
} from "../../../lib/backend/types";
import { hasHttpStatus, toError } from "../../../lib/backend/utils";
import { InningAssignment } from "../../../types/lineup";
import { parseTeamRulesConfig, TeamRulesConfig } from "../../../types/rules";
import {
  cloneLineupRows,
  formatGameLabel,
  normalizeBenchNames,
  normalizeLineupRows,
  toLineupRowsPayload,
  validateEditedLineupForSave,
} from "../../../utils/lineupTransforms";
import {
  lockOrientation,
  ORIENTATION_LOCK_LANDSCAPE,
  ORIENTATION_LOCK_PORTRAIT_UP,
} from "../orientation";

type Params = {
  lineup: InningAssignment[] | null;
  setLineup: Dispatch<SetStateAction<InningAssignment[] | null>>;
  editModalVisible: boolean;
  setEditModalVisible: Dispatch<SetStateAction<boolean>>;
  setLineupInlineEditMode: Dispatch<SetStateAction<boolean>>;
  lineupParentVersionId: string | null;
  setLineupParentVersionId: Dispatch<SetStateAction<string | null>>;
  historyEditRows: InningAssignment[] | null;
  setHistoryEditRows: Dispatch<SetStateAction<InningAssignment[] | null>>;
  selectedHistoryDetail: BackendLineupVersionDetail | null;
  setSelectedHistoryDetail: Dispatch<
    SetStateAction<BackendLineupVersionDetail | null>
  >;
  setActiveTab: Dispatch<SetStateAction<"build" | "history">>;
  setStatus: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  ensureTeam: () => Promise<string | null>;
  games: BackendGame[];
  selectedGameId: string | null;
  rulesConfig: TeamRulesConfig | null;
  loadLineupHistory: (team: string, gameId: string | null) => Promise<void>;
  onEditModeChange?: (editing: boolean) => void;
};

// Inline lineup editing: the landscape edit overlay, cell swaps, and saving
// edited lineups as new versions.
export const useLineupEditor = ({
  lineup,
  setLineup,
  editModalVisible,
  setEditModalVisible,
  setLineupInlineEditMode,
  lineupParentVersionId,
  setLineupParentVersionId,
  historyEditRows,
  setHistoryEditRows,
  selectedHistoryDetail,
  setSelectedHistoryDetail,
  setActiveTab,
  setStatus,
  setError,
  ensureTeam,
  games,
  selectedGameId,
  rulesConfig,
  loadLineupHistory,
  onEditModeChange,
}: Params) => {
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveLineupName, setSaveLineupName] = useState("");
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const saveLineupNameInputRef = useRef<TextInput | null>(null);

  // Undo history for inline edits. Each snapshot is a full clone of the rows
  // captured immediately before a swap is applied; the ref holds the stack
  // (mutating it must not re-render) while `undoDepth` mirrors its length so
  // the back button can flip between enabled/disabled.
  const undoStackRef = useRef<InningAssignment[][]>([]);
  const [undoDepth, setUndoDepth] = useState(0);

  const resetUndoHistory = useCallback(() => {
    undoStackRef.current = [];
    setUndoDepth(0);
  }, []);

  useEffect(() => {
    if (!saveModalVisible) return;
    const timer = setTimeout(() => {
      saveLineupNameInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [saveModalVisible]);

  useEffect(
    () => () => {
      lockOrientation(ORIENTATION_LOCK_PORTRAIT_UP);
    },
    [],
  );

  const dismissEditModal = useCallback(() => {
    setEditModalVisible(false);
    setSaveModalVisible(false);
    setLineupInlineEditMode(false);
    setHistoryEditRows(null);
    setSelectedHistoryDetail(null);
    setError(null);
    resetUndoHistory();
    lockOrientation(ORIENTATION_LOCK_PORTRAIT_UP);
    onEditModeChange?.(false);
  }, [
    onEditModeChange,
    resetUndoHistory,
    setEditModalVisible,
    setError,
    setHistoryEditRows,
    setLineupInlineEditMode,
    setSelectedHistoryDetail,
  ]);

  const finishInlineEdit = useCallback(() => {
    if (selectedHistoryDetail) {
      setLineupInlineEditMode(false);
      setSaveModalVisible(false);
      setHistoryEditRows(null);
      setActiveTab("history");
      setError(null);
      resetUndoHistory();
      onEditModeChange?.(false);
      setStatus(`Returned to lineup v${selectedHistoryDetail.versionNumber}.`);
      return;
    }

    dismissEditModal();
  }, [
    dismissEditModal,
    onEditModeChange,
    resetUndoHistory,
    selectedHistoryDetail,
    setActiveTab,
    setError,
    setHistoryEditRows,
    setLineupInlineEditMode,
    setStatus,
  ]);

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
    resetUndoHistory();
    setLineupInlineEditMode(true);
    setEditModalVisible(true);
    onEditModeChange?.(true);
    setStatus("Edit mode enabled. Use the wider editor to change positions.");
    setError(null);
  }, [
    dismissEditModal,
    editModalVisible,
    lineup,
    onEditModeChange,
    resetUndoHistory,
    setEditModalVisible,
    setError,
    setLineupInlineEditMode,
    setStatus,
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

      // Compute the result up front so the swap can be skipped (and no undo
      // snapshot recorded) when the tap doesn't actually change the lineup —
      // e.g. dropping a player back onto the slot they already occupy.
      const currentRows = selectedHistoryDetail ? historyEditRows : lineup;
      const nextRows = applySwap(currentRows);
      const changed =
        !!currentRows &&
        !!nextRows &&
        JSON.stringify(currentRows) !== JSON.stringify(nextRows);
      if (!changed) return;

      // Push the pre-edit state so the back button can revert exactly this swap.
      undoStackRef.current.push(cloneLineupRows(currentRows));
      setUndoDepth(undoStackRef.current.length);

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (selectedHistoryDetail) {
        setHistoryEditRows(nextRows);
      } else {
        setLineup(nextRows);
      }
      setStatus(
        "Manual edits applied inline. Save lineup if you want to keep this version.",
      );
      setError(null);
    },
    [
      historyEditRows,
      lineup,
      selectedHistoryDetail,
      setError,
      setHistoryEditRows,
      setLineup,
      setStatus,
    ],
  );

  // Revert the most recent inline swap, restoring the snapshot captured just
  // before it. Routes the restore to whichever buffer is being edited (a fresh
  // lineup vs. a saved history version).
  const undoLastEdit = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;

    const previous = stack.pop()!;
    setUndoDepth(stack.length);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (selectedHistoryDetail) {
      setHistoryEditRows(cloneLineupRows(previous));
    } else {
      setLineup(cloneLineupRows(previous));
    }
    setStatus("Reverted the last change.");
    setError(null);
  }, [
    selectedHistoryDetail,
    setError,
    setHistoryEditRows,
    setLineup,
    setStatus,
  ]);

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

      let spinnerStartedAt: number | null = null;
      try {
        const team = await ensureTeam();
        if (!team) return;
        spinnerStartedAt = Date.now();
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
        setSaveLineupName("");
        if (editModalVisible) {
          // Saving from the landscape editor is a completion point: close the
          // full-screen overlay and return to portrait instead of leaving the
          // coach in the wide editor.
          dismissEditModal();
          if (isHistoryEdit) {
            setActiveTab("history");
          }
        } else {
          setSaveModalVisible(false);
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
            setHistoryEditRows(cloneLineupRows(rowsToSave));
            setActiveTab("history");
          }
        }
        setStatus(`Saved ${saved.lineupName || `v${saved.versionNumber}`}.`);
      } catch (err) {
        // A 409 duplicate means an identical lineup is already in history for
        // this game context — there's nothing more to save, so treat it as a
        // completion: close the landscape editor (if open) and report it as
        // already saved rather than surfacing a blocking error.
        if (
          hasHttpStatus(err, 409) &&
          /already exists/i.test(toError(err).message)
        ) {
          setSaveLineupName("");
          setError(null);
          if (editModalVisible) {
            dismissEditModal();
            if (isHistoryEdit) {
              setActiveTab("history");
            }
          } else {
            setSaveModalVisible(false);
          }
          setStatus("This lineup is already saved in history.");
          return;
        }
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Unable to save lineup version.";
        setError(message);
      } finally {
        // Keep the spinner up for a minimum beat so a fast save doesn't flicker.
        if (spinnerStartedAt !== null) {
          const elapsed = Date.now() - spinnerStartedAt;
          const MIN_SPINNER_MS = 600;
          if (elapsed < MIN_SPINNER_MS) {
            await new Promise((resolve) =>
              setTimeout(resolve, MIN_SPINNER_MS - elapsed),
            );
          }
        }
        setIsSavingVersion(false);
      }
    },
    [
      dismissEditModal,
      editModalVisible,
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
      setActiveTab,
      setError,
      setHistoryEditRows,
      setLineupParentVersionId,
      setSelectedHistoryDetail,
      setStatus,
    ],
  );

  return {
    saveModalVisible,
    setSaveModalVisible,
    saveLineupName,
    setSaveLineupName,
    isSavingVersion,
    saveLineupNameInputRef,
    dismissEditModal,
    finishInlineEdit,
    toggleInlineEditMode,
    applyInlinePositionSwap,
    undoLastEdit,
    canUndo: undoDepth > 0,
    saveCurrentLineupVersion,
  };
};
