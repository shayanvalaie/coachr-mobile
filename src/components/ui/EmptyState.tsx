import { StyleSheet, View } from "react-native";
import { Feather, IconName } from "../../icons";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import AppText from "./AppText";
import Button from "./Button";

type Props = {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
};

const EmptyState = ({ icon, title, body, action }: Props) => (
  <View style={styles.container}>
    <View style={styles.iconWrap}>
      <Feather name={icon} size={22} color={theme.text.secondary} />
    </View>
    <AppText variant="title" family="heading" style={styles.center}>
      {title}
    </AppText>
    {body ? (
      <AppText variant="body" color="secondary" style={styles.center}>
        {body}
      </AppText>
    ) : null}
    {action ? (
      <View style={styles.action}>
        <Button label={action.label} onPress={action.onPress} size="sm" variant="secondary" />
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    gap: space.xs,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: theme.bg.elevated,
    borderWidth: 1,
    borderColor: theme.border.base,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xxs,
  },
  center: {
    textAlign: "center",
  },
  action: {
    marginTop: space.xs,
  },
});

export default EmptyState;
