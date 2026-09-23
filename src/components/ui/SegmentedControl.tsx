import { useState } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";
import GlassSurface from "./GlassSurface";

type Option<T extends string> = { key: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (key: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const PADDING = 4;
const STATE_TRANSITION_MS = 200;

// Glass pill with an amber indicator that slides between equal segments.
const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: Props<T>) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(
    options.findIndex((option) => option.key === value),
    0,
  );
  const segmentWidth = trackWidth > 0 ? (trackWidth - PADDING * 2) / options.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [
      {
        translateX: withTiming(selectedIndex * segmentWidth, {
          duration: STATE_TRANSITION_MS,
        }),
      },
    ],
  }));

  return (
    <GlassSurface radius={radius.md} style={style} contentStyle={styles.track}>
      <View
        style={styles.row}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        {segmentWidth > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
        ) : null}
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <AppPressable
              key={option.key}
              onPress={() => onChange(option.key)}
              style={styles.segment}
              pressScale={1}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
            >
              <AppText
                variant="caption"
                family="heading"
                color={selected ? "accent" : "secondary"}
              >
                {option.label}
              </AppText>
            </AppPressable>
          );
        })}
      </View>
    </GlassSurface>
  );
};

const styles = StyleSheet.create({
  track: {
    padding: PADDING,
  },
  row: {
    flexDirection: "row",
  },
  indicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.sm,
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
  },
  segment: {
    flex: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xs,
  },
});

export default SegmentedControl;
