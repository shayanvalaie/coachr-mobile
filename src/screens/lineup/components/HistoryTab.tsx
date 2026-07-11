import { ReactNode, useCallback } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import {
  AppText,
  EmptyState,
  SkeletonListRows,
} from "../../../components/ui";
import {
  BackendGame,
  BackendLineupVersionSummary,
} from "../../../lib/backend/types";
import { theme } from "../../../theme/colors";
import { space } from "../../../theme/tokens";
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
  renderVersion,
}: Props) => {
  const renderItem = useCallback(
    ({ item }: { item: BackendLineupVersionSummary }) => (
      <>{renderVersion(item)}</>
    ),
    [renderVersion],
  );

  return (
    <FlatList
      data={historyLoading ? [] : lineupHistory}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          {header}
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
          {!historyLoading && lineupHistory.length > 0 ? (
            <AppText variant="caption" color="secondary">
              Tap to open • Long-press to delete
            </AppText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        historyLoading ? (
          <SkeletonListRows count={5} />
        ) : historyError ? null : (
          <EmptyState
            icon="layers"
            title="No saved lineups yet"
            body="No saved versions yet for this context."
          />
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
