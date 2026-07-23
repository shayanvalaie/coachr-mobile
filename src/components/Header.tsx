import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "../icons";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import { AppPressable, AppText } from "./ui";

type Props = {
  onMenuPress?: () => void;
  onInfoPress?: () => void;
  showMenu?: boolean;
};

const Header = ({ onMenuPress, onInfoPress, showMenu = true }: Props) => (
  <View style={styles.container}>
    <View style={styles.sideGroup}>
      {showMenu ? (
        <AppPressable
          style={styles.iconButton}
          onPress={onMenuPress}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={8}
        >
          <Feather name="menu" size={20} color={theme.text.primary} />
        </AppPressable>
      ) : null}
    </View>

    <View style={styles.titleWrap}>
      <AppText variant="caption" color="secondary" style={styles.eyebrow}>
        Lineup Studio
      </AppText>
      <AppText variant="display" family="display" style={styles.title}>
        COACHR
      </AppText>
    </View>

    <View style={[styles.sideGroup, styles.rightGroup]}>
      {onInfoPress ? (
        <AppPressable
          style={styles.iconButton}
          onPress={onInfoPress}
          accessibilityRole="button"
          accessibilityLabel="Replay app tour"
          hitSlop={8}
        >
          <Feather name="info" size={20} color={theme.text.primary} />
        </AppPressable>
      ) : null}
    </View>
  </View>
);

export default memo(Header);

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.bg.elevated,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: theme.border.base,
  },
  titleWrap: {
    alignItems: "center",
    gap: 1,
  },
  // Both side slots share the leftover width equally so the title stays
  // truly centered even when one side holds more buttons than the other.
  sideGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  rightGroup: {
    justifyContent: "flex-end",
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 2.4,
  },
  title: {
    letterSpacing: 2,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: theme.bg.raised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.border.base,
  },
});
