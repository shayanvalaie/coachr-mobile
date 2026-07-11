import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BackendGame, BackendSession } from "../../lib/backend/types";
import {
  AppPressable,
  AppText,
  Button,
  Card,
  ScreenContainer,
  ScreenHeader,
} from "../../components/ui";
import { Feather } from "../../icons";
import { theme } from "../../theme/colors";
import { radius, space } from "../../theme/tokens";
import { LineupLaunchRequestInput } from "../../types/lineupLaunch";
import {
  dayKeyToMonthDate,
  dayKeyToReadable,
  MONTH_NAMES,
  shiftDayKeyByMonths,
  toDayKeyFromDate,
} from "../../utils/calendarDates";
import DayAgenda from "./components/DayAgenda";
import GameFormSheet from "./components/GameFormSheet";
import LineupsSheet from "./components/LineupsSheet";
import MonthGrid from "./components/MonthGrid";
import { useCalendarData } from "./hooks/useCalendarData";
import { useGameForm } from "./hooks/useGameForm";
import { useLineupCarousel } from "./hooks/useLineupCarousel";

type Props = {
  session: BackendSession;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenLineupPage: (request: LineupLaunchRequestInput) => void;
  hasProSubscription: boolean;
  onRequirePro: (featureLabel: string) => void;
};

