import { StyleProp, StyleSheet, TextStyle } from "react-native";
import AppText from "./AppText";

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
};

// Small uppercase label above a group of controls ("Positions", "Coach notes").
const SectionLabel = ({ children, style }: Props) => (
  <AppText variant="caption" family="heading" color="secondary" style={[styles.label, style]}>
    {children}
  </AppText>
);

const styles = StyleSheet.create({
  label: {
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});

export default SectionLabel;
