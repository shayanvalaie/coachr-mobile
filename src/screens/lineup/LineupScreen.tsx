import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import {
  AppText,
  Button,
  PageHeader,
  Reveal,
  ScreenContainer,
  SegmentedControl,
  Sheet,
  useToast,
} from "../../components/ui";
import { Feather } from "../../icons";
import { backendClient } from "../../lib/backend/client";
import { BackendSession } from "../../lib/backend/types";
import { theme } from "../../theme/colors";
import { motion, radius, space, TAB_BAR_CLEARANCE } from "../../theme/tokens";
import { InningAssignment } from "../../types/lineup";
import { LineupLaunchRequest } from "../../types/lineupLaunch";
import { navigateFromRef } from "../../navigation/navigationRef";
import { formatGameLabel, normalizeLineupRows } from "../../utils/lineupTransforms";
import BuildTab from "./components/BuildTab";
import EditLineupOverlay from "./components/EditLineupOverlay";
import HistoryCard from "./components/HistoryCard";
import HistoryTab from "./components/HistoryTab";
import SaveLineupSheet from "./components/SaveLineupSheet";
import { useLineupData } from "./hooks/useLineupData";
import { useLineupEditor } from "./hooks/useLineupEditor";
import { useLineupGeneration } from "./hooks/useLineupGeneration";
import { useLineupHistory } from "./hooks/useLineupHistory";
import {
  lockOrientation,
  ORIENTATION_LOCK_LANDSCAPE,
  ORIENTATION_LOCK_PORTRAIT_UP,
} from "./orientation";

type Props = {
  session: BackendSession;
  onOpenRoster: () => void;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
  launchRequest?: LineupLaunchRequest | null;
  onLaunchRequestHandled?: (requestId: number) => void;
  onEditModeChange?: (editing: boolean) => void;
};

const TAB_OPTIONS: Array<{ key: "build" | "history"; label: string }> = [
  { key: "build", label: "Generate" },
  { key: "history", label: "Saved" },
];

