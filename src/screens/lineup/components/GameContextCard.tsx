import { ScrollView, StyleSheet, View } from "react-native";
import { Chip } from "../../../components/ui";
import { BackendGame } from "../../../lib/backend/types";
import { space } from "../../../theme/tokens";
import { formatGameLabel } from "../../../utils/lineupTransforms";

type Props = {
  games: BackendGame[];
  selectedGameId: string | null;
  onSelectGame: (gameId: string | null) => void;
};

// Pro-only chip row that scopes lineup history and saves to a game (or no
// game at all). Shown on both the Generate and Saved tabs.
const GameContextCard = ({ games, selectedGameId, onSelectGame }: Props) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={styles.scroll}
    contentContainerStyle={styles.chipRow}
  >
    <Chip
      label="No game"
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
  </ScrollView>
);

const styles = StyleSheet.create({
  scroll: {
    marginHorizontal: -space.md,
  },
  chipRow: {
    flexDirection: "row",
    gap: space.xs,
    paddingHorizontal: space.md,
  },
});

export default GameContextCard;
