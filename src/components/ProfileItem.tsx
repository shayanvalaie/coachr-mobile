import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "../icons";
import { theme } from "../theme/colors";
import { space } from "../theme/tokens";
import { AppText, Card } from "./ui";

type Props = {
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
};

const ProfileItem = ({ title, subtitle, onPress, danger = false }: Props) => (
  <Card
    onPress={onPress}
    padding="md"
    style={[styles.item, danger && styles.dangerItem]}
    accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
  >
    <View style={styles.textGroup}>
      <AppText variant="bodyLg" family="heading" color={danger ? "danger" : "primary"}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="body" color="secondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
    <Feather
      name="chevron-right"
      size={20}
      color={danger ? theme.danger.base : theme.text.secondary}
    />
  </Card>
);

export default memo(ProfileItem);

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  dangerItem: {
    borderColor: theme.danger.subtleBorder,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
});
