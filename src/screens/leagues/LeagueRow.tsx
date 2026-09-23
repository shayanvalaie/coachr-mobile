import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppPressable, AppText } from "../../components/ui";
import { Feather } from "../../icons";
import { theme } from "../../theme/colors";
import { motion, radius, space } from "../../theme/tokens";
import { LeagueMatchReason, LeagueSummary, RulesetStatus } from "../../types/rules";

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const statusLabel: Record<RulesetStatus, string | null> = {
  active: null,
  baking: "Setting up",
  review: "In review",
  rejected: "Unavailable",
};

export const describeLeague = (league: LeagueSummary) =>
  [
    capitalize(league.sport),
    league.region,
    `${league.teamCount} ${league.teamCount === 1 ? "team" : "teams"}`,
  ]
    .filter(Boolean)
    .join(" · ");

const matchReasonLabel: Record<LeagueMatchReason, string> = {
  zip: "Same zip",
  size: "Same size",
  name: "Similar name",
};

// Why the server offered this league, as short tags for the row.
export const describeMatchReasons = (reasons: LeagueMatchReason[]): string[] =>
  reasons.map((reason) => matchReasonLabel[reason]);

type Props = {
  league: LeagueSummary;
  onPress: () => void;
  // "chevron" opens the league; a labelled action (e.g. "Join") acts inline.
  action?: { label: string; busy?: boolean };
  // Third caption line in accent, e.g. why this league was suggested.
  tags?: string[];
};

// One league inside a ListGroup: name, meta line, optional tags and status pill.
const LeagueRow = ({ league, onPress, action, tags }: Props) => {
  const badge = statusLabel[league.status];
  const tagLine = tags && tags.length > 0 ? tags.join(" · ") : null;
  return (
    <AppPressable
      onPress={onPress}
      disabled={action?.busy}
      pressScale={motion.pressScale}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${league.name}. ${describeLeague(league)}.${tagLine ? ` ${tagLine}.` : ""}${action ? ` ${action.label}.` : ""}`}
      accessibilityState={{ busy: !!action?.busy, disabled: !!action?.busy }}
    >
      <View style={styles.text}>
        <AppText variant="bodyLg" family="heading" numberOfLines={1}>
          {league.name}
        </AppText>
        <AppText variant="caption" color="secondary" numberOfLines={1}>
          {describeLeague(league)}
        </AppText>
        {tagLine ? (
          <AppText
            variant="caption"
            family="heading"
            color="accent"
            numberOfLines={1}
            style={styles.tags}
          >
            {tagLine}
          </AppText>
        ) : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="caption" family="heading" color="accent">
            {badge}
          </AppText>
        </View>
      ) : null}
      {action ? (
        action.busy ? (
          <ActivityIndicator size="small" color={theme.accent.base} />
        ) : (
          <AppText variant="caption" family="heading" color="accent">
            {action.label}
          </AppText>
        )
      ) : (
        <Feather name="chevron-right" size={18} color={theme.text.muted} />
      )}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    minHeight: 60,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  tags: {
    letterSpacing: 0.4,
  },
  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
    paddingHorizontal: space.xs,
    minHeight: 24,
    justifyContent: "center",
  },
});

export default LeagueRow;
