import { useEffect } from "react";
import { DimensionValue, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { theme } from "../../theme/colors";
import { radius as radiusScale, space } from "../../theme/tokens";

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

// Subtle opacity pulse placeholder. Shape skeletons to match the layout they
// stand in for; never show a bare spinner for structured content.
export const Skeleton = ({
  width = "100%",
  height = 16,
  radius = radiusScale.sm,
  style,
}: Props) => {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

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

// Preset: a row of metric tiles (Home, Roster, Rules heroes).
export const SkeletonMetricRow = ({ count = 3 }: { count?: number }) => (
  <View style={styles.row}>
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} height={72} radius={radiusScale.lg} style={styles.flex} />
    ))}
  </View>
);

// Preset: stacked list rows (lineup history, games, roster).
export const SkeletonListRows = ({ count = 4 }: { count?: number }) => (
  <View style={styles.column}>
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} height={64} radius={radiusScale.lg} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.bg.elevated,
  },
  row: {
    flexDirection: "row",
    gap: space.sm,
  },
  column: {
    gap: space.sm,
  },
  flex: {
    flex: 1,
  },
});

export default Skeleton;
