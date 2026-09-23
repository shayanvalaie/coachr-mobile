import { useEffect } from "react";
import { DimensionValue, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { theme, withAlpha } from "../../theme/colors";
import { radius as radiusScale, space } from "../../theme/tokens";

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  // Offsets the pulse so a stack of rows shimmers in sequence.
  delay?: number;
  style?: ViewStyle;
};

// One pulse = 1.2s (600ms each way).
const PULSE_HALF_MS = 600;

// Subtle opacity pulse placeholder. Shape skeletons to match the layout they
// stand in for; never show a bare spinner for structured content.
export const Skeleton = ({
  width = "100%",
  height = 16,
  radius = radiusScale.sm,
  delay = 0,
  style,
}: Props) => {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [delay, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: radius },
        animatedStyle,
        style,
      ]}
    />
  );
};

// Preset: a row of metric tiles. Match `height` to the tiles the row stands
// in for so the swap to real content never shifts layout.
export const SkeletonMetricRow = ({
  count = 3,
  height = 74,
}: {
  count?: number;
  height?: number;
}) => (
  <View style={styles.row}>
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} height={height} radius={radiusScale.lg} style={styles.flex} />
    ))}
  </View>
);

// Preset: stacked list rows (lineup history, games, roster).
export const SkeletonListRows = ({
  count = 4,
  height = 64,
}: {
  count?: number;
  height?: number;
}) => (
  <View style={styles.column}>
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} height={height} radius={radiusScale.lg} delay={i * 60} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  base: {
    backgroundColor: withAlpha(theme.text.primary, 0.08),
  },
  row: {
    flexDirection: "row",
    gap: space.sm - 2,
  },
  column: {
    gap: space.xs,
  },
  flex: {
    flex: 1,
  },
});

export default Skeleton;