// Calendar workspace orchestrator: owns the month cursor and view mode, and
// wires the data/form/carousel hooks into the grid, agenda, and sheets.
const CalendarScreen = ({
  session,
  onBack,
  onOpenProfile,
  onOpenLineupPage,
  hasProSubscription,
  onRequirePro,
}: Props) => {
  const initialTodayKey = toDayKeyFromDate(new Date());

  const [selectedDateKey, setSelectedDateKey] = useState(initialTodayKey);
  const [viewMode, setViewMode] = useState<"calendar" | "day">("calendar");

  const {
    ensureTeam,
    games,
    gamesByDay,
    upcomingCount,
    lineupsByGameId,
    playerGenderByName,
    isLoading,
    loadGames,
  } = useCalendarData({ session });

  const gameForm = useGameForm({
    ensureTeam,
    loadGames,
    selectedDateKey,
    setSelectedDateKey,
    onSaved: () => setViewMode("day"),
  });

  const carousel = useLineupCarousel({ ensureTeam, loadGames, lineupsByGameId });

  const selectedGames = useMemo(
    () => gamesByDay.get(selectedDateKey) ?? [],
    [gamesByDay, selectedDateKey],
  );

  const calendarMonthDate = useMemo(
    () => dayKeyToMonthDate(selectedDateKey),
    [selectedDateKey],
  );
  const calendarYear = calendarMonthDate.getFullYear();
  const calendarMonthIndex = calendarMonthDate.getMonth();

  const moveMonth = useCallback((offset: number) => {
    setSelectedDateKey((prevDayKey) => shiftDayKeyByMonths(prevDayKey, offset));
  }, []);

  const jumpToToday = useCallback(() => {
    setSelectedDateKey(toDayKeyFromDate(new Date()));
  }, []);

  const handleDateCellPress = useCallback(
    (dayKey: string) => {
      const dayGameCount = gamesByDay.get(dayKey)?.length ?? 0;
      if (dayGameCount > 0) {
        setSelectedDateKey(dayKey);
        setViewMode("day");
        return;
      }
      gameForm.openCreateForDate(dayKey);
    },
    [gameForm, gamesByDay],
  );

  const openLineupWorkspace = useCallback(
    (request: LineupLaunchRequestInput) => {
      if (!hasProSubscription && request.gameId) {
        onRequirePro("Per-game lineup generation");
        return;
      }
      carousel.close();
      onOpenLineupPage(request);
    },
    [carousel, hasProSubscription, onOpenLineupPage, onRequirePro],
  );

  const handleOpenLineups = useCallback(
    (game: BackendGame) => {
      const savedLineups = game.id ? lineupsByGameId.get(game.id) ?? [] : [];
      if (savedLineups.length === 0) {
        openLineupWorkspace({ gameId: game.id ?? null, autoGenerate: true });
        return;
      }
      void carousel.openForGame(game);
    },
    [carousel, lineupsByGameId, openLineupWorkspace],
  );

  const handleExport = useCallback(
    (lineupId: string, format: "xlsx" | "pdf") => {
      if (!hasProSubscription) {
        onRequirePro("Lineup exports");
        return;
      }
      void carousel.exportLineupVersion(lineupId, format);
    },
    [carousel, hasProSubscription, onRequirePro],
  );

  const profileButton = (
    <AppPressable
      onPress={onOpenProfile}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      style={styles.iconButton}
      hitSlop={8}
    >
      <Feather name="user" size={18} color={theme.text.primary} />
    </AppPressable>
  );

  const addGameButton = (
    <AppPressable
      onPress={() => gameForm.openCreateForDate(selectedDateKey)}
      accessibilityRole="button"
      accessibilityLabel={`Add game on ${dayKeyToReadable(selectedDateKey)}`}
      style={styles.iconButton}
      hitSlop={8}
    >
      <Feather name="plus" size={16} color={theme.text.primary} />
    </AppPressable>
  );

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <ScreenHeader
        title="Calendar"
        subtitle="Calendar Workspace"
        onBack={onBack}
        right={profileButton}
      />

      <Card variant="elevated">
        <View style={styles.cardInner}>
          <AppText variant="title" family="display">
            Plan games and track outcomes
          </AppText>
          <AppText variant="caption" color="secondary">
            Total games: {games.length} | Upcoming: {upcomingCount}
          </AppText>
        </View>
      </Card>

      {viewMode === "calendar" ? (
        <Card>
          <View style={styles.cardBody}>
            <View style={styles.monthHeader}>
              <AppText variant="bodyLg" family="heading">
                Calendar
              </AppText>
              <View style={styles.monthActions}>
                <AppPressable
                  onPress={() => moveMonth(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  style={styles.iconButton}
                  hitSlop={8}
                >
                  <Feather name="chevron-left" size={16} color={theme.text.primary} />
                </AppPressable>
                <AppText variant="bodyLg" family="display" style={styles.monthLabel}>
                  {MONTH_NAMES[calendarMonthIndex]} {calendarYear}
                </AppText>
                <AppPressable
                  onPress={() => moveMonth(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  style={styles.iconButton}
                  hitSlop={8}
                >
                  <Feather name="chevron-right" size={16} color={theme.text.primary} />
                </AppPressable>
                <Button
                  label="Today"
                  variant="secondary"
                  size="sm"
                  onPress={jumpToToday}
                  accessibilityLabel="Jump to today"
                />
              </View>
            </View>

            <View style={styles.selectedBar}>
              <AppText variant="caption" color="secondary" style={styles.selectedText}>
                Selected: {dayKeyToReadable(selectedDateKey)}
              </AppText>
              <View style={styles.selectedActions}>
                <Button
                  label="Open Games"
                  variant="secondary"
                  size="sm"
                  onPress={() => setViewMode("day")}
                  accessibilityLabel={`Open games on ${dayKeyToReadable(selectedDateKey)}`}
                />
                {addGameButton}
              </View>
            </View>

            <MonthGrid
              year={calendarYear}
              monthIndex={calendarMonthIndex}
              gamesByDay={gamesByDay}
              todayKey={initialTodayKey}
              selectedDateKey={selectedDateKey}
              onPressDay={handleDateCellPress}
            />
          </View>
        </Card>
      ) : (
        <Card>
          <View style={styles.cardBody}>
            <View style={styles.monthHeader}>
              <View style={styles.dayTitleBlock}>
                <AppText variant="bodyLg" family="heading">
                  Games
                </AppText>
                <AppText variant="caption" color="secondary">
                  {dayKeyToReadable(selectedDateKey)}
                </AppText>
              </View>
              <View style={styles.selectedActions}>
                <Button
                  label="Calendar"
                  variant="secondary"
                  size="sm"
                  icon="calendar"
                  onPress={() => setViewMode("calendar")}
                  accessibilityLabel="Back to calendar"
                />
                {addGameButton}
              </View>
            </View>

            <DayAgenda
              games={selectedGames}
              lineupsByGameId={lineupsByGameId}
              isLoading={isLoading}
              onAddGame={() => gameForm.openCreateForDate(selectedDateKey)}
              onOpenLineups={handleOpenLineups}
              onEditGame={gameForm.startEditingGame}
              onDeleteGame={gameForm.deleteGame}
            />
          </View>
        </Card>
      )}

      <LineupsSheet
        visible={carousel.isOpen}
        onClose={carousel.close}
        title={carousel.modalTitle}
        gameId={carousel.modalGameId}
        lineups={carousel.lineups}
        carouselIndex={carousel.carouselIndex}
        onCarouselIndexChange={carousel.setCarouselIndex}
        detailsById={carousel.detailsById}
        isDetailsLoading={carousel.isDetailsLoading}
        detailsError={carousel.detailsError}
        activeLineupId={carousel.activeLineupId}
        editingLineupId={carousel.editingLineupId}
        draftRowsByLineupId={carousel.draftRowsByLineupId}
        playerGenderByName={playerGenderByName}
        onToggleEditing={carousel.toggleEditing}
        onApplyCellEdit={carousel.applyCellEdit}
        onSaveEdited={(lineupVersion) => void carousel.saveEditedLineupVersion(lineupVersion)}
        onExport={handleExport}
        onGenerateInLineupPage={(gameId) =>
          openLineupWorkspace({ gameId, autoGenerate: true })
        }
      />

      <GameFormSheet
        visible={gameForm.isFormOpen}
        onClose={gameForm.closeForm}
        form={gameForm.form}
        setForm={gameForm.setForm}
        selectedDateKey={selectedDateKey}
        isSaving={gameForm.isSaving}
        error={gameForm.formError}
        onSave={() => void gameForm.saveGame()}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: space.sm,
  },
  cardInner: {
    gap: space.xxs,
  },
  cardBody: {
    gap: space.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.base,
    backgroundColor: theme.bg.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    flexWrap: "wrap",
  },
  monthActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  monthLabel: {
    minWidth: 96,
    textAlign: "center",
  },
  selectedBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  selectedText: {
    flex: 1,
  },
  selectedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  dayTitleBlock: {
    gap: 2,
  },
});

export default CalendarScreen;
