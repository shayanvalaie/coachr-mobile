import { ScrollView, StyleSheet, View } from "react-native";
import { AppPressable, AppText, Button, Sheet } from "../../../components/ui";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import { Player } from "../../../types/lineup";

type Props = {
  visible: boolean;
  onClose: () => void;
  roster: Player[];
  activeIds: Set<string>;
  onTogglePlayer: (playerId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
};

// Active-player selection for the next lineup run.
const PlayerPickerSheet = ({
  visible,
  onClose,
  roster,
  activeIds,
  onTogglePlayer,
  onSelectAll,
  onClear,
}: Props) => (
  <Sheet visible={visible} onClose={onClose} title="Select Active Players">
    <View style={styles.body}>
      <AppText variant="caption" color="secondary">
        Choose players used for this lineup run.
      </AppText>

      <View style={styles.selectionActions}>
        <Button
          label="Select all"
          variant="secondary"
          size="sm"
          onPress={onSelectAll}
          accessibilityLabel="Select all players"
        />
        <Button
          label="Clear"
          variant="secondary"
          size="sm"
          onPress={onClear}
          accessibilityLabel="Clear player selection"
        />
      </View>

      <ScrollView
        style={styles.scroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {roster.map((player) => {
            const active = activeIds.has(player.id);
            const name = player.name || "Unnamed";
            return (
              <AppPressable
                key={player.id}
                style={[
                  styles.tile,
                  active ? styles.tileActive : styles.tileInactive,
                ]}
                onPress={() => onTogglePlayer(player.id)}
                pressScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${active ? "active" : "inactive"}`}
                accessibilityState={{ selected: active }}
              >
                <View style={styles.tileContent}>
                  {player.gender === "female" ? (
                    <View style={styles.genderBadge}>
                      <AppText
                        variant="caption"
                        family="heading"
                        color="accent"
                        style={styles.genderBadgeText}
                      >
                        F
                      </AppText>
                    </View>
                  ) : null}
                  <AppText
                    variant="caption"
                    family="heading"
                    numberOfLines={1}
                    style={styles.tileName}
                  >
                    {name}
                  </AppText>
                </View>
              </AppPressable>
            );
          })}
        </View>
      </ScrollView>
      <Button label="Done" onPress={onClose} fullWidth accessibilityLabel="Done selecting players" />
    </View>
  </Sheet>
);

const styles = StyleSheet.create({
  body: {
    gap: space.sm,
  },
  selectionActions: {
    flexDirection: "row",
    gap: space.xs,
    flexWrap: "wrap",
  },
  scroll: {
    maxHeight: 380,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xxs + 2,
  },
  tile: {
    width: "31.5%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.elevated,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    minHeight: 38,
  },
  tileInactive: {
    opacity: 0.65,
  },
  tileActive: {
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
  },
  tileContent: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs + 2,
  },
  tileName: {
    flex: 1,
    textAlign: "left",
  },
  genderBadge: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.accent.subtleBorder,
    backgroundColor: theme.accent.subtle,
  },
  genderBadgeText: {
    lineHeight: 14,
    textAlign: "center",
  },
});

export default PlayerPickerSheet;
