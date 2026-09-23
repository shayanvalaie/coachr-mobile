import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText, Card } from "../../../components/ui";
import { Feather } from "../../../icons";
import { BackendLineupVersionSummary } from "../../../lib/backend/types";
import { theme } from "../../../theme/colors";
import { space } from "../../../theme/tokens";
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
    <Card
      padding="none"
      onPress={busy ? undefined : onPress}
      onLongPress={busy ? undefined : onLongPress}
      accessibilityLabel={`Open ${title}. Long press to delete.`}
    >
      <View style={styles.row}>
        <View style={styles.meta}>
          <AppText variant="bodyLg" family="heading" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" color="secondary">
            {formatDateTime(version.createdAt)}
          </AppText>
        </View>
        <View style={styles.versionPill}>
          <AppText variant="caption" color="secondary">
            v{version.versionNumber}
          </AppText>
        </View>
        {busy ? (
          <ActivityIndicator color={theme.accent.base} size="small" />
        ) : (
          <Feather name="chevron-right" size={18} color={theme.text.muted} />
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  versionPill: {
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});

export default HistoryCard;