const LineupScreen = ({
  session,
  onOpenRoster,
  hasProSubscription,
  onRequirePro,
  launchRequest = null,
  onLaunchRequestHandled,
  onEditModeChange,
}: Props) => {
  // Cross-cutting document/UI state shared between the hooks below.
  const [activeTab, setActiveTab] = useState<"build" | "history">("history");
  const [lineup, setLineup] = useState<InningAssignment[] | null>(null);
  const [lineupParentVersionId, setLineupParentVersionId] = useState<
    string | null
  >(null);
  const [lineupInlineEditMode, setLineupInlineEditMode] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [expandedInnings, setExpandedInnings] = useState<Set<number>>(
    new Set(),
  );
  const [historyEditRows, setHistoryEditRows] = useState<
    InningAssignment[] | null
  >(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const handledLaunchRequestIdsRef = useRef<Set<number>>(new Set());
  const latestLaunchRequestIdRef = useRef<number | null>(null);
  // Animated ref for the build tab's ScrollView. It's animated because the
  // sortable lineup grid drives it for edge auto-scroll while dragging rows.
  const buildScrollRef = useAnimatedRef<Animated.ScrollView>();
  // Refs backing the "jump to lineup" toast action: a wrapper for the
  // ScrollView's window position, an anchor around the finished lineup, and the
  // live scroll offset. Together they translate the anchor's window position
  // into a scroll target (measureInWindow works on both RN architectures).
  const buildScrollWrapRef = useRef<View>(null);
  const lineupAnchorRef = useRef<View>(null);
  const buildScrollOffsetRef = useRef(0);
  const wasGeneratingRef = useRef(false);
  const toast = useToast();

  // Bring the freshly generated lineup into view. Used by the generation toast
  // so a user who scrolled away — or is on another tab entirely — can tap to
  // jump to it. The toast lives at the app root, so it survives navigation; we
  // first route back to the Lineup tab, then scroll once it's on screen.
  const scrollToLineup = useCallback(() => {
    navigateFromRef("Main", { screen: "LineupTab" });
    setActiveTab("build");
    // Give the tab a beat to re-attach (react-native-screens detaches inactive
    // tabs) and the switch to build to commit before we measure. The offset is
    // derived from the anchor's position relative to the scroll wrapper, so
    // both moving together during the tab transition doesn't skew it.
    setTimeout(() => {
      const scroll = buildScrollRef.current;
      const anchor = lineupAnchorRef.current;
      const wrap = buildScrollWrapRef.current;
      if (!scroll || !anchor || !wrap) return;
      wrap.measureInWindow((_wx, wy) => {
        anchor.measureInWindow((_ax, ay) => {
          const target = buildScrollOffsetRef.current + (ay - wy) - space.md;
          scroll.scrollTo({ y: Math.max(target, 0), animated: true });
        });
      });
    }, 300);
  }, [buildScrollRef]);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const {
    roster,
    games,
    selectedGameId,
    setSelectedGameId,
    teamRules,
    rulesConfig,
    ensureTeam,
    loadTeamContext,
    activePlayers,
    playerGenderByName,
    selectedGame,
  } = useLineupData({ session, setError });

  const {
    lineupHistory,
    historyLoading,
    historyError,
    selectedHistoryDetail,
    setSelectedHistoryDetail,
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
    exportLineupVersion,
  } = useLineupHistory({
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
  });

  // Duplicate rejection on a direct save from the landscape editor: the
  // overlay is already torn down by then, so the notice is a tappable toast
  // that routes to the existing saved lineup.
  const handleDuplicateLineup = useCallback(
    (duplicateLineupId: string | null) => {
      toast.show({
        message: "This lineup has already been saved.",
        type: "info",
        durationMs: 6000,
        actionLabel: duplicateLineupId ? "Tap to view the saved lineup" : undefined,
        onPress: duplicateLineupId
          ? () => void openLineupHistoryDetail(duplicateLineupId)
          : undefined,
      });
    },
    [openLineupHistoryDetail, toast],
  );

  const {
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
    canUndo,
    saveCurrentLineupVersion,
    duplicateSave,
    clearDuplicateSave,
  } = useLineupEditor({
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
    onDuplicateLineup: handleDuplicateLineup,
  });

  const {
    isGenerating,
    rosterRequirement,
    setRosterRequirement,
    setPendingAutoGenerate,
    runLineupGeneration,
  } = useLineupGeneration({
    ensureTeam,
    teamRules,
    activePlayers,
    hasProSubscription,
    games,
    selectedGameId,
    setStatus,
    setError,
    setLineup,
    setLineupInlineEditMode,
    setEditModalVisible,
    setHistoryEditRows,
    setLineupParentVersionId,
    setExpandedInnings,
    setSaveModalVisible,
    setSaveLineupName,
  });

  // Confirm a finished generation with a toast. Only fires on the generating ->
  // idle transition (with a real lineup), so inline edits stay quiet.
  useEffect(() => {
    const justFinished = wasGeneratingRef.current && !isGenerating;
    wasGeneratingRef.current = isGenerating;
    if (!justFinished) return;
    if (!lineup || lineup.length === 0) return;
    toast.show({
      message: "Lineup generated",
      type: "success",
      actionLabel: "Tap to jump to your lineup",
      durationMs: 6000,
      onPress: scrollToLineup,
    });
  }, [isGenerating, lineup, scrollToLineup, toast]);

  useEffect(() => {
    if (!launchRequest) return;
    if (handledLaunchRequestIdsRef.current.has(launchRequest.id)) return;
    handledLaunchRequestIdsRef.current.add(launchRequest.id);
    latestLaunchRequestIdRef.current = launchRequest.id;

    // A request is only abandoned when a newer one supersedes it. The effect
    // re-runs as its dependencies settle (e.g. the team id loading), and an
    // effect-cleanup flag would cancel the request mid-flight on first mount.
    const isSuperseded = () =>
      latestLaunchRequestIdRef.current !== launchRequest.id;

    const applyLaunchRequest = async () => {
      try {
        setError(null);
        setActiveTab("build");
        setSelectedHistoryDetail(null);
        setHistoryEditRows(null);
        setCompareBase(null);
        setEditModalVisible(false);
        setSaveModalVisible(false);

        if (launchRequest.gameId !== undefined) {
          setSelectedGameId(launchRequest.gameId);
        }

        if (launchRequest.lineupVersionId) {
          const team = await ensureTeam();
          if (!team || isSuperseded()) return;

          setActiveHistoryId(launchRequest.lineupVersionId);
          const detail = await backendClient.getLineupVersion(
            team,
            launchRequest.lineupVersionId,
          );
          if (isSuperseded()) return;

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
          // Pull the latest roster (with the newest bench choices) before
          // generating. The focus reload also does this, but auto-generate
          // must not race it — await here so generation sees fresh data.
          await loadTeamContext();
          if (isSuperseded()) return;
          setPendingAutoGenerate({
            requestId: launchRequest.id,
            gameId: launchRequest.gameId,
          });
        }
      } catch (_err) {
        if (!isSuperseded()) {
          setError("Unable to open lineup context.");
        }
      } finally {
        if (!isSuperseded()) {
          setActiveHistoryId(null);
          onLaunchRequestHandled?.(launchRequest.id);
        }
      }
    };

    applyLaunchRequest().catch(() => {
      setError("Unable to open lineup context.");
      onLaunchRequestHandled?.(launchRequest.id);
    });
  }, [
    ensureTeam,
    launchRequest,
    loadTeamContext,
    onEditModeChange,
    onLaunchRequestHandled,
    setActiveHistoryId,
    setCompareBase,
    setPendingAutoGenerate,
    setSaveModalVisible,
    setSelectedGameId,
    setSelectedHistoryDetail,
  ]);

  const activeCount = activePlayers.length;
  const isManualEditSave = !!lineupParentVersionId;
  const selectedHistoryRows = useMemo(
    () =>
      selectedHistoryDetail
        ? normalizeLineupRows(selectedHistoryDetail.rows as any[])
        : null,
    [selectedHistoryDetail],
  );
  // Saved lineups now open straight into the landscape editor, so a history
  // lineup in the overlay is always an edit (never a read-only detail view).
  const isHistoryEdit = !!selectedHistoryDetail;
  const editModalLineup = lineupInlineEditMode
    ? selectedHistoryDetail
      ? historyEditRows
      : lineup
    : selectedHistoryDetail
      ? selectedHistoryRows
      : lineup;

  // Save from the landscape editor. A saved (history) lineup already has a
  // name, so it persists directly. A freshly generated lineup needs a name,
  // which means opening the SaveLineupSheet — but that sheet is a native
  // Modal, and presenting a Modal while the editor still holds the landscape
  // orientation lock crashes on iOS (the same constraint that makes this
  // editor a plain overlay instead of a Sheet). So for a fresh lineup we tear
  // down the landscape overlay and wait for the return to portrait before
  // presenting the naming sheet, matching the build tab's "Save lineup" flow.
  const handleOverlaySavePress = useCallback(() => {
    if (selectedHistoryDetail) {
      void saveCurrentLineupVersion(
        saveLineupName ||
          selectedHistoryDetail.lineupName ||
          `Lineup v${selectedHistoryDetail.versionNumber}`,
      );
      return;
    }
    void (async () => {
      dismissEditModal();
      await lockOrientation(ORIENTATION_LOCK_PORTRAIT_UP);
      setSaveModalVisible(true);
    })();
  }, [
    dismissEditModal,
    saveCurrentLineupVersion,
    saveLineupName,
    selectedHistoryDetail,
    setSaveModalVisible,
  ]);

  const headerTitle =
    activeTab === "build"
      ? lineup && selectedGame
        ? formatGameLabel(selectedGame)
        : lineup
          ? "Lineup"
          : "Build"
      : "Saved";

  const header = (
    <View style={styles.headerBlock}>
      <PageHeader eyebrow="Lineup" title={headerTitle} />
      <SegmentedControl
        options={TAB_OPTIONS}
        value={activeTab}
        onChange={setActiveTab}
        accessibilityLabel="Lineup sections"
      />
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenContainer padded={false}>
        {/* Sticky header + tab switcher: stays pinned while either tab scrolls. */}
        <View style={styles.stickyHeader}>{header}</View>
        {/* Keyed on the active tab so switching cross-fades the pane in,
            matching the navigator's fade language. Opacity-only and quick —
            a rise would fight the sticky header above. */}
        <Reveal key={activeTab} rise={0} duration={motion.fast} style={styles.flex}>
        {activeTab === "build" ? (
          <View ref={buildScrollWrapRef} collapsable={false} style={styles.flex}>
          <Animated.ScrollView
            ref={buildScrollRef}
            style={styles.flex}
            contentContainerStyle={styles.buildContent}
            scrollEventThrottle={16}
            onScroll={(e) => {
              buildScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
          >
            <BuildTab
              activeCount={activeCount}
              rosterCount={roster.length}
              rulesConfig={rulesConfig}
              hasProSubscription={hasProSubscription}
              games={games}
              selectedGameId={selectedGameId}
              onSelectGame={setSelectedGameId}
              lineup={lineup}
              isGenerating={isGenerating}
              error={error}
              onEditSelection={onOpenRoster}
              onEditLineup={toggleInlineEditMode}
              onGenerate={() => runLineupGeneration()}
              onSaveLineup={() => setSaveModalVisible(true)}
              onSetLineupCell={applyInlinePositionSwap}
              playerGenderByName={playerGenderByName}
              lineupScrollableRef={buildScrollRef}
              lineupAnchorRef={lineupAnchorRef}
            />
          </Animated.ScrollView>
          </View>
        ) : (
          <HistoryTab
            hasProSubscription={hasProSubscription}
            games={games}
            selectedGameId={selectedGameId}
            onSelectGame={setSelectedGameId}
            lineupHistory={lineupHistory}
            historyLoading={historyLoading}
            historyError={historyError}
            renderVersion={(version) => (
              <HistoryCard
                version={version}
                busy={activeHistoryId === version.id}
                onPress={() => openLineupHistoryDetail(version.id)}
                onLongPress={() => setPendingDeleteLineup(version)}
              />
            )}
          />
        )}
        </Reveal>
      </ScreenContainer>

      {editModalVisible && (
        <EditLineupOverlay
          title={
            isHistoryEdit
              ? selectedHistoryDetail!.lineupName ||
                `Lineup v${selectedHistoryDetail!.versionNumber}`
              : "Edit lineup"
          }
          isHistoryEdit={isHistoryEdit}
          lineup={editModalLineup}
          editable={lineupInlineEditMode}
          canUndo={canUndo}
          isSaving={isSavingVersion}
          exportBusy={isExporting}
          error={error}
          playerGenderByName={playerGenderByName}
          onExport={(format) => {
            if (!hasProSubscription) {
              onRequirePro("Lineup exports");
              return;
            }
            void exportLineupVersion(selectedHistoryDetail!.id, format);
          }}
          onSavePress={handleOverlaySavePress}
          onUndo={undoLastEdit}
          onDone={finishInlineEdit}
          onClose={dismissEditModal}
          onSetPlayerPosition={applyInlinePositionSwap}
        />
      )}

      <SaveLineupSheet
        visible={saveModalVisible}
        onClose={() => setSaveModalVisible(false)}
        name={saveLineupName}
        onChangeName={setSaveLineupName}
        isSaving={isSavingVersion}
        isManualEditSave={isManualEditSave}
        error={error}
        duplicateNotice={duplicateSave !== null}
        onViewDuplicate={() => {
          const duplicateId = duplicateSave?.lineupId ?? null;
          clearDuplicateSave();
          setSaveModalVisible(false);
          setSaveLineupName("");
          if (duplicateId) {
            void openLineupHistoryDetail(duplicateId);
          } else {
            setActiveTab("history");
          }
        }}
        inputRef={saveLineupNameInputRef}
        onSave={() => {
          void saveCurrentLineupVersion();
        }}
      />

      <Sheet
        visible={pendingDeleteLineup !== null}
        onClose={() => {
          if (!isDeletingLineup) setPendingDeleteLineup(null);
        }}
        title="Delete lineup?"
      >
        <View style={styles.sheetBody}>
          <AppText variant="body" color="secondary">
            {pendingDeleteLineup
              ? `“${
                  pendingDeleteLineup.lineupName ||
                  `Lineup v${pendingDeleteLineup.versionNumber}`
                }” will be permanently removed. This can’t be undone.`
              : ""}
          </AppText>
          <View style={styles.sheetActions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPendingDeleteLineup(null)}
              disabled={isDeletingLineup}
            />
            <Button
              label="Delete"
              variant="danger"
              onPress={() => {
                void confirmDeleteLineup();
              }}
              loading={isDeletingLineup}
              accessibilityLabel="Delete lineup"
            />
          </View>
        </View>
      </Sheet>

      <Sheet
        visible={rosterRequirement !== null}
        onClose={() => setRosterRequirement(null)}
        title="Add players to your roster"
      >
        <View style={styles.sheetBody}>
          <View style={styles.rosterSheetIcon}>
            <Feather name="users" size={22} color={theme.accent.base} />
          </View>
          <AppText variant="body" color="secondary">
            {rosterRequirement?.detail} You currently have{" "}
            {rosterRequirement?.have}{" "}
            {rosterRequirement?.have === 1 ? "active player" : "active players"}
            . Add or activate more players in your roster to generate a lineup.
          </AppText>
          <View style={styles.sheetActions}>
            <Button
              label="Not now"
              variant="secondary"
              onPress={() => setRosterRequirement(null)}
            />
            <Button
              label="Go to Roster"
              onPress={() => {
                setRosterRequirement(null);
                onOpenRoster();
              }}
              accessibilityLabel="Go to roster"
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg.base,
  },
  flex: {
    flex: 1,
  },
  buildContent: {
    paddingHorizontal: space.md,
    paddingTop: space.xxs,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: space.sm + 2,
  },
  // Pinned above both tabs. Transparent so the ambient glow runs behind it;
  // the scroll viewports start below it, so nothing ever slides underneath.
  stickyHeader: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  headerBlock: {
    gap: space.sm,
  },
  sheetBody: {
    gap: space.sm,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.xs,
  },
  rosterSheetIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
  },
});

export default LineupScreen;
