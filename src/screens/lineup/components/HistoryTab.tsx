import { ReactNode, useCallback } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import {
  AppText,
  Button,
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
import { motion, space } from "../../../theme/tokens";
import GameContextCard from "./GameContextCard";

type Props = {
  header: ReactNode;
  hasProSubscription: boolean;
  games: BackendGame[];
  selectedGame: BackendGame | null;
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
  lineupHistory: BackendLineupVersionSummary[];
  historyLoading: boolean;
  historyError: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
  renderVersion: (version: BackendLineupVersionSummary) => ReactNode;
};

// History tab: the FlatList owns scrolling; the screen header, tab switcher,
// and game context ride along as the list header.
const HistoryTab = ({
  header,
  hasProSubscription,
  games,
  selectedGame,
  selectedGameId,
  onSelectGame,
  lineupHistory,
  historyLoading,
  historyError,
  isGenerating,
  onGenerate,
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
        <View style={styles.listHeader}>
          {header}
          <Button
            label="Generate"
            icon="zap"
            onPress={onGenerate}
            loading={isGenerating}
            disabled={isGenerating}
            accessibilityLabel="Generate a new lineup"
          />
          {hasProSubscription && (
            <GameContextCard
              games={games}
              selectedGame={selectedGame}
              selectedGameId={selectedGameId}
              onSelectGame={onSelectGame}
            />
          )}
          <View style={styles.sectionRow}>
            <AppText variant="bodyLg" family="heading">
              Lineup History
            </AppText>
            {historyLoading ? (
              <ActivityIndicator color={theme.accent.base} size="small" />
            ) : null}
          </View>
          {historyError ? (
            <AppText variant="caption" color="danger">
              {historyError}
            </AppText>
          ) : null}
          {lineupHistory.length > 0 ? (
            <AppText variant="caption" color="secondary">
              Tap to open • Long-press to delete
            </AppText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        historyError ? null : (
          <LoadTransition
            loading={historyLoading}
            skeleton={<SkeletonListRows count={5} />}
          >
            <EmptyState
              icon="layers"
              title="No saved lineups yet"
              body="No saved versions yet for this context."
            />
          </LoadTransition>
        )
      }
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: space.md,
    paddingBottom: space.lg,
    gap: space.xs,
  },
  listHeader: {
    gap: space.sm,
    marginBottom: space.xxs,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
});

export default HistoryTab;
