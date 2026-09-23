import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Feather, IconName } from "../../icons";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// One amber action per screen; everything else is a quiet raised outline.
const containerByVariant: Record<Variant, ViewStyle> = {
  primary: {
    backgroundColor: theme.accent.base,
  },
  secondary: {
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.danger.subtleBorder,
  },
  success: {
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.success.subtleBorder,
  },
};

const heightBySize: Record<Size, number> = { sm: 36, md: 44, lg: 52 };
const iconSizeBySize: Record<Size, number> = { sm: 14, md: 16, lg: 17 };
const radiusBySize: Record<Size, number> = {
  sm: radius.md,
  md: radius.lg,
  lg: radius.lg,
};

const textColorByVariant = {
  primary: "onAccent",
  secondary: "primary",
  ghost: "secondary",
  danger: "danger",
  success: "success",
} as const;

const iconColorByVariant: Record<Variant, string> = {
  primary: theme.text.onAccent,
  secondary: theme.text.primary,
  ghost: theme.text.secondary,
  danger: theme.danger.base,
  success: theme.success.base,
};

const Button = ({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic,
  accessibilityLabel,
  style,
}: Props) => {
  const isBlocked = disabled || loading;
  // A disabled primary drops to a quiet raised surface instead of dimming, so
  // "not yet" reads as a state rather than a broken button.
  const isMutedPrimary = variant === "primary" && disabled && !loading;

  return (
    <AppPressable
      onPress={onPress}
      disabled={isBlocked}
      haptic={haptic ?? variant === "primary"}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      style={[
        styles.base,
        containerByVariant[variant],
        { minHeight: heightBySize[size], borderRadius: radiusBySize[size] },
        size === "sm" && styles.compactPadding,
        fullWidth && styles.fullWidth,
        isMutedPrimary && styles.mutedPrimary,
        isBlocked && !isMutedPrimary && styles.blocked,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColorByVariant[variant]} />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Feather
              name={icon}
              size={iconSizeBySize[size]}
              color={
                isMutedPrimary ? theme.text.secondary : iconColorByVariant[variant]
              }
            />
          ) : null}
          <AppText
            variant={size === "sm" ? "caption" : "bodyLg"}
            family={variant === "primary" ? "display" : "heading"}
            color={isMutedPrimary ? "secondary" : textColorByVariant[variant]}
          >
            {label}
          </AppText>
        </View>
      )}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  compactPadding: {
    paddingHorizontal: space.sm,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  mutedPrimary: {
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  blocked: {
    opacity: 0.55,
  },
});

export default Button;
