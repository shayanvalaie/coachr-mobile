import { StyleSheet, View } from "react-native";
import { BackendGame, BackendLineupVersionSummary } from "../../../lib/backend/types";
import { AppPressable, AppText, Card, Skeleton } from "../../../components/ui";
import { radius, space } from "../../../theme/tokens";
import GameCard from "./GameCard";

type Props = {
  dayLabel: string;
  games: BackendGame[];
  lineupsByGameId: Map<string, BackendLineupVersionSummary[]>;
  isLoading: boolean;
  onAddGame: () => void;
  onOpenLineups: (game: BackendGame) => void;
  onEditGame: (game: BackendGame) => void;
  onDeleteGame: (gameId: string) => void;
};

// The selected day, rendered under the grid: a hero per game, or a dashed
// placeholder with the one way to add one.
const DayAgenda = ({
  dayLabel,
  games,
  lineupsByGameId,
  isLoading,
  onAddGame,
  onOpenLineups,
  onEditGame,
  onDeleteGame,
}: Props) => {
  if (isLoading) {
    return <Skeleton height={196} radius={radius.tab} />;
  }

  if (games.length === 0) {
    return (
      <Card variant="outline" radius="tab" padding="none">
        <View style={styles.emptyInner}>
          <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
            {dayLabel}
          </AppText>
          <AppText variant="title" family="heading">
            No game scheduled
          </AppText>
          <AppPressable
            onPress={onAddGame}
            pressScale={1}
            hitSlop={8}
            style={styles.addLink}
            accessibilityRole="button"
            accessibilityLabel={`Add a game on ${dayLabel}`}
          >
            <AppText variant="body" family="heading" color="accent">
              + Add game
            </AppText>
          </AppPressable>
        </View>
      </Card>
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
    gap: space.sm,
  },
  emptyInner: {
    padding: space.md + 2,
    gap: space.xs,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  addLink: {
    alignSelf: "flex-start",
    marginTop: space.xxs,
    minHeight: 28,
    justifyContent: "center",
  },
});

export default DayAgenda;
