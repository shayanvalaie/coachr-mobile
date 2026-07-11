import { forwardRef, ReactNode, useState } from "react";
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { textStyle } from "../../theme/typography";
import AppText from "./AppText";

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  left?: ReactNode;
  right?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

// Label above, error below, accent focus border. Never placeholder-as-label.
const Input = forwardRef<TextInput, Props>(
  ({ label, error, hint, left, right, containerStyle, style, onFocus, onBlur, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <AppText variant="caption" family="heading" color="secondary">
            {label}
          </AppText>
        ) : null}
        <View
          style={[
            styles.field,
            focused && styles.fieldFocused,
            !!error && styles.fieldError,
          ]}
        >
          {left ? <View style={styles.adornment}>{left}</View> : null}
          <TextInput
            ref={ref}
            {...rest}
            style={[styles.input, style]}
            placeholderTextColor={theme.text.muted}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
          />
          {right ? <View style={styles.adornment}>{right}</View> : null}
        </View>
        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : hint ? (
          <AppText variant="caption" color="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
    );
  },
);

Input.displayName = "Input";

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.bg.elevated,
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    minHeight: 44,
  },
  fieldFocused: {
    borderColor: theme.accent.subtleBorder,
  },
  fieldError: {
    borderColor: theme.danger.subtleBorder,
  },
  input: {
    flex: 1,
    ...textStyle("bodyLg"),
    color: theme.text.primary,
    paddingVertical: space.sm,
  },
  adornment: {
    marginHorizontal: space.xxs,
  },
});

export default Input;
