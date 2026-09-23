import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../../theme/colors";
import { motion, radius, shadow, space } from "../../theme/tokens";
import { typeface } from "../../theme/typography";
import AppPressable from "./AppPressable";
import AppText from "./AppText";

type Props = {
  label: string;
  value: string | number;
  onPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

// Big number, quiet label. Tappable tiles are shortcuts to the screen that
// owns the number (roster count -> Roster, innings -> Rules).
const MetricTile = ({ label, value, onPress, accessibilityHint, style }: Props) => {
  const inner = (
    <>
      <AppText style={styles.value}>{String(value)}</AppText>
      <AppText color="secondary" style={styles.label}>
        {label}
      </AppText>
    </>
  );

  if (onPress) {
    return (
      <AppPressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={accessibilityHint}
        style={[styles.tile, style]}
        pressScale={motion.pressScale}
      >
        {inner}
      </AppPressable>
    );
  }

  return <View style={[styles.tile, style]}>{inner}</View>;
};

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.lg,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.sm + 2,
    gap: 2,
    ...shadow.card,
  },
  value: {
    fontFamily: typeface.display,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});

export default MetricTile;
