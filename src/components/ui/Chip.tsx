import { StyleSheet } from "react-native";
import { Feather, IconName } from "../../icons";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
};

const Chip = ({ label, selected = false, onPress, icon, disabled }: Props) => (
  <AppPressable
    onPress={onPress}
    disabled={disabled || !onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected, disabled: !!disabled }}
    style={[styles.base, selected && styles.selected, disabled && styles.disabled]}
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
  </AppPressable>
);

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    paddingHorizontal: space.sm,
    minHeight: 32,
    justifyContent: "center",
  },
  selected: {
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Chip;
