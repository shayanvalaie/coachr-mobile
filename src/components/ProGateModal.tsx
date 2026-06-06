import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";

type Props = {
  visible: boolean;
  featureLabel: string;
  onClose: () => void;
  onUpgrade: () => void;
};

const ProGateModal = ({ visible, featureLabel, onClose, onUpgrade }: Props) => (
  <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Coachr Pro</Text>
        <Text style={styles.title}>Upgrade to unlock this feature</Text>
        <Text style={styles.body}>
          {featureLabel} is available on Coachr Pro. Upgrade to remove ads, unlock
          imports and exports, and access the calendar.
        </Text>
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.85 }]}
            onPress={onClose}
          >
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
            onPress={onUpgrade}
          >
            <Text style={styles.primaryText}>Upgrade to Pro</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

export default ProGateModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(4, 12, 8, 0.72)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    padding: 18,
    gap: 10,
  },
  eyebrow: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  title: {
    color: palette.text,
    fontFamily: typeface.display,
    fontSize: 24,
  },
  body: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.cardAlt,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.72)",
    backgroundColor: palette.accent,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    color: palette.accentText,
    fontFamily: typeface.heading,
    fontSize: 13,
  },
});
