import { StyleSheet, View } from "react-native";
import { BackendGame, BackendLineupVersionSummary } from "../../../lib/backend/types";
import { AppText, Button, Card } from "../../../components/ui";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import { typeface } from "../../../theme/typography";

type Props = {
  game: BackendGame;
  savedLineups: BackendLineupVersionSummary[];
  onOpenLineups: (game: BackendGame) => void;
  onEdit: (game: BackendGame) => void;
  onDelete: (gameId: string) => void;
};

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const gameEyebrow = (game: BackendGame) => {
  const date = new Date(game.scheduledAt);
  if (Number.isNaN(date.getTime())) return "Game";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const gameTitle = (game: BackendGame) => {
  const opponent = game.opponentName.trim();
  if (opponent) return `vs ${opponent}`;
  return game.title.trim() || "Game";
};

const gameMeta = (game: BackendGame) => {
  const date = new Date(game.scheduledAt);
  return [
    Number.isNaN(date.getTime())
      ? null
      : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    game.homeAway === "home" ? "Home" : "Away",
    game.location.trim() || null,
    game.status === "scheduled" ? null : capitalize(game.status),
  ]
    .filter(Boolean)
    .join(" · ");
};

// One game on the selected day: a glass hero with the schedule, lineup
// status, and the day's one amber action. Long-press to delete.
const GameCard = ({ game, savedLineups, onOpenLineups, onEdit, onDelete }: Props) => {
  const hasLineup = savedLineups.length > 0;
  const title = gameTitle(game);
  const hasScore = game.ourScore != null || game.opponentScore != null;

  return (
    <Card
      variant="glass"
      radius="tab"
      padding="none"
      onLongPress={game.id ? () => onDelete(game.id!) : undefined}
      accessibilityLabel={`${title}, ${gameEyebrow(game)}`}
      accessibilityHint="Press and hold to delete this game"
    >
      <View style={styles.inner}>
        <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
          {gameEyebrow(game)}
        </AppText>
        <View style={styles.titleBlock}>
          <AppText style={styles.title}>{title}</AppText>
          <AppText variant="caption" color="secondary">
            {gameMeta(game)}
          </AppText>
          {hasScore ? (
            <AppText variant="caption" family="heading">
              Score {game.ourScore ?? "-"} – {game.opponentScore ?? "-"}
            </AppText>
          ) : null}
        </View>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: hasLineup ? theme.success.base : theme.text.muted },
            ]}
          />
          <AppText variant="caption" family="heading" color={hasLineup ? "success" : "muted"}>
            {hasLineup
              ? `${savedLineups.length} saved lineup${savedLineups.length === 1 ? "" : "s"}`
              : "No lineup yet"}
          </AppText>
        </View>
        <View style={styles.actions}>
          <Button
            label={hasLineup ? "Open lineup" : "Generate lineup"}
            icon={hasLineup ? undefined : "zap"}
            onPress={() => onOpenLineups(game)}
            style={styles.primaryAction}
            accessibilityLabel={`${hasLineup ? "Open lineups" : "Generate a lineup"} for ${title}`}
          />
          <Button
            label="Edit"
            variant="secondary"
            onPress={() => onEdit(game)}
            style={styles.secondaryAction}
            accessibilityLabel={`Edit ${title}`}
          />
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  inner: {
    padding: space.md + 2,
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  titleBlock: {
    gap: 2,
  },
  title: {
    fontFamily: typeface.display,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  actions: {
    flexDirection: "row",
    gap: space.xs,
    marginTop: space.xxs,
  },
  primaryAction: {
    flex: 2,
  },
  secondaryAction: {
    flex: 1,
  },
});

export default GameCard;
