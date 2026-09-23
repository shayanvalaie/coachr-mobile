import { ReactNode, useCallback } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import {
  AppText,
  EmptyState,
  LoadTransition,
  Reveal,
  SkeletonListRows,
} from "../../../components/ui";
import {
  BackendGame,
  BackendLineupVersionSummary,
} from "../../../lib/backend/types";
import { theme } from "../../../theme/colors";
import { motion, space, TAB_BAR_CLEARANCE } from "../../../theme/tokens";
import GameContextCard from "./GameContextCard";

type Props = {
  hasProSubscription: boolean;
  games: BackendGame[];
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
  lineupHistory: BackendLineupVersionSummary[];
  historyLoading: boolean;
  historyError: string | null;
  renderVersion: (version: BackendLineupVersionSummary) => ReactNode;
};

// Saved tab: the FlatList owns scrolling. The screen header + segmented
// control are pinned by the parent screen; the game chips ride along as the
// list header.
const HistoryTab = ({
  hasProSubscription,
  games,
  selectedGameId,
  onSelectGame,
  lineupHistory,
  historyLoading,
  historyError,
  renderVersion,
}: Props) => {
  // Opacity-only fade per row mount. On load, all rows mount in one commit and
  // fade in as a group; during scroll, FlatList's window mounts rows well
  // off-screen, so the (cheap, UI-thread) fade has finished before they're
  // visible.
  const renderItem = useCallback(
    ({ item }: { item: BackendLineupVersionSummary }) => (
      <Reveal rise={0} duration={motion.base}>
        {renderVersion(item)}
      </Reveal>
    ),
    [renderVersion],
  );

  const showChips = hasProSubscription && games.length > 0;
  const showHeader = showChips || historyError || (historyLoading && lineupHistory.length > 0);

  return (
    <FlatList
      // Keep the previous rows on screen while a reload is in flight (the
      // header spinner signals activity); emptying the data here would blank
      // the list on every game-context switch.
      data={lineupHistory}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        showHeader ? (
          <View style={styles.listHeader}>
            {showChips ? (
              <GameContextCard
                games={games}
                selectedGameId={selectedGameId}
                onSelectGame={onSelectGame}
              />
            ) : null}
            {historyLoading && lineupHistory.length > 0 ? (
              <ActivityIndicator color={theme.accent.base} size="small" />
            ) : null}
            {historyError ? (
              <AppText variant="caption" color="danger">
                {historyError}
              </AppText>
            ) : null}
          </View>
        ) : null
      }
      ListEmptyComponent={
        historyError ? null : (
          <LoadTransition
            loading={historyLoading}
            skeleton={<SkeletonListRows count={5} height={66} />}
          >
            <EmptyState
              icon="layers"
              title="No saved lineups yet"
              body="Generate a lineup and save it to see it here."
            />
          </LoadTransition>
        )
      }
      ListFooterComponent={
        lineupHistory.length > 0 ? (
          <AppText variant="caption" color="muted" style={styles.footer}>
            Long-press a lineup to delete. Export to Excel or PDF from inside.
          </AppText>
        ) : null
      }
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: space.md,
    paddingTop: space.xxs,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: space.xs,
  },
  listHeader: {
    gap: space.sm,
    marginBottom: space.xxs,
  },
  footer: {
    textAlign: "center",
    paddingTop: space.sm,
  },
});

export default HistoryTab;
