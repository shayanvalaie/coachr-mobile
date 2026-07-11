import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Feather, IconName } from "../icons";
import { theme } from "../theme/colors";
import { radius, space } from "../theme/tokens";
import AppPressable from "./ui/AppPressable";
import AppText from "./ui/AppText";

export type MainTabKey = "home" | "roster" | "lineup" | "calendar" | "profile";

type Props = {
  activeTab: MainTabKey;
  onSelectTab: (tab: MainTabKey) => void;
};

const tabs: Array<{ key: MainTabKey; label: string; icon: IconName }> = [
  { key: "home", label: "Home", icon: "home" },
  { key: "roster", label: "Roster", icon: "users" },
  { key: "lineup", label: "Lineup", icon: "target" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "profile", label: "Profile", icon: "user" },
];

const BottomTabBar = ({ activeTab, onSelectTab }: Props) => {
  return (
    <View style={styles.wrap}>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <AppPressable
              key={tab.key}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => onSelectTab(tab.key)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              pressScale={0.96}
            >
              <Feather
                name={tab.icon}
                size={18}
                color={active ? theme.accent.base : theme.text.secondary}
              />
              <AppText
                variant="caption"
                family="heading"
                color={active ? "accent" : "secondary"}
                style={styles.tabLabel}
              >
                {tab.label}
              </AppText>
            </AppPressable>
          );
        })}
      </View>
    </View>
  );
};

export default memo(BottomTabBar);

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.bg.base,
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.bg.raised,
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.lg,
    paddingHorizontal: space.xxs,
    paddingVertical: space.xxs,
    gap: 2,
  },
  tabButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabButtonActive: {
    backgroundColor: theme.accent.subtle,
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
  },
  tabLabel: {
    fontSize: 10,
    lineHeight: 13,
  },
});
