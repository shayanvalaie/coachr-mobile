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

type Variant = "primary" | "secondary" | "ghost" | "danger";
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

const containerByVariant: Record<Variant, ViewStyle> = {
  primary: {
    backgroundColor: theme.accent.base,
  },
  secondary: {
    backgroundColor: theme.bg.elevated,
    borderWidth: 1,
    borderColor: theme.border.base,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: theme.danger.subtle,
    borderWidth: 1,
    borderColor: theme.danger.subtleBorder,
  },
};

const heightBySize: Record<Size, number> = { sm: 36, md: 44, lg: 52 };
const iconSizeBySize: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

const textColorByVariant = {
  primary: "onAccent",
  secondary: "primary",
  ghost: "secondary",
  danger: "danger",
} as const;

const iconColorByVariant: Record<Variant, string> = {
  primary: theme.text.onAccent,
  secondary: theme.text.primary,
  ghost: theme.text.secondary,
  danger: theme.danger.base,
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
        { minHeight: heightBySize[size] },
        size === "sm" && styles.compactPadding,
        fullWidth && styles.fullWidth,
        isBlocked && styles.blocked,
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
              color={iconColorByVariant[variant]}
            />
          ) : null}
          <AppText
            variant={size === "sm" ? "caption" : "bodyLg"}
            family="heading"
            color={textColorByVariant[variant]}
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
    borderRadius: radius.md,
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
  blocked: {
    opacity: 0.55,
  },
});

export default Button;
