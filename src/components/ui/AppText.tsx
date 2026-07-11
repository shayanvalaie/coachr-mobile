import { Text, TextProps } from "react-native";
import { theme } from "../../theme/colors";
import { textStyle, TypefaceKey } from "../../theme/typography";
import { TypeVariant } from "../../theme/tokens";

type TextColor =
  | "primary"
  | "secondary"
  | "muted"
  | "accent"
  | "danger"
  | "success"
  | "onAccent";

const colorMap: Record<TextColor, string> = {
  primary: theme.text.primary,
  secondary: theme.text.secondary,
  muted: theme.text.muted,
  accent: theme.accent.base,
  danger: theme.danger.base,
  success: theme.success.base,
  onAccent: theme.text.onAccent,
};

type Props = TextProps & {
  variant?: TypeVariant;
  family?: TypefaceKey;
  color?: TextColor;
};

const AppText = ({
  variant = "body",
  family = "body",
  color = "primary",
  style,
  ...rest
}: Props) => (
  <Text
    {...rest}
    style={[textStyle(variant, family), { color: colorMap[color] }, style]}
  />
);

export default AppText;
