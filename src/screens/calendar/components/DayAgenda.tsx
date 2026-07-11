import { StyleSheet, View } from "react-native";
import { BackendGame, BackendLineupVersionSummary } from "../../../lib/backend/types";
import { EmptyState, SkeletonListRows } from "../../../components/ui";
import { space } from "../../../theme/tokens";
import GameCard from "./GameCard";

type Props = {
  games: BackendGame[];
  lineupsByGameId: Map<string, BackendLineupVersionSummary[]>;
  isLoading: boolean;
  onAddGame: () => void;
  onOpenLineups: (game: BackendGame) => void;
  onEditGame: (game: BackendGame) => void;
  onDeleteGame: (gameId: string) => void;
};

// The selected day's games. Lives inside the screen's single scroll container,
// so it renders cards directly rather than owning its own list scroller.
const DayAgenda = ({
  games,
  lineupsByGameId,
  isLoading,
  onAddGame,
  onOpenLineups,
  onEditGame,
  onDeleteGame,
}: Props) => {
  if (isLoading) {
    return <SkeletonListRows count={3} />;
  }

  if (games.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="No games on this date yet"
        body="Add a game to start planning lineups for it."
        action={{ label: "Add game", onPress: onAddGame }}
      />
    );
  }

  return (
    <View style={styles.list}>
      {games.map((game) => (
        <GameCard
          key={game.id ?? `${game.title}-${game.scheduledAt}`}
          game={game}
          savedLineups={game.id ? lineupsByGameId.get(game.id) ?? [] : []}
          onOpenLineups={onOpenLineups}
          onEdit={onEditGame}
          onDelete={onDeleteGame}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  list: {
    gap: space.xs,
  },
});

export default DayAgenda;
