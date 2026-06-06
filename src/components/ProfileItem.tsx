import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Entypo } from "../icons";
import { palette } from "../theme/colors";

type Props = {
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
};

const ProfileItem = ({ title, subtitle, onPress, danger = false }: Props) => (
  <Pressable
    style={({ pressed }) => [
      styles.item,
      pressed && { opacity: 0.85 },
      danger && styles.dangerItem,
    ]}
    onPress={onPress}
    accessibilityRole="button"
  >
    <View style={styles.textGroup}>
      <Text style={[styles.title, danger && styles.dangerText]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    <Entypo
      name="chevron-small-right"
      size={22}
      color={danger ? palette.danger : palette.subtext}
    />
  </Pressable>
);

export default memo(ProfileItem);

const styles = StyleSheet.create({
  item: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: palette.card,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: palette.border,
  },
  dangerItem: {
    borderColor: "rgba(248,107,107,0.3)",
  },
  textGroup: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: palette.text,
    fontWeight: "800",
  },
  subtitle: {
    color: palette.subtext,
    fontSize: 13,
  },
  dangerText: {
    color: palette.danger,
  },
});
