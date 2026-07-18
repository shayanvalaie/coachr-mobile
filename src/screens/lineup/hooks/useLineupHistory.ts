import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import { LayoutAnimation, Share } from "react-native";
import { useToast } from "../../../components/ui";
import { backendClient } from "../../../lib/backend/client";
import {
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
} from "../../../lib/backend/types";
import { InningAssignment } from "../../../types/lineup";
import {
  cloneLineupRows,
  normalizeLineupRows,
  summarizeLineupComparison,
} from "../../../utils/lineupTransforms";
import {
  lockOrientation,
  ORIENTATION_LOCK_LANDSCAPE,
} from "../orientation";

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

type Params = {
  ensureTeam: () => Promise<string | null>;
  selectedGameId: string | null;
  setStatus: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLineup: Dispatch<SetStateAction<InningAssignment[] | null>>;
  setLineupInlineEditMode: Dispatch<SetStateAction<boolean>>;
  setEditModalVisible: Dispatch<SetStateAction<boolean>>;
  setLineupParentVersionId: Dispatch<SetStateAction<string | null>>;
  setHistoryEditRows: Dispatch<SetStateAction<InningAssignment[] | null>>;
  setActiveTab: Dispatch<SetStateAction<"build" | "history">>;
  onEditModeChange?: (editing: boolean) => void;
};

// Saved lineup versions: list, detail view, compare, delete, and export.
export const useLineupHistory = ({
  ensureTeam,
  selectedGameId,
  setStatus,
  setError,
  setLineup,
  setLineupInlineEditMode,
  setEditModalVisible,
  setLineupParentVersionId,
  setHistoryEditRows,
  setActiveTab,
  onEditModeChange,
}: Params) => {
  const toast = useToast();
  const [lineupHistory, setLineupHistory] = useState<
    BackendLineupVersionSummary[]
  >([]);
  // Starts true: the History tab is the screen's default view, so the first
  // paint must be the loading state, not a flash of "No saved lineups yet".
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryDetail, setSelectedHistoryDetail] =
    useState<BackendLineupVersionDetail | null>(null);
  const [compareBase, setCompareBase] =
    useState<BackendLineupVersionDetail | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [pendingDeleteLineup, setPendingDeleteLineup] =
    useState<BackendLineupVersionSummary | null>(null);
  const [isDeletingLineup, setIsDeletingLineup] = useState(false);
  // Export gets its own busy flag, kept separate from `activeHistoryId` so the
  // history-card spinner never gets wedged by an in-flight or dismissed share.
  const [isExporting, setIsExporting] = useState(false);

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
        // `historyLoading` began true; every path out of this bootstrap must
        // clear it or the skeleton never resolves.
        if (!team) {
          setHistoryLoading(false);
          return;
        }
        return loadLineupHistory(team, selectedGameId);
      })
      .catch(() => {
        setHistoryError("Unable to load lineup history.");
        setHistoryLoading(false);
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
        // Open saved lineups straight into the landscape editor: seed the edit
        // buffer with the saved rows so users land in edit mode with just
        // Save / Cancel, no intermediate read-only step.
        const editableRows = normalizeLineupRows(detail.rows as any[]);
        setSelectedHistoryDetail(detail);
        setHistoryEditRows(cloneLineupRows(editableRows));
        setLineupParentVersionId(detail.id);
        setActiveTab("history");
        await lockOrientation(ORIENTATION_LOCK_LANDSCAPE);
        setEditModalVisible(true);
        setLineupInlineEditMode(true);
        onEditModeChange?.(true);
      } catch (_err) {
        toast.show({ message: "Unable to open lineup details.", type: "error" });
      } finally {
        setActiveHistoryId(null);
      }
    },
    [
      ensureTeam,
      onEditModeChange,
      setActiveTab,
      setEditModalVisible,
      setError,
      setHistoryEditRows,
      setLineupInlineEditMode,
      setLineupParentVersionId,
      toast,
    ],
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
      setError(null);
      setPendingDeleteLineup(null);
      toast.show({ message: "Lineup deleted.", type: "success" });
    } catch (_err) {
      toast.show({ message: "Unable to delete lineup.", type: "error" });
    } finally {
      setIsDeletingLineup(false);
    }
  }, [ensureTeam, pendingDeleteLineup, isDeletingLineup, setError, toast]);

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
        toast.show({
          message: "Unable to restore lineup version.",
          type: "error",
        });
      } finally {
        setActiveHistoryId(null);
      }
    },
    [
      ensureTeam,
      setActiveTab,
      setEditModalVisible,
      setHistoryEditRows,
      setLineup,
      setLineupInlineEditMode,
      setLineupParentVersionId,
      setStatus,
      toast,
    ],
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
        toast.show({
          message: "Unable to compare lineup versions.",
          type: "error",
        });
      } finally {
        setActiveHistoryId(null);
      }
    },
    [compareBase, ensureTeam, setStatus, toast],
  );

  const exportLineupVersion = useCallback(
    async (lineupId: string, format: "xlsx" | "pdf") => {
      setIsExporting(true);
      try {
        const team = await ensureTeam();
        if (!team) return;

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

        // The file is ready. Clear the busy state before opening the native
        // share sheet: its promise only settles when the user dismisses the
        // sheet, so awaiting it would keep the export buttons disabled the whole
        // time it is open (and can hang if the sheet fails to present under the
        // landscape orientation lock). Fire-and-forget instead.
        setIsExporting(false);
        Share.share({
          title: exported.fileName,
          message: `Lineup export: ${exported.fileName}`,
          url: uri,
        })
          .then(() => {
            toast.show({
              message: `${format.toUpperCase()} exported.`,
              type: "success",
            });
          })
          .catch(() => {
            // Share dismissed or cancelled — nothing to report.
          });
      } catch (_err) {
        toast.show({
          message: `Unable to export ${format.toUpperCase()}.`,
          type: "error",
        });
      } finally {
        setIsExporting(false);
      }
    },
    [ensureTeam, toast],
  );

  return {
    lineupHistory,
    historyLoading,
    historyError,
    selectedHistoryDetail,
    setSelectedHistoryDetail,
    compareBase,
    setCompareBase,
    activeHistoryId,
    setActiveHistoryId,
    pendingDeleteLineup,
    setPendingDeleteLineup,
    isDeletingLineup,
    isExporting,
    loadLineupHistory,
    openLineupHistoryDetail,
    confirmDeleteLineup,
    restoreLineupVersion,
    compareLineupVersion,
    exportLineupVersion,
  };
};
