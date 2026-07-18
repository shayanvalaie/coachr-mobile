import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import {
  AppPressable,
  AppText,
  Button,
  ScreenContainer,
  ScreenHeader,
  Sheet,
} from "../../components/ui";
import { Feather } from "../../icons";
import { backendClient } from "../../lib/backend/client";
import { BackendSession } from "../../lib/backend/types";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { InningAssignment } from "../../types/lineup";
import { LineupLaunchRequest } from "../../types/lineupLaunch";
import { normalizeLineupRows } from "../../utils/lineupTransforms";
import BuildTab from "./components/BuildTab";
import EditLineupOverlay from "./components/EditLineupOverlay";
import HistoryCard from "./components/HistoryCard";
import HistoryTab from "./components/HistoryTab";
import PlayerPickerSheet from "./components/PlayerPickerSheet";
import SaveLineupSheet from "./components/SaveLineupSheet";
import { useLineupData } from "./hooks/useLineupData";
import { useLineupEditor } from "./hooks/useLineupEditor";
import { useLineupGeneration } from "./hooks/useLineupGeneration";
import { useLineupHistory } from "./hooks/useLineupHistory";
import { lockOrientation, ORIENTATION_LOCK_LANDSCAPE } from "./orientation";

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
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [gameSetupCollapsed, setGameSetupCollapsed] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const handledLaunchRequestIdsRef = useRef<Set<number>>(new Set());
  // Refs used to auto-scroll the freshly generated lineup into view: the build
  // ScrollView, a wrapper for measuring the viewport top, an anchor wrapping the
  // lineup grid deep inside GameSetup, and the live scroll offset. The scroll
  // ref is an animated ref because the sortable lineup grid also drives it for
  // edge auto-scroll while dragging rows.
  const buildScrollRef = useAnimatedRef<Animated.ScrollView>();
  const buildScrollWrapRef = useRef<View>(null);
  const lineupAnchorRef = useRef<View>(null);
  const buildScrollOffsetRef = useRef(0);
  const wasGeneratingRef = useRef(false);

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
    activeIds,
    setActiveIds,
    rulesConfig,
    ensureTeam,
    activePlayers,
    playerGenderByName,
    handleToggleActive,
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
    saveCurrentLineupVersion,
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
  });

  const {
    isGenerating,
    rosterRequirement,
    setRosterRequirement,
    setPendingAutoGenerate,
    runLineupGeneration,
  } = useLineupGeneration({
    ensureTeam,
    rulesConfig,
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

  // When a generation run finishes with a lineup, scroll the grid to the top of
  // the viewport so the user sees the result without hunting for it. Only fires
  // on the generating -> idle transition, so inline edits don't yank the scroll.
  useEffect(() => {
    const justFinished = wasGeneratingRef.current && !isGenerating;
    wasGeneratingRef.current = isGenerating;
    if (!justFinished) return;
    if (activeTab !== "build") return;
    if (!lineup || lineup.length === 0) return;

    // Wait for the post-generation LayoutAnimation to settle before measuring.
    // measureInWindow works on both RN architectures (New Arch rejects the
    // numeric node handle that measureLayout would need). We translate the
    // anchor's window position into a scroll offset via the live scroll offset
    // and the viewport's own window position.
    const timer = setTimeout(() => {
      const scroll = buildScrollRef.current;
      const anchor = lineupAnchorRef.current;
      const wrap = buildScrollWrapRef.current;
      if (!scroll || !anchor || !wrap) return;
      wrap.measureInWindow((_wx, wy) => {
        anchor.measureInWindow((_ax, ay) => {
          const target =
            buildScrollOffsetRef.current + (ay - wy) - space.md;
          scroll.scrollTo({ y: Math.max(target, 0), animated: true });
        });
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [activeTab, isGenerating, lineup]);

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
  }, [
    ensureTeam,
    launchRequest,
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

  const profileButton = (
    <AppPressable
      onPress={onOpenProfile}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={styles.iconButton}
      hitSlop={8}
    >
      <Feather name="user" size={18} color={theme.text.primary} />
    </AppPressable>
  );

  const header = (
    <View style={styles.headerBlock}>
      <ScreenHeader
        title="Line Ups"
        subtitle={activeTab === "build" ? "Generate Lineup" : "Lineup History"}
        onBack={onBack}
        right={profileButton}
      />
      <View style={styles.tabRow} accessibilityRole="tablist">
        <AppPressable
          style={[
            styles.tabButton,
            activeTab === "history" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("history")}
          accessibilityRole="tab"
          accessibilityLabel="Line Ups tab"
          accessibilityState={{ selected: activeTab === "history" }}
        >
          <AppText
            variant="caption"
            family="heading"
            color={activeTab === "history" ? "accent" : "secondary"}
          >
            Line Ups
          </AppText>
        </AppPressable>
        <AppPressable
          style={[
            styles.tabButton,
            activeTab === "build" && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab("build")}
          accessibilityRole="tab"
          accessibilityLabel="Generate tab"
          accessibilityState={{ selected: activeTab === "build" }}
        >
          <AppText
            variant="caption"
            family="heading"
            color={activeTab === "build" ? "accent" : "secondary"}
          >
            Generate
          </AppText>
        </AppPressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenContainer padded={false}>
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
            {header}
            <BuildTab
              activeCount={activeCount}
              rosterCount={roster.length}
              rulesConfig={rulesConfig}
              hasProSubscription={hasProSubscription}
              games={games}
              selectedGame={selectedGame}
              selectedGameId={selectedGameId}
              onSelectGame={setSelectedGameId}
              lineup={lineup}
              lineupInlineEditMode={lineupInlineEditMode}
              expandedInnings={expandedInnings}
              gameSetupCollapsed={gameSetupCollapsed}
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
              lineupScrollableRef={buildScrollRef}
              lineupAnchorRef={lineupAnchorRef}
            />
          </Animated.ScrollView>
          </View>
        ) : (
          <HistoryTab
            header={header}
            hasProSubscription={hasProSubscription}
            games={games}
            selectedGame={selectedGame}
            selectedGameId={selectedGameId}
            onSelectGame={setSelectedGameId}
            lineupHistory={lineupHistory}
            historyLoading={historyLoading}
            historyError={historyError}
            isGenerating={isGenerating}
            onGenerate={() => {
              setActiveTab("build");
              void runLineupGeneration();
            }}
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
          expandedInnings={expandedInnings}
          editable={lineupInlineEditMode}
          isSaving={isSavingVersion}
          exportBusy={isExporting}
          playerGenderByName={playerGenderByName}
          onExport={(format) => {
            if (!hasProSubscription) {
              onRequirePro("Lineup exports");
              return;
            }
            void exportLineupVersion(selectedHistoryDetail!.id, format);
          }}
          onSavePress={() => {
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
        inputRef={saveLineupNameInputRef}
        onSave={() => {
          void saveCurrentLineupVersion();
        }}
      />

      <PlayerPickerSheet
        visible={showPlayerPicker}
        onClose={() => setShowPlayerPicker(false)}
        roster={roster}
        activeIds={activeIds}
        onTogglePlayer={handleToggleActive}
        onSelectAll={() =>
          setActiveIds(new Set(roster.map((player) => player.id)))
        }
        onClear={() => setActiveIds(new Set())}
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
    padding: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  headerBlock: {
    gap: space.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: theme.bg.elevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    padding: space.xxs,
    gap: space.xxs,
  },
  tabButton: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xs,
  },
  tabButtonActive: {
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
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
