import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedRef,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LineupGrid from "../../../components/lineup/LineupGrid";
import { AppPressable, AppText, Button } from "../../../components/ui";
import { Feather } from "../../../icons";
import { theme, withAlpha } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import { InningAssignment, Player } from "../../../types/lineup";

type Props = {
  title: string;
  isHistoryEdit: boolean;
  lineup: InningAssignment[] | null;
  expandedInnings: Set<number>;
  editable: boolean;
  canUndo: boolean;
  isSaving: boolean;
  exportBusy: boolean;
  error: string | null;
  playerGenderByName?: Record<string, Player["gender"]>;
  onExport: (format: "xlsx" | "pdf") => void;
  onSavePress: () => void;
  onUndo: () => void;
  onDone: () => void;
  onClose: () => void;
  onSetPlayerPosition: (
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
};

const EXPORT_MENU_WIDTH = 168;
// Room reserved at the card's right edge in fullscreen so the floating
// restore button never sits on top of the last inning column.
const RESTORE_CLEARANCE = 46;
// Uniform gap between the card and the screen edges in fullscreen.
const FULLSCREEN_GAP = space.xs;

// Full-screen (landscape) lineup editor. This is intentionally an absolute
// overlay rather than a Sheet: it locks the device to landscape and needs the
// whole screen for the grid.
const EditLineupOverlay = ({
  title,
  isHistoryEdit,
  lineup,
  expandedInnings,
  editable,
  canUndo,
  isSaving,
  exportBusy,
  error,
  playerGenderByName,
  onExport,
  onSavePress,
  onUndo,
  onDone,
  onClose,
  onSetPlayerPosition,
}: Props) => {
  const insets = useSafeAreaInsets();
  const gridScrollRef = useAnimatedRef<Animated.ScrollView>();
  const exportButtonRef = useRef<View>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportMenuPos, setExportMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const closeExportMenu = useCallback(() => setExportMenuPos(null), []);

  const toggleExportMenu = useCallback(() => {
    if (exportMenuPos) {
      setExportMenuPos(null);
      return;
    }
    // Anchor the menu to the trigger's window position; the overlay root is
    // a full-screen absolute view, so window coords map onto it directly.
    exportButtonRef.current?.measureInWindow((x, y, width, height) => {
      setExportMenuPos({
        top: y + height + space.xxs,
        left: x + width - EXPORT_MENU_WIDTH,
      });
    });
  }, [exportMenuPos]);

  const toggleFullscreen = useCallback(() => {
    // Resizing is animated by the reanimated `layout` transitions on the
    // header/body below. LayoutAnimation is unreliable (flickers) on the New
    // Architecture, so it is intentionally not used here.
    setExportMenuPos(null);
    setIsFullscreen((prev) => !prev);
  }, []);

  // Shared timing so the fullscreen resize and the error banner reflow move
  // together. Kept short so the editor feels responsive.
  const layoutTransition = LinearTransition.duration(240);

  const handleExport = useCallback(
    (format: "xlsx" | "pdf") => {
      setExportMenuPos(null);
      onExport(format);
    },
    [onExport],
  );

  return (
    <View style={styles.overlay}>
      <View
        style={[
          styles.screen,
          // Normal mode keeps the chrome inside the safe area (the header
          // text must clear the notch). Fullscreen runs the card nearly
          // edge-to-edge with one uniform gap; the safe-area allowance moves
          // inside the card as content padding instead.
          isFullscreen
            ? { padding: FULLSCREEN_GAP }
            : {
                paddingTop: Math.max(insets.top, space.sm),
                paddingBottom: Math.max(insets.bottom, space.sm),
                paddingLeft: Math.max(insets.left, space.md),
                paddingRight: Math.max(insets.right, space.md),
              },
        ]}
      >
        {!isFullscreen && (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            layout={layoutTransition}
            style={styles.header}
          >
            <View style={styles.titleGroup}>
              <AppPressable
                style={styles.iconButton}
                onPress={toggleFullscreen}
                accessibilityRole="button"
                accessibilityLabel="Expand lineup to full screen"
                hitSlop={4}
              >
                <Feather
                  name="maximize-2"
                  size={16}
                  color={theme.text.primary}
                />
              </AppPressable>
              <AppText
                variant="display"
                family="display"
                numberOfLines={1}
                style={styles.title}
              >
                {title}
              </AppText>
            </View>
            <View style={styles.actions}>
              {editable && (
                <AppPressable
                  style={[styles.iconButton, !canUndo && styles.iconButtonDisabled]}
                  onPress={onUndo}
                  disabled={!canUndo}
                  accessibilityRole="button"
                  accessibilityLabel="Undo last change"
                  accessibilityState={{ disabled: !canUndo }}
                  hitSlop={4}
                >
                  <Feather
                    name="rotate-ccw"
                    size={16}
                    color={canUndo ? theme.text.primary : theme.text.muted}
                  />
                </AppPressable>
              )}
              {isHistoryEdit && (
                <View ref={exportButtonRef} collapsable={false}>
                  <Button
                    label="Export"
                    variant="secondary"
                    size="sm"
                    icon="download"
                    onPress={toggleExportMenu}
                    disabled={exportBusy}
                    accessibilityLabel="Export lineup"
                  />
                </View>
              )}
              <Button
                label={isHistoryEdit ? "Cancel" : "Done"}
                variant="secondary"
                size="sm"
                onPress={isHistoryEdit ? onClose : onDone}
                accessibilityLabel={
                  isHistoryEdit ? "Cancel editing lineup" : "Done editing lineup"
                }
              />
              <Button
                label="Save"
                size="sm"
                onPress={onSavePress}
                loading={isSaving}
                accessibilityLabel="Save lineup"
              />
            </View>
          </Animated.View>
        )}

        {error ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(140)}
            style={styles.errorBanner}
          >
            <Feather
              name="alert-triangle"
              size={14}
              color={theme.danger.base}
            />
            <AppText variant="caption" color="danger" style={styles.errorText}>
              {error}
            </AppText>
          </Animated.View>
        ) : null}

        <Animated.View layout={layoutTransition} style={styles.bodyWrap}>
          <Animated.ScrollView
            ref={gridScrollRef}
            style={styles.body}
            contentContainerStyle={[
              styles.bodyContent,
              // Keep grid content clear of the notch/rounded corners now
              // that the card surface extends underneath them.
              isFullscreen && {
                paddingLeft: Math.max(insets.left - FULLSCREEN_GAP, space.sm),
                paddingRight: Math.max(
                  insets.right - FULLSCREEN_GAP,
                  RESTORE_CLEARANCE,
                ),
              },
            ]}
          >
            <LineupGrid
              lineup={lineup}
              expandedInnings={expandedInnings}
              onToggleInning={() => {}}
              editable={editable}
              onSetPlayerPosition={onSetPlayerPosition}
              playerGenderByName={playerGenderByName}
              scrollableRef={gridScrollRef}
              presentation="editModal"
            />
          </Animated.ScrollView>

          {isFullscreen && (
            <View style={styles.floatingControls}>
              {editable && (
                <AppPressable
                  style={[
                    styles.iconButton,
                    styles.floatingControl,
                    !canUndo && styles.iconButtonDisabled,
                  ]}
                  onPress={onUndo}
                  disabled={!canUndo}
                  accessibilityRole="button"
                  accessibilityLabel="Undo last change"
                  accessibilityState={{ disabled: !canUndo }}
                  hitSlop={4}
                >
                  <Feather
                    name="rotate-ccw"
                    size={16}
                    color={canUndo ? theme.text.primary : theme.text.muted}
                  />
                </AppPressable>
              )}
              <AppPressable
                style={[styles.iconButton, styles.floatingControl]}
                onPress={toggleFullscreen}
                accessibilityRole="button"
                accessibilityLabel="Exit full screen"
                hitSlop={4}
              >
                <Feather
                  name="minimize-2"
                  size={16}
                  color={theme.text.primary}
                />
              </AppPressable>
            </View>
          )}
        </Animated.View>
      </View>

      {exportMenuPos && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeExportMenu}
            accessibilityLabel="Close export menu"
          />
          <Animated.View
            entering={FadeInDown.duration(150).withInitialValues({
              opacity: 0,
              transform: [{ translateY: -4 }],
            })}
            exiting={FadeOut.duration(100)}
            style={[styles.exportMenu, exportMenuPos]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.exportOption,
                pressed && styles.exportOptionPressed,
              ]}
              onPress={() => handleExport("xlsx")}
              accessibilityRole="button"
              accessibilityLabel="Export lineup to Excel"
            >
              <Feather
                name="file-text"
                size={15}
                color={theme.text.secondary}
              />
              <AppText variant="body" family="heading">
                Excel (.xlsx)
              </AppText>
            </Pressable>
            <View style={styles.exportDivider} />
            <Pressable
              style={({ pressed }) => [
                styles.exportOption,
                pressed && styles.exportOptionPressed,
              ]}
              onPress={() => handleExport("pdf")}
              accessibilityRole="button"
              accessibilityLabel="Export lineup to PDF"
            >
              <Feather name="file" size={15} color={theme.text.secondary} />
              <AppText variant="body" family="heading">
                PDF
              </AppText>
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
};

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
    gap: space.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  // Groups the view-mode toggle with the title, keeping it clear of the
  // Save/Cancel actions so the expand button can't be mistapped for Cancel.
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexShrink: 1,
  },
  title: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: withAlpha(theme.danger.base, 0.4),
    backgroundColor: withAlpha(theme.danger.base, 0.12),
  },
  errorText: {
    flex: 1,
  },
  bodyWrap: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.raised,
    overflow: "hidden",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: space.sm,
  },
  floatingControls: {
    position: "absolute",
    top: space.xs,
    right: space.xs,
    flexDirection: "row",
    gap: space.xs,
    zIndex: 20,
  },
  floatingControl: {
    backgroundColor: withAlpha(theme.bg.raised, 0.92),
  },
  exportMenu: {
    position: "absolute",
    width: EXPORT_MENU_WIDTH,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.base,
    paddingVertical: space.xxs,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    zIndex: 1100,
  },
  exportOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 40,
    paddingHorizontal: space.sm,
    marginHorizontal: space.xxs,
    borderRadius: radius.sm,
  },
  exportOptionPressed: {
    backgroundColor: withAlpha(theme.text.primary, 0.06),
  },
  exportDivider: {
    height: 1,
    backgroundColor: theme.border.subtle,
    marginHorizontal: space.xs,
  },
});

export default EditLineupOverlay;
