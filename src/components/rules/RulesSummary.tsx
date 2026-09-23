import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { describeGender, RulesetPayload } from "../../types/rules";
import { AppText, Card, MetricTile, SectionLabel } from "../ui";

type Props = {
  ruleset: RulesetPayload;
};

const SLOT_COLUMNS_MAX = 5;

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

// Positions are laid out on a fixed column count so every row is full width.
// Rows are balanced first (11 slots read 4/4/3, not 5/5/1), then short rows are
// padded with spacers so a cell is the same width on every row.
const layOutSlots = (slots: string[]) => {
  const rowCount = Math.ceil(slots.length / SLOT_COLUMNS_MAX);
  const columns = Math.ceil(slots.length / rowCount);
  const rows: string[][] = [];
  for (let start = 0; start < slots.length; start += columns) {
    rows.push(slots.slice(start, start + columns));
  }
  return { rows, columns };
};

// The numbers and positions come from the spec the generator enforces; the rule
// list is the AI's plain-English rendering of the same rules text. Until that
// list exists (a ruleset predating it, or a summary that failed to generate) the
// raw rules text stands in.
const RulesSummary = ({ ruleset }: Props) => {
  const { spec, summaryRules, rulesText } = ruleset;
  const segmentLabel = spec.segment.label;
  const requirement = (spec.roster.requirements ?? [])[0];
  const { rows, columns } = layOutSlots(spec.field.slots);

  let ruleBody: ReactNode = null;
  if (summaryRules.length > 0) {
    ruleBody = summaryRules.map((rule, index) => (
      <View key={rule} style={[styles.rule, index > 0 && styles.divided]}>
        <AppText variant="caption" family="heading" color="accent" style={styles.ruleNumber}>
          {index + 1}
        </AppText>
        <AppText variant="body" style={styles.ruleText}>
          {rule}
        </AppText>
      </View>
    ));
  } else if (rulesText.trim()) {
    ruleBody = <AppText variant="body">{rulesText.trim()}</AppText>;
  }

  return (
    <View style={styles.stack}>
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <MetricTile
            label={`${capitalize(segmentLabel)}${spec.segment.count === 1 ? "" : "s"}`}
            value={spec.segment.count}
          />
          <MetricTile label="On the field" value={spec.field.playersOnField} />
        </View>
        <View style={styles.gridRow}>
          {requirement ? (
            <MetricTile
              label={`${capitalize(describeGender(requirement.gender, requirement.min))} on roster`}
              value={`${requirement.min}+`}
            />
          ) : (
            <MetricTile label="Players to play" value={spec.roster.minPlayers} />
          )}
          <MetricTile
            label={`Max ${segmentLabel}s benched in a row`}
            value={spec.bench.maxConsecutive}
          />
        </View>
      </View>
      {requirement ? (
        <AppText variant="caption" color="muted">
          At least {plural(spec.roster.minPlayers, "player")} to play.
        </AppText>
      ) : null}
      {spec.bench.maxPerGame !== undefined ? (
        <AppText variant="caption" color="muted">
          Nobody sits more than {plural(spec.bench.maxPerGame, "time")} a game.
        </AppText>
      ) : null}

      <View style={styles.section}>
        <SectionLabel>Positions</SectionLabel>
        <View style={styles.slotGrid}>
          {rows.map((row) => (
            <View key={row.join("-")} style={styles.slotRow}>
              {row.map((slot) => (
                <View key={slot} style={styles.slot}>
                  <AppText variant="caption" family="heading" color="secondary">
                    {slot}
                  </AppText>
                </View>
              ))}
              {Array.from({ length: columns - row.length }, (_, index) => (
                <View key={`spacer-${index}`} style={styles.slotSpacer} />
              ))}
            </View>
          ))}
        </View>
      </View>

      {ruleBody ? (
        <View style={styles.section}>
          <SectionLabel>Rules</SectionLabel>
          <Card>{ruleBody}</Card>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  stack: {
    gap: space.md,
  },
  grid: {
    gap: space.sm - 2,
  },
  gridRow: {
    flexDirection: "row",
    gap: space.sm - 2,
  },
  section: {
    gap: space.xs,
  },
  slotGrid: {
    gap: space.xxs + 2,
  },
  slotRow: {
    flexDirection: "row",
    gap: space.xxs + 2,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    backgroundColor: theme.bg.raised,
  },
  slotSpacer: {
    flex: 1,
  },
  rule: {
    flexDirection: "row",
    gap: space.sm,
  },
  divided: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border.subtle,
  },
  ruleNumber: {
    width: 20,
    paddingTop: 3,
  },
  ruleText: {
    flex: 1,
  },
});

export default RulesSummary;
