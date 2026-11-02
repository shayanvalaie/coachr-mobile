import { StyleSheet, View } from "react-native";
import { space } from "../theme/tokens";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import Sheet from "./ui/Sheet";

type Props = {
  visible: boolean;
  featureLabel: string;
  onClose: () => void;
  onUpgrade: () => void;
};

const ProGateModal = ({ visible, featureLabel, onClose, onUpgrade }: Props) => (
  <Sheet visible={visible} onClose={onClose} title="Unlock with Coachr Pro">
    <AppText variant="caption" family="heading" color="accent" style={styles.eyebrow}>
      Coachr Pro
    </AppText>
    <AppText variant="body" color="secondary">
      {featureLabel} is available on Coachr Pro. Renew or restore to unlock the
      calendar, game lineups and history, imports, and exports. Your saved data
      stays in your account.
    </AppText>
    <View style={styles.actions}>
      <View style={styles.action}>
        <Button label="Not now" variant="secondary" onPress={onClose} />
      </View>
      <View style={styles.action}>
        <Button label="View Pro options" onPress={onUpgrade} />
      </View>
    </View>
  </Sheet>
);

export default ProGateModal;

const styles = StyleSheet.create({
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: -space.xs,
  },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.xxs,
    marginBottom: space.xs,
  },
  action: {
    flex: 1,
  },
});
