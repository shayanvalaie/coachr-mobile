import { Platform, ScrollView, StyleSheet, View } from "react-native";
import LineupGrid from "../../../components/lineup/LineupGrid";
import { AppText, Button } from "../../../components/ui";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import { InningAssignment, Player } from "../../../types/lineup";

type Props = {
  title: string;
  isHistoryEdit: boolean;
  lineup: InningAssignment[] | null;
  expandedInnings: Set<number>;
  editable: boolean;
  isSaving: boolean;
  exportBusy: boolean;
  playerGenderByName?: Record<string, Player["gender"]>;
  onExport: (format: "xlsx" | "pdf") => void;
  onSavePress: () => void;
  onDone: () => void;
  onClose: () => void;
  onSetPlayerPosition: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  onDragStateChange?: (isDragging: boolean) => void;
};

// Full-screen (landscape) lineup editor. This is intentionally an absolute
// overlay rather than a Sheet: it locks the device to landscape and needs the
// whole screen for the grid.
const EditLineupOverlay = ({
  title,
  isHistoryEdit,
  lineup,
  expandedInnings,
  editable,
  isSaving,
  exportBusy,
  playerGenderByName,
  onExport,
  onSavePress,
  onDone,
  onClose,
  onSetPlayerPosition,
  onDragStateChange,
}: Props) => (
  <View style={styles.overlay}>
    <View style={styles.screen}>
      <View style={styles.header}>
        <AppText variant="display" family="display" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        <View style={styles.actions}>
          <Button
            label="Save"
            variant="secondary"
            size="sm"
            onPress={onSavePress}
            loading={isSaving}
            accessibilityLabel="Save lineup"
          />
          {isHistoryEdit && (
            <>
              <Button
                label="Excel"
                variant="secondary"
                size="sm"
                onPress={() => onExport("xlsx")}
                disabled={exportBusy}
                accessibilityLabel="Export lineup to Excel"
              />
              <Button
                label="PDF"
                variant="secondary"
                size="sm"
                onPress={() => onExport("pdf")}
                disabled={exportBusy}
                accessibilityLabel="Export lineup to PDF"
              />
            </>
          )}
          <Button
            label={isHistoryEdit ? "Cancel" : "Done"}
            size="sm"
            onPress={isHistoryEdit ? onClose : onDone}
            accessibilityLabel={
              isHistoryEdit ? "Cancel editing lineup" : "Done editing lineup"
            }
          />
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <LineupGrid
          lineup={lineup}
          expandedInnings={expandedInnings}
          onToggleInning={() => {}}
          editable={editable}
          onSetPlayerPosition={onSetPlayerPosition}
          playerGenderByName={playerGenderByName}
          onDragStateChange={onDragStateChange}
          presentation="editModal"
        />
      </ScrollView>
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  screen: {
    flex: 1,
    backgroundColor: theme.bg.base,
    paddingTop: Platform.OS === "ios" ? 56 : 24,
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.sm,
  },
  title: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    gap: space.xs,
    alignItems: "center",
  },
  body: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
  },
  bodyContent: {
    padding: space.sm,
  },
});

export default EditLineupOverlay;
