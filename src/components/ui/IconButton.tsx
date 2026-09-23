import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Feather, IconName } from "../../icons";
import { theme } from "../../theme/colors";
import { motion, radius } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import GlassSurface from "./GlassSurface";

type Variant = "glass" | "accent";

type Props = {
  icon: IconName;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: Variant;
  size?: 36 | 40;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Square icon action for headers. Glass is the quiet default; accent is the
// screen's single amber action when it happens to be an icon (Add player).
const IconButton = ({
  icon,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  variant = "glass",
  size = 40,
  disabled = false,
  style,
}: Props) => {
  const iconSize = size === 40 ? 18 : 16;
  const box = { width: size, height: size };

  return (
    <AppPressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 350 : undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      pressScale={motion.pressScale}
      haptic={variant === "accent"}
      hitSlop={4}
      style={[disabled && styles.disabled, style]}
    >
      {variant === "glass" ? (
        <GlassSurface radius={radius.md} style={box} contentStyle={[box, styles.center]}>
          <Feather name={icon} size={iconSize} color={theme.text.primary} />
        </GlassSurface>
      ) : (
        <View style={[box, styles.center, styles.accent]}>
          <Feather name={icon} size={iconSize} color={theme.text.onAccent} />
        </View>
      )}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  accent: {
    borderRadius: radius.md,
    backgroundColor: theme.accent.base,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default IconButton;
