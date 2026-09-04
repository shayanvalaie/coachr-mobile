import { StyleSheet, View } from "react-native";
import { Feather, IconName } from "../../icons";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import {
  describeGender,
  describeTierWhen,
  RulesetSpec,
  SpecTier,
} from "../../types/rules";
import { AppText, Card, MetricTile } from "../ui";

type Props = {
  spec: RulesetSpec;
  unexpressedRules?: string[];
  // Secondary heading above the card ("What's enforced", "League rules").
  eyebrow?: string;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const describeSlotGender = (slot: string, gender: string) => {
  if (gender === "male") return `${slot} must be a man`;
  if (gender === "female") return `${slot} must be a woman`;
  return `${slot} must be ${gender}`;
};

const describeTier = (spec: RulesetSpec, tier: SpecTier): string => {
  const parts: string[] = [];
  if (tier.dropSlots && tier.dropSlots.length > 0) {
    const onField = spec.field.playersOnField - tier.dropSlots.length;
    parts.push(`play ${onField} (no ${tier.dropSlots.join(", ")})`);
  }
  (tier.onFieldMin ?? []).forEach((entry) => {
    parts.push(
      `at least ${entry.min} ${describeGender(entry.gender, entry.min)} on the field`,
    );
  });
  Object.entries(tier.slotGenders ?? {}).forEach(([slot, gender]) => {
    parts.push(describeSlotGender(slot, gender));
  });
  if (parts.length === 0) parts.push("standard lineup");
  return `With ${describeTierWhen(tier.when)}: ${parts.join(", ")}.`;
};

type RuleLine = { icon: IconName; text: string };

const buildRuleLines = (spec: RulesetSpec): RuleLine[] => {
  const label = spec.segment.label;
  const lines: RuleLine[] = [
    {
      icon: "users",
      text: `At least ${plural(spec.roster.minPlayers, "player")} to play.`,
    },
  ];
  (spec.roster.requirements ?? []).forEach((entry) => {
    lines.push({
      icon: "user-check",
      text: `At least ${entry.min} ${describeGender(entry.gender, entry.min)} on the roster.`,
    });
  });
  lines.push({
    icon: "refresh-cw",
    text:
      spec.bench.maxConsecutive === 1
        ? `Nobody sits two ${label}s in a row.`
        : `Nobody sits more than ${plural(spec.bench.maxConsecutive, label)} in a row.`,
  });
  (spec.tiers ?? []).forEach((tier) => {
    lines.push({ icon: "git-branch", text: describeTier(spec, tier) });
  });
  return lines;
};

// Human-readable rendering of a ruleset spec. Everything shown here is what the
// generator enforces; nothing is inferred from the original rules text.
const RulesSummary = ({ spec, unexpressedRules = [], eyebrow = "What's enforced" }: Props) => {
  const lines = buildRuleLines(spec);

  return (
    <Card>
      <View style={styles.inner}>
        <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
          {eyebrow}
        </AppText>

        <View style={styles.metricsRow}>
          <MetricTile
            small
            label={spec.segment.label.charAt(0).toUpperCase() + spec.segment.label.slice(1) + "s"}
            value={spec.segment.count}
          />
          <MetricTile small label="On field" value={spec.field.playersOnField} />
          <MetricTile small label="Min players" value={spec.roster.minPlayers} />
        </View>

        <View style={styles.section}>
          <AppText variant="caption" family="heading" color="secondary">
            Positions
          </AppText>
          <View style={styles.slotWrap}>
            {spec.field.slots.map((slot) => (
              <View key={slot} style={styles.slotPill}>
                <AppText variant="caption" family="heading">
                  {slot}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="caption" family="heading" color="secondary">
            Rules
          </AppText>
          <View style={styles.lines}>
            {lines.map((line, index) => (
              <View key={`${line.icon}-${index}`} style={styles.line}>
                <View style={styles.lineIcon}>
                  <Feather name={line.icon} size={13} color={theme.text.secondary} />
                </View>
                <AppText variant="body" style={styles.lineText}>
                  {line.text}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        {unexpressedRules.length > 0 ? (
          <View style={[styles.section, styles.customSection]}>
            <AppText variant="caption" family="heading" color="accent">
              Handled by a custom engine
            </AppText>
            {unexpressedRules.map((rule) => (
              <View key={rule} style={styles.line}>
                <View style={styles.lineIcon}>
                  <Feather name="cpu" size={13} color={theme.accent.base} />
                </View>
                <AppText variant="body" color="secondary" style={styles.lineText}>
                  {rule}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  inner: {
    gap: space.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metricsRow: {
    flexDirection: "row",
    gap: space.xs,
  },
  section: {
    gap: space.xs,
  },
  slotWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  slotPill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.elevated,
    paddingHorizontal: space.sm,
    minHeight: 30,
    justifyContent: "center",
  },
  lines: {
    gap: space.xs,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
  },
  lineIcon: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: theme.bg.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -1,
  },
  lineText: {
    flex: 1,
  },
  customSection: {
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
    paddingTop: space.sm,
  },
});

export default RulesSummary;
