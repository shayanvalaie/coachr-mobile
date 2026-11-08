import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import { theme, withAlpha } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { RulesetStatus } from "../../types/rules";
import { AppText } from "../ui";

type StepState = "done" | "current" | "pending" | "failed";
type Step = { label: string; state: StepState };

type Props = {
  // Index of the step in flight while a save request runs; null once settled.
  savingStep: number | null;
  status: RulesetStatus | null;
};

const READ = "Read your rules";
const CHECK = "Checked against the lineup engine";

const savingSteps = (current: number): Step[] =>
  [READ, CHECK, "Ready to generate"].map((label, index) => ({
    label,
    state: index < current ? "done" : index === current ? "current" : "pending",
  }));

const settledSteps: Record<Exclude<RulesetStatus, "active">, { steps: Step[]; body: string }> = {
  baking: {
    steps: [
      { label: READ, state: "done" },
      { label: CHECK, state: "done" },
      { label: "Building a custom lineup engine", state: "current" },
      { label: "Ready to generate", state: "pending" },
    ],
    body: "Usually a couple of minutes. We'll email you when it's ready.",
  },
  review: {
    steps: [
      { label: READ, state: "done" },
      { label: CHECK, state: "done" },
      { label: "Waiting for review", state: "current" },
      { label: "Ready to generate", state: "pending" },
    ],
    body: "A person checks these rules before lineups can be generated. We'll email you when they're approved.",
  },
  rejected: {
    steps: [
      { label: READ, state: "done" },
      { label: CHECK, state: "done" },
      { label: "Not supported", state: "failed" },
    ],
    body: "We couldn't build a reliable generator for these rules. Edit them or request a change.",
  },
};

const StepIcon = ({ state }: { state: StepState }) => {
  if (state === "current") return <ActivityIndicator size="small" color={theme.accent.base} />;
  if (state === "done") return <Feather name="check-circle" size={18} color={theme.success.base} />;
  if (state === "failed") return <Feather name="x-circle" size={18} color={theme.danger.base} />;
  return <Feather name="circle" size={18} color={theme.text.muted} />;
};

const StepList = ({ steps }: { steps: Step[] }) => (
  <View style={styles.steps}>
    {steps.map((step) => (
      <View key={step.label} style={styles.step} accessibilityLabel={`${step.label}: ${step.state}`}>
        <View style={styles.icon}>
          <StepIcon state={step.state} />
        </View>
        <AppText variant="body" color={step.state === "pending" ? "muted" : "primary"}>
          {step.label}
        </AppText>
      </View>
    ))}
  </View>
);

// Where the team's rules are in the pipeline: a step list while saving or
// while work continues server-side, a single status line once they're live.
const RulesProgressCard = ({ savingStep, status }: Props) => {
  if (savingStep !== null) {
    return (
      <View style={[styles.card, tinted(theme.accent.base)]} accessibilityLiveRegion="polite">
        <StepList steps={savingSteps(savingStep)} />
      </View>
    );
  }
  if (status === null) return null;
  if (status === "active") {
    return (
      <View style={[styles.card, styles.compact, tinted(theme.success.base)]} accessibilityRole="summary">
        <Feather name="check-circle" size={18} color={theme.success.base} />
        <AppText variant="body" family="heading">Ready to generate</AppText>
      </View>
    );
  }
  const { steps, body } = settledSteps[status];
  const color = status === "rejected" ? theme.danger.base : theme.accent.base;
  return (
    <View style={[styles.card, tinted(color)]} accessibilityRole="summary">
      <StepList steps={steps} />
      <AppText variant="caption" color="secondary">{body}</AppText>
    </View>
  );
};

const tinted = (color: string) => ({
  backgroundColor: withAlpha(color, 0.1),
  borderColor: withAlpha(color, 0.35),
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  compact: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
  },
  steps: {
    gap: space.xs,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  icon: {
    width: 20,
    alignItems: "center",
  },
});

export default RulesProgressCard;
