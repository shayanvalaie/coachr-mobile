import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import LineUp from "../../../components/lineup/LineupGrid";
import {
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
} from "../../../lib/backend/types";
import { AppText, Button, EmptyState, Sheet } from "../../../components/ui";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import { InningAssignment } from "../../../types/lineup";
import { formatDateTime, normalizeLineupRows } from "../../../utils/lineupTransforms";

const STATIC_EXPANDED_INNINGS = new Set<number>();

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  gameId: string | null;
  lineups: BackendLineupVersionSummary[];
  carouselIndex: number;
  onCarouselIndexChange: (index: number) => void;
  detailsById: Record<string, BackendLineupVersionDetail>;
  isDetailsLoading: boolean;
  detailsError: string | null;
  activeLineupId: string | null;
  editingLineupId: string | null;
  draftRowsByLineupId: Record<string, InningAssignment[]>;
  playerGenderByName: Record<string, "male" | "female">;
  onToggleEditing: (lineupId: string, normalizedRows: InningAssignment[] | null) => void;
  onApplyCellEdit: (
    lineupId: string,
    normalizedRows: InningAssignment[] | null,
    inning: number,
    playerName: string,
    targetPosition: string,
  ) => void;
  onSaveEdited: (lineupVersion: BackendLineupVersionSummary) => void;
  onExport: (lineupId: string, format: "xlsx" | "pdf") => void;
  onGenerateInLineupPage: (gameId: string | null) => void;
};

