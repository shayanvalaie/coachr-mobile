import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Feather, IconName } from "../../icons";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";

type Shape = "pill" | "rounded";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
  // Position slots use the squarer shape; everything else is a pill.
  shape?: Shape;
};

const STATE_TRANSITION_MS = 200;

const Chip = ({
  label,
  selected = false,
  onPress,
  icon,
  disabled,
  shape = "pill",
}: Props) => {
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, {
      duration: STATE_TRANSITION_MS,
    });
  }, [progress, selected]);

  const surfaceStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.bg.raised, theme.accent.subtle],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.border.base, theme.accent.subtleBorder],
    ),
  }));

  return (
    <AppPressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      style={[styles.base, disabled && styles.disabled]}
    >
      <Animated.View
        style={[
          styles.surface,
          { borderRadius: shape === "pill" ? radius.pill : radius.sm },
          surfaceStyle,
        ]}
      >
        {icon ? (
          <Feather
            name={icon}
            size={13}
            color={selected ? theme.accent.base : theme.text.secondary}
          />
        ) : null}
        <AppText
          variant="caption"
          family="heading"
          color={selected ? "accent" : "secondary"}
        >
          {label}
        </AppText>
      </Animated.View>
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
  },
  surface: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    minHeight: 32,
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Chip;
