import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Feather } from "../../icons";
import { theme } from "../../theme/colors";
import { space } from "../../theme/tokens";
import AppPressable from "./AppPressable";
import AppText from "./AppText";

type Props = {
  // Section name or context, rendered as a small amber uppercase label.
  eyebrow?: string;
  // Content-first: the team name, a count, a month - not the screen name.
  title: string;
  subtitle?: string;
  // One or two 36-40px icon buttons.
  right?: ReactNode;
  back?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
};

// The one header pattern. Lives inline in the scroll content with no bar
// behind it, so every screen opens with the same rhythm: eyebrow, title, and
// at most a couple of quiet actions on the right.
const PageHeader = ({ eyebrow, title, subtitle, right, back, style }: Props) => (
  <View style={[styles.block, style]}>
    {back ? (
      <AppPressable
        onPress={back.onPress}
        style={styles.backLink}
        pressScale={1}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${back.label}`}
        hitSlop={8}
      >
        <Feather name="chevron-left" size={16} color={theme.text.secondary} />
        <AppText variant="caption" family="heading" color="secondary">
          {back.label}
        </AppText>
      </AppPressable>
    ) : null}
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        {eyebrow ? (
          <AppText
            variant="caption"
            family="heading"
            color="accent"
            style={styles.eyebrow}
          >
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="display" family="display" style={styles.title}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="body" color="secondary" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  </View>
);

const styles = StyleSheet.create({
  block: {
    paddingTop: space.xs,
    gap: space.xs,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    minHeight: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
  },
  titleBlock: {
    flex: 1,
    gap: space.xxs,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingBottom: 2,
  },
});

export default PageHeader;
