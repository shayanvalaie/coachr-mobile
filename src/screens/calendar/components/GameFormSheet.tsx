import { Dispatch, SetStateAction, useCallback, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { BackendGame } from "../../../lib/backend/types";
import {
  AppPressable,
  AppText,
  Button,
  Chip,
  Input,
  Sheet,
} from "../../../components/ui";
import { Feather } from "../../../icons";
import { theme } from "../../../theme/colors";
import { radius, space } from "../../../theme/tokens";
import {
  dateTimeInputToDate,
  dateTimeInputToReadable,
  dateToDateTimeInput,
  dayKeyToReadable,
} from "../../../utils/calendarDates";
import { GameFormState } from "../hooks/useGameForm";

const HOME_AWAY_OPTIONS = ["home", "away"] as const;
const STATUS_OPTIONS = ["scheduled", "completed", "postponed", "cancelled"] as const;

// The option values are the lowercase backend enums; only the visible label is
// capitalized.
const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

type Props = {
  visible: boolean;
  onClose: () => void;
  form: GameFormState;
  setForm: Dispatch<SetStateAction<GameFormState>>;
  selectedDateKey: string;
  isSaving: boolean;
  error: string | null;
  onSave: () => void;
};

// Create/edit game form. The scheduled time uses the platform date pickers
// (inline spinner on iOS, the imperative dialogs on Android) but stores the
// same local `YYYY-MM-DDTHH:mm` string the raw text field used to hold.
const GameFormSheet = ({
  visible,
  onClose,
  form,
  setForm,
  selectedDateKey,
  isSaving,
  error,
  onSave,
}: Props) => {
  const [showIosPicker, setShowIosPicker] = useState(false);

  const pickerDate =
    dateTimeInputToDate(form.scheduledAtInput) ??
    new Date(Date.now() + 60 * 60 * 1000);
  const scheduledLabel = dateTimeInputToReadable(form.scheduledAtInput);

  const commitScheduledAt = useCallback(
    (date: Date) => {
      setForm((prev) => ({ ...prev, scheduledAtInput: dateToDateTimeInput(date) }));
    },
    [setForm],
  );

  const openAndroidPicker = useCallback(() => {
    DateTimePickerAndroid.open({
      value: pickerDate,
      mode: "date",
      onChange: (dateEvent: DateTimePickerEvent, datePart?: Date) => {
        if (dateEvent.type !== "set" || !datePart) return;
        DateTimePickerAndroid.open({
          value: datePart,
          mode: "time",
          onChange: (timeEvent: DateTimePickerEvent, dateTime?: Date) => {
            if (timeEvent.type !== "set" || !dateTime) return;
            commitScheduledAt(dateTime);
          },
        });
      },
    });
  }, [commitScheduledAt, pickerDate]);

  const handleScheduledFieldPress = useCallback(() => {
    if (Platform.OS === "android") {
      openAndroidPicker();
      return;
    }
    setShowIosPicker((prev) => !prev);
  }, [openAndroidPicker]);

  const handleClose = useCallback(() => {
    setShowIosPicker(false);
    onClose();
  }, [onClose]);

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title={form.id ? "Edit Game" : "New Game"}
      keyboard
    >
      <AppText variant="caption" color="secondary">
        Date: {dayKeyToReadable(selectedDateKey)}
      </AppText>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formBody}>
          <View style={styles.row}>
            <Input
              label="Title"
              value={form.title}
              onChangeText={(title) => setForm((prev) => ({ ...prev, title }))}
              placeholder="Week 4 Matchup"
              containerStyle={styles.field}
            />
            <Input
              label="Opponent"
              value={form.opponentName}
              onChangeText={(opponentName) =>
                setForm((prev) => ({ ...prev, opponentName }))
              }
              placeholder="Tigers"
              containerStyle={styles.field}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="caption" family="heading" color="secondary">
              Date & time
            </AppText>
            <AppPressable
              onPress={handleScheduledFieldPress}
              accessibilityRole="button"
              accessibilityLabel={
                scheduledLabel
                  ? `Game date and time: ${scheduledLabel}. Change`
                  : "Choose game date and time"
              }
              style={styles.pickerField}
            >
              <Feather name="calendar" size={16} color={theme.text.secondary} />
              <AppText
                variant="bodyLg"
                color={scheduledLabel ? "primary" : "muted"}
                style={styles.pickerFieldText}
              >
                {scheduledLabel ?? "Choose date and time"}
              </AppText>
              <Feather
                name={
                  Platform.OS === "ios" && showIosPicker
                    ? "chevron-up"
                    : "chevron-down"
                }
                size={16}
                color={theme.text.secondary}
              />
            </AppPressable>
            {Platform.OS === "ios" && showIosPicker ? (
              <DateTimePicker
                value={pickerDate}
                mode="datetime"
                display="spinner"
                themeVariant="dark"
                onChange={(_event: DateTimePickerEvent, date?: Date) => {
                  if (date) commitScheduledAt(date);
                }}
              />
            ) : null}
          </View>

          <View style={styles.row}>
            <Input
              label="Location"
              value={form.location}
              onChangeText={(location) => setForm((prev) => ({ ...prev, location }))}
              placeholder="Main Field"
              containerStyle={styles.field}
            />
            <Input
              label="Competition"
              value={form.competition}
              onChangeText={(competition) =>
                setForm((prev) => ({ ...prev, competition }))
              }
              placeholder="League"
              containerStyle={styles.field}
            />
          </View>

          <View style={styles.row}>
            <Input
              label="Season"
              value={form.season}
              onChangeText={(season) => setForm((prev) => ({ ...prev, season }))}
              placeholder="Spring 2026"
              containerStyle={styles.field}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="caption" family="heading" color="secondary">
              Home/Away
            </AppText>
            <View style={styles.chipRow}>
              {HOME_AWAY_OPTIONS.map((value) => (
                <Chip
                  key={value}
                  label={capitalize(value)}
                  selected={form.homeAway === value}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      homeAway: value as BackendGame["homeAway"],
                    }))
                  }
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="caption" family="heading" color="secondary">
              Status
            </AppText>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((value) => (
                <Chip
                  key={value}
                  label={capitalize(value)}
                  selected={form.status === value}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      status: value as BackendGame["status"],
                    }))
                  }
                />
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <Input
              label="Our Score"
              value={form.ourScoreInput}
              onChangeText={(ourScoreInput) =>
                setForm((prev) => ({ ...prev, ourScoreInput }))
              }
              keyboardType="number-pad"
              placeholder="Optional"
              containerStyle={styles.field}
            />
            <Input
              label="Opponent Score"
              value={form.opponentScoreInput}
              onChangeText={(opponentScoreInput) =>
                setForm((prev) => ({ ...prev, opponentScoreInput }))
              }
              keyboardType="number-pad"
              placeholder="Optional"
              containerStyle={styles.field}
            />
          </View>

          <View style={styles.chipRow}>
            <Chip
              label="League Game"
              icon={form.isLeagueGame ? "check" : undefined}
              selected={form.isLeagueGame}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  isLeagueGame: !prev.isLeagueGame,
                  isPlayoff: false,
                }))
              }
            />
            <Chip
              label="Playoff"
              icon={form.isPlayoff ? "check" : undefined}
              selected={form.isPlayoff}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  isPlayoff: !prev.isPlayoff,
                  isLeagueGame: false,
                }))
              }
            />
          </View>

          <Input
            label="Notes"
            value={form.notes}
            onChangeText={(notes) => setForm((prev) => ({ ...prev, notes }))}
            placeholder="Travel details, lineup notes, weather, officials..."
            multiline
            textAlignVertical="top"
            style={styles.notesInput}
          />

          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={handleClose}
              disabled={isSaving}
            />
            <Button
              label="Save Game"
              onPress={onSave}
              loading={isSaving}
              accessibilityLabel="Save game"
            />
          </View>
        </View>
      </ScrollView>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  formBody: {
    gap: space.sm,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: "row",
    gap: space.xs,
  },
  field: {
    flex: 1,
    gap: space.xs,
  },
  pickerField: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: theme.bg.elevated,
    borderWidth: 1,
    borderColor: theme.border.base,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    minHeight: 44,
  },
  pickerFieldText: {
    flex: 1,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  notesInput: {
    minHeight: 88,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.xs,
  },
});

export default GameFormSheet;
