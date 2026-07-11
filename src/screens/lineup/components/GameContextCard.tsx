import { ScrollView, StyleSheet, View } from "react-native";
import { AppText, Card, Chip } from "../../../components/ui";
import { BackendGame } from "../../../lib/backend/types";
import { space } from "../../../theme/tokens";
import { formatGameLabel } from "../../../utils/lineupTransforms";

type Props = {
  games: BackendGame[];
  selectedGame: BackendGame | null;
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
};

// Pro-only chip row that scopes lineup history and saves to a game (or the
// General bucket). Shown on both the Build and History tabs.
const GameContextCard = ({
  games,
  selectedGame,
  selectedGameId,
  onSelectGame,
}: Props) => (
  <Card>
    <View style={styles.inner}>
      <AppText variant="bodyLg" family="heading">
        Game Context
      </AppText>
      <AppText variant="caption" color="secondary">
        {selectedGame
          ? `Saving versions under ${formatGameLabel(selectedGame)}`
          : "Saving versions under General lineup history"}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <Chip
            label="General"
            selected={selectedGameId === null}
            onPress={() => onSelectGame(null)}
          />
          {games.map((game) => (
            <Chip
              key={game.id ?? game.scheduledAt}
              label={formatGameLabel(game)}
              selected={selectedGameId === game.id}
              onPress={() => onSelectGame(game.id ?? null)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  </Card>
);

const styles = StyleSheet.create({
  inner: {
    gap: space.xs,
  },
  chipRow: {
    flexDirection: "row",
    gap: space.xs,
    paddingRight: space.xs,
  },
});

export default GameContextCard;
