import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../../theme/colors";
import { motion, radius, shadow, space, SpaceKey } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import GlassSurface from "./GlassSurface";

type Variant = "raised" | "glass" | "outline";
type Radius = "lg" | "tab" | "xl";

type Props = {
  children: ReactNode;
  variant?: Variant;
  padding?: SpaceKey | "none";
  radius?: Radius;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  // Override the hairline (e.g. the amber-tinted upgrade card).
  borderColor?: string;
};

const variantStyles: Record<Exclude<Variant, "glass">, ViewStyle> = {
  // Solid content surface: lists, metrics, forms. Text stays crisp.
  raised: {
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    ...shadow.card,
  },
  // Empty slot marker (e.g. a calendar day with no game).
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.border.base,
  },
};

const Card = ({
  children,
  variant = "raised",
  padding = "md",
  radius: radiusKey = "lg",
  style,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  borderColor,
}: Props) => {
  const paddingValue = padding === "none" ? 0 : space[padding];
  const radiusValue = radius[radiusKey];

  const body =
    variant === "glass" ? (
      <GlassSurface
        radius={radiusValue}
        borderColor={borderColor}
        style={!onPress ? style : undefined}
        contentStyle={{ padding: paddingValue }}
      >
        {children}
      </GlassSurface>
    ) : (
      <View
        style={[
          variantStyles[variant],
          { borderRadius: radiusValue, padding: paddingValue },
          borderColor ? { borderColor } : null,
          !onPress ? style : undefined,
        ]}
      >
        {children}
      </View>
    );

  if (!onPress && !onLongPress) return body;

  return (
    <AppPressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 350 : undefined}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      pressScale={motion.pressScale}
    >
      {body}
    </AppPressable>
  );
};

export default Card;

// Re-exported for callers that want the raised look on a custom container.
export const raisedSurface = StyleSheet.create({
  base: {
    ...variantStyles.raised,
    borderRadius: radius.lg,
  },
}).base;
