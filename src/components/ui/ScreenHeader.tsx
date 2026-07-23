import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { space } from "../../theme/tokens";
import AppText from "./AppText";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

// Standard header for screens: title block plus optional right-side actions.
// Replaces the per-screen hand-rolled header rows.
const ScreenHeader = ({ title, subtitle, right }: Props) => (
  <View style={styles.row}>
    <View style={styles.titleBlock}>
      <AppText variant="title" family="display">
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" color="secondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
    {right ? <View style={styles.right}>{right}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
});

export default ScreenHeader;
