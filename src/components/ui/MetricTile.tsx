import { StyleSheet } from "react-native";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";
import Card from "./Card";

type Props = {
  label: string;
  value: string | number;
  small?: boolean;
  onPress?: () => void;
};

const MetricTile = ({ label, value, small = false, onPress }: Props) => {
  const inner = (
    <>
      <AppText
        variant="caption"
        family="heading"
        color="secondary"
        style={styles.label}
      >
        {label}
      </AppText>
      <AppText variant={small ? "title" : "display"} family="display">
        {String(value)}
      </AppText>
    </>
  );

  if (onPress) {
    return (
      <AppPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={styles.tile}
        pressScale={0.98}
      >
        {inner}
      </AppPressable>
    );
  }

  return (
    <Card variant="raised" padding="sm" style={styles.card}>
      {inner}
    </Card>
  );
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: space.xxs,
  },
  card: {
    flex: 1,
    gap: space.xxs,
  },
  label: {
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});

export default MetricTile;
