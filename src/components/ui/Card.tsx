import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../../theme/colors";
import { radius, shadow, space, SpaceKey } from "../../theme/tokens";
import AppPressable from "./AppPressable";

type Variant = "raised" | "elevated" | "outline";

type Props = {
  children: ReactNode;
  variant?: Variant;
  padding?: SpaceKey;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
};

const variantStyles: Record<Variant, ViewStyle> = {
  raised: {
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.base,
  },
  elevated: {
    backgroundColor: theme.bg.elevated,
    borderWidth: 1,
    borderColor: theme.border.base,
    ...shadow.card,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
};

const Card = ({
  children,
  variant = "raised",
  padding = "md",
  style,
  onPress,
  accessibilityLabel,
}: Props) => {
  const cardStyle = [
    styles.base,
    variantStyles[variant],
    { padding: space[padding] },
    style,
  ];

  if (onPress) {
    return (
      <AppPressable
        onPress={onPress}
        style={cardStyle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        pressScale={0.98}
      >
        {children}
      </AppPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
  },
});

export default Card;
