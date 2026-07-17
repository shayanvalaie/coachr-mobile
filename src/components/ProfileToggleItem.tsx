import React, { memo } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { theme, withAlpha } from "../theme/colors";
import { space } from "../theme/tokens";
import { AppText, Card } from "./ui";

type Props = {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

const ProfileToggleItem = ({ title, subtitle, value, onValueChange }: Props) => (
  <Card padding="md" style={styles.item}>
    <View
      style={styles.textGroup}
      accessible
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      <AppText variant="bodyLg" family="heading" color="primary">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="body" color="secondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{
        false: theme.border.base,
        true: withAlpha(theme.accent.base, 0.6),
      }}
      thumbColor={value ? theme.accent.base : theme.text.secondary}
      ios_backgroundColor={theme.border.base}
      accessibilityLabel={title}
    />
  </Card>
);

export default memo(ProfileToggleItem);

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
});
