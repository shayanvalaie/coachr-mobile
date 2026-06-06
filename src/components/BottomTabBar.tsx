import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";

export type MainTabKey = "home" | "roster" | "lineup" | "calendar" | "profile";

type Props = {
  activeTab: MainTabKey;
  onSelectTab: (tab: MainTabKey) => void;
};

const tabs: Array<{ key: MainTabKey; label: string; icon: keyof typeof Feather.glyphMap }> = [
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
            <Pressable
              key={tab.key}
              style={({ pressed }) => [
                styles.tabButton,
                active && styles.tabButtonActive,
                pressed && { opacity: 0.88 },
              ]}
              onPress={() => onSelectTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Feather
                name={tab.icon}
                size={18}
                color={active ? palette.success : palette.subtext}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export default memo(BottomTabBar);

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: palette.background,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  tabButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabButtonActive: {
    backgroundColor: "rgba(126,207,157,0.16)",
    borderWidth: 1,
    borderColor: "rgba(126,207,157,0.48)",
  },
  tabLabel: {
    color: palette.subtext,
    fontFamily: typeface.heading,
    fontSize: 10,
  },
  tabLabelActive: {
    color: palette.success,
  },
});
