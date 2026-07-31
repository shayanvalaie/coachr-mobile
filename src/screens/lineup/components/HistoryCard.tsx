import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppPressable, AppText } from "../../../components/ui";
import { Feather } from "../../../icons";
import { BackendLineupVersionSummary } from "../../../lib/backend/types";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import { formatDateTime } from "../../../utils/lineupTransforms";

type Props = {
  version: BackendLineupVersionSummary;
  busy: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

// One saved lineup version. Tap to open, long-press to delete.
const HistoryCard = ({ version, busy, onPress, onLongPress }: Props) => {
  const title = version.lineupName || `Lineup v${version.versionNumber}`;

  return (
    <AppPressable
      style={styles.row}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={busy}
      pressScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}. Long press to delete.`}
      accessibilityState={{ disabled: busy, busy }}
    >
      <View style={styles.meta}>
        <AppText variant="body" family="heading">
          {title}
        </AppText>
        <AppText variant="caption" color="secondary">
          {formatDateTime(version.createdAt)}
        </AppText>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.accent.base} size="small" />
      ) : (
        <Feather name="chevron-right" size={18} color={theme.text.secondary} />
      )}
    </AppPressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    padding: space.sm,
  },
  meta: {
    flex: 1,
    gap: space.xxs,
  },
});

export default HistoryCard;