// Saved-lineups viewer/editor: a paged carousel of lineup versions for one
// game, with inline grid editing, save-as-new-version, and exports.
const LineupsSheet = ({
  visible,
  onClose,
  title,
  gameId,
  lineups,
  carouselIndex,
  onCarouselIndexChange,
  detailsById,
  isDetailsLoading,
  detailsError,
  activeLineupId,
  editingLineupId,
  draftRowsByLineupId,
  playerGenderByName,
  onToggleEditing,
  onApplyCellEdit,
  onSaveEdited,
  onExport,
  onGenerateInLineupPage,
}: Props) => {
  const [carouselWidth, setCarouselWidth] = useState(0);

  return (
    <Sheet visible={visible} onClose={onClose} title="Saved Lineups">
      <AppText variant="caption" color="secondary">
        {title}
      </AppText>

      {lineups.length === 0 ? (
        <EmptyState
          icon="layers"
          title="No saved lineups for this game"
          body="Generate one in the Lineup page to get started."
          action={{
            label: "Generate In Lineup Page",
            onPress: () => onGenerateInLineupPage(gameId),
          }}
        />
      ) : (
        <>
          {detailsError ? (
            <AppText variant="caption" color="danger">
              {detailsError}
            </AppText>
          ) : null}
          <View
            style={styles.carouselViewport}
            onLayout={(event) => {
              const width = Math.round(event.nativeEvent.layout.width);
              if (width > 0 && width !== carouselWidth) {
                setCarouselWidth(width);
              }
            }}
          >
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const width = event.nativeEvent.layoutMeasurement.width || 1;
                const index = Math.round(event.nativeEvent.contentOffset.x / width);
                onCarouselIndexChange(index);
              }}
            >
              {lineups.map((lineupVersion) => {
                const detail = detailsById[lineupVersion.id];
                const normalizedRows = detail
                  ? normalizeLineupRows(detail.rows as Record<string, unknown>[])
                  : null;
                const displayRows =
                  draftRowsByLineupId[lineupVersion.id] ?? normalizedRows;
                const isBusy = activeLineupId === lineupVersion.id;
                const isEditing = editingLineupId === lineupVersion.id;

                return (
                  <View
                    key={lineupVersion.id}
                    style={[
                      styles.slide,
                      { width: carouselWidth > 0 ? carouselWidth : 280 },
                    ]}
                  >
                    <AppText variant="body" family="heading">
                      {lineupVersion.lineupName || `Lineup v${lineupVersion.versionNumber}`}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Version: v{lineupVersion.versionNumber}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Created: {formatDateTime(lineupVersion.createdAt)}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Innings: {lineupVersion.segmentCount ?? "-"}
                    </AppText>
                    <View style={styles.actionsRow}>
                      <Button
                        label={isEditing ? "Done Editing" : "Edit"}
                        variant="secondary"
                        size="sm"
                        icon="edit-2"
                        onPress={() => onToggleEditing(lineupVersion.id, normalizedRows)}
                        disabled={!detail || isBusy}
                      />
                      {isEditing ? (
                        <Button
                          label="Save"
                          size="sm"
                          icon="save"
                          onPress={() => onSaveEdited(lineupVersion)}
                          loading={isBusy}
                          disabled={isBusy}
                          accessibilityLabel="Save edited lineup"
                        />
                      ) : null}
                      <Button
                        label="Export Excel"
                        variant="secondary"
                        size="sm"
                        icon="download"
                        onPress={() => onExport(lineupVersion.id, "xlsx")}
                        disabled={isBusy}
                        accessibilityLabel="Export lineup to Excel"
                      />
                      <Button
                        label="Export PDF"
                        variant="secondary"
                        size="sm"
                        icon="file-text"
                        onPress={() => onExport(lineupVersion.id, "pdf")}
                        disabled={isBusy}
                        accessibilityLabel="Export lineup to PDF"
                      />
                    </View>

                    {detail ? (
                      displayRows && displayRows.length > 0 ? (
                        <ScrollView
                          style={styles.tableScroll}
                          contentContainerStyle={styles.tableContent}
                          nestedScrollEnabled
                        >
                          <LineUp
                            lineup={displayRows}
                            expandedInnings={STATIC_EXPANDED_INNINGS}
                            onToggleInning={() => {}}
                            editable={isEditing}
                            playerGenderByName={playerGenderByName}
                            onSetPlayerPosition={(inning, playerName, targetPosition) =>
                              onApplyCellEdit(
                                lineupVersion.id,
                                normalizedRows,
                                inning,
                                playerName,
                                targetPosition,
                              )
                            }
                          />
                        </ScrollView>
                      ) : (
                        <AppText variant="caption" color="secondary">
                          No player assignments found for this lineup.
                        </AppText>
                      )
                    ) : (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator color={theme.accent.base} size="small" />
                        <AppText variant="caption" color="secondary">
                          {isDetailsLoading
                            ? "Loading lineup players..."
                            : "Lineup details not loaded."}
                        </AppText>
                      </View>
                    )}
                    {isEditing ? (
                      <AppText variant="caption" color="accent">
                        Editing in place. Tap Save to create a new edited version.
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
          {lineups.length > 1 ? (
            <View style={styles.carouselFooter}>
              <AppText variant="caption" color="secondary">
                {carouselIndex + 1} / {lineups.length}
              </AppText>
              <View style={styles.carouselDots}>
                {lineups.map((lineupVersion, index) => (
                  <View
                    key={`${lineupVersion.id}-${index}`}
                    style={[
                      styles.carouselDot,
                      index === carouselIndex && styles.carouselDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  carouselViewport: {
    width: "100%",
  },
  slide: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.elevated,
    padding: space.sm,
    gap: space.xxs,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.xxs,
  },
  tableScroll: {
    marginTop: space.xxs,
    maxHeight: 330,
  },
  tableContent: {
    paddingBottom: space.xxs,
  },
  loadingRow: {
    marginTop: space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  carouselFooter: {
    alignItems: "center",
    gap: space.xxs,
    paddingBottom: space.xxs,
  },
  carouselDots: {
    flexDirection: "row",
    gap: space.xxs,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: theme.border.strong,
  },
  carouselDotActive: {
    backgroundColor: theme.accent.base,
  },
});

export default LineupsSheet;
