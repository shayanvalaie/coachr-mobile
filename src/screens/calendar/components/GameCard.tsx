import { StyleSheet, View } from "react-native";
import { BackendGame, BackendLineupVersionSummary } from "../../../lib/backend/types";
import { AppText, Button, Card } from "../../../components/ui";
import { space } from "../../../theme/tokens";

type Props = {
  game: BackendGame;
  savedLineups: BackendLineupVersionSummary[];
  onOpenLineups: (game: BackendGame) => void;
  onEdit: (game: BackendGame) => void;
  onDelete: (gameId: string) => void;
};

// One game in the selected-day agenda: schedule details, saved-lineup summary,
// and the Line Up / Edit / Delete actions.
const GameCard = ({ game, savedLineups, onOpenLineups, onEdit, onDelete }: Props) => {
  const date = new Date(game.scheduledAt);
  const title = `${game.title || "Untitled Game"} vs ${game.opponentName || "TBD"}`;

  return (
    <Card padding="sm">
      <View style={styles.inner}>
        <View style={styles.info}>
          <AppText variant="body" family="heading">
            {title}
          </AppText>
          <AppText variant="caption" color="secondary">
            {Number.isNaN(date.getTime()) ? game.scheduledAt : date.toLocaleString()}
          </AppText>
          <AppText variant="caption" color="secondary">
            {game.homeAway.toUpperCase()} - {game.location || "No location"} -{" "}
            {game.status}
          </AppText>
          {(game.ourScore != null || game.opponentScore != null) && (
            <AppText variant="caption" family="heading">
              Score: {game.ourScore ?? "-"} - {game.opponentScore ?? "-"}
            </AppText>
          )}
          {savedLineups.length > 0 ? (
            <View style={styles.lineupInfoWrap}>
              <AppText variant="caption" family="heading" color="accent">
                Saved lineups: {savedLineups.length}
              </AppText>
              <AppText variant="caption" color="secondary">
                Latest:{" "}
                {savedLineups[0].lineupName || `v${savedLineups[0].versionNumber}`}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" color="muted">
              No lineup saved for this game yet.
            </AppText>
          )}
        </View>
        <View style={styles.actions}>
          <Button
            label="Line Up"
            variant="secondary"
            size="sm"
            icon="layers"
            onPress={() => onOpenLineups(game)}
            accessibilityLabel={`Open lineups for ${title}`}
          />
          <Button
            label="Edit"
            variant="secondary"
            size="sm"
            icon="edit-2"
            onPress={() => onEdit(game)}
            accessibilityLabel={`Edit ${title}`}
          />
          <Button
            label="Delete"
            variant="danger"
            size="sm"
            icon="trash-2"
            onPress={() => game.id && onDelete(game.id)}
            accessibilityLabel={`Delete ${title}`}
          />
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  inner: {
    gap: space.xs,
  },
  info: {
    gap: 2,
  },
  lineupInfoWrap: {
    marginTop: 2,
    gap: 2,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
});

export default GameCard;
