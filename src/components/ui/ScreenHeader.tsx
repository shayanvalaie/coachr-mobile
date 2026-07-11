import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "../../icons";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
};

// Standard header for pushed screens: back chevron, title block, optional
// right-side actions. Replaces the per-screen hand-rolled header rows.
const ScreenHeader = ({ title, subtitle, onBack, right }: Props) => (
  <View style={styles.row}>
    {onBack ? (
      <AppPressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.iconButton}
        hitSlop={8}
      >
        <Feather name="chevron-left" size={20} color={theme.text.primary} />
      </AppPressable>
    ) : null}
    <View style={styles.titleBlock}>
      <AppText variant="title" family="display">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" color="secondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
    {right ? <View style={styles.right}>{right}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
});

export default ScreenHeader;
