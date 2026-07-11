import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { backendClient } from "../../../lib/backend/client";
import { BackendGame } from "../../../lib/backend/types";
import { useToast } from "../../../components/ui";
import {
  mergeDayAndTime,
  toDateTimeLocalInput,
  toDayKeyFromIso,
  toIsoFromDateTimeInput,
} from "../../../utils/calendarDates";

export type GameFormState = {
  id?: string;
  title: string;
  opponentName: string;
  scheduledAtInput: string;
  location: string;
  homeAway: BackendGame["homeAway"];
  status: BackendGame["status"];
  ourScoreInput: string;
  opponentScoreInput: string;
  competition: string;
  season: string;
  notes: string;
  isLeagueGame: boolean;
  isPlayoff: boolean;
};

export const emptyForm = (dayKey?: string): GameFormState => {
  const scheduledAtInput = toDateTimeLocalInput(
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  );

  return {
    title: "",
    opponentName: "",
    scheduledAtInput: dayKey ? mergeDayAndTime(dayKey, scheduledAtInput) : scheduledAtInput,
    location: "",
    homeAway: "home",
    status: "scheduled",
    ourScoreInput: "",
    opponentScoreInput: "",
    competition: "",
    season: "",
    notes: "",
    isLeagueGame: false,
    isPlayoff: false,
  };
};

const gameToForm = (game: BackendGame): GameFormState => ({
  id: game.id,
  title: game.title,
  opponentName: game.opponentName,
  scheduledAtInput: toDateTimeLocalInput(game.scheduledAt),
  location: game.location,
  homeAway: game.homeAway,
  status: game.status,
  ourScoreInput: game.ourScore == null ? "" : String(game.ourScore),
  opponentScoreInput: game.opponentScore == null ? "" : String(game.opponentScore),
  competition: game.competition,
  season: game.season,
  notes: game.notes,
  isLeagueGame: game.isLeagueGame,
  isPlayoff: game.isPlayoff,
});

const parseScore = (raw: string): number | null | "invalid" => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
  return parsed;
};

type Params = {
  ensureTeam: () => Promise<string | null>;
  loadGames: () => Promise<void>;
  selectedDateKey: string;
  setSelectedDateKey: (dayKey: string) => void;
  onSaved: (dayKey: string) => void;
};

// Game form state plus create/update/delete against the backend. Validation
// failures stay inline (formError); transient outcomes go through the toast.
export const useGameForm = ({
  ensureTeam,
  loadGames,
  selectedDateKey,
  setSelectedDateKey,
  onSaved,
}: Params) => {
  const toast = useToast();
  const [form, setForm] = useState<GameFormState>(() => emptyForm(selectedDateKey));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateForDate = useCallback(
    (dayKey: string) => {
      setSelectedDateKey(dayKey);
      setForm(emptyForm(dayKey));
      setFormError(null);
      setIsFormOpen(true);
    },
    [setSelectedDateKey],
  );

  const startEditingGame = useCallback(
    (game: BackendGame) => {
      setForm(gameToForm(game));
      const dayKey = toDayKeyFromIso(game.scheduledAt);
      if (dayKey) {
        setSelectedDateKey(dayKey);
      }
      setFormError(null);
      setIsFormOpen(true);
    },
    [setSelectedDateKey],
  );

  const closeForm = useCallback(() => {
    if (isSaving) return;
    setIsFormOpen(false);
  }, [isSaving]);

  const saveGame = useCallback(async () => {
    setIsSaving(true);
    setFormError(null);
    try {
      const team = await ensureTeam();
      if (!team) {
        setFormError("Unable to find team for saving game.");
        return;
      }

      const scheduledAt = toIsoFromDateTimeInput(form.scheduledAtInput);
      if (!scheduledAt) {
        setFormError("Please enter a valid game date and time.");
        return;
      }

      const ourScore = parseScore(form.ourScoreInput);
      const opponentScore = parseScore(form.opponentScoreInput);
      if (ourScore === "invalid" || opponentScore === "invalid") {
        setFormError("Scores must be whole numbers or empty.");
        return;
      }

      const payload: BackendGame = {
        id: form.id,
        title: form.title.trim(),
        opponentName: form.opponentName.trim(),
        scheduledAt,
        location: form.location.trim(),
        homeAway: form.homeAway,
        status: form.status,
        ourScore,
        opponentScore,
        competition: form.competition.trim(),
        season: form.season.trim(),
        notes: form.notes.trim(),
        isLeagueGame: form.isLeagueGame,
        isPlayoff: form.isPlayoff,
      };

      await backendClient.saveTeamGame(team, payload);
      await loadGames();

      const savedDayKey = toDayKeyFromIso(scheduledAt) ?? selectedDateKey;
      setSelectedDateKey(savedDayKey);
      setIsFormOpen(false);
      setForm(emptyForm(savedDayKey));
      onSaved(savedDayKey);
      toast.show({
        type: "success",
        message: form.id ? "Game updated." : "Game added.",
      });
    } catch (_err) {
      setFormError("Unable to save game.");
    } finally {
      setIsSaving(false);
    }
  }, [ensureTeam, form, loadGames, onSaved, selectedDateKey, setSelectedDateKey, toast]);

  const deleteGame = useCallback(
    (gameId: string) => {
      Alert.alert("Delete game?", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setIsSaving(true);
            ensureTeam()
              .then(async (team) => {
                if (!team) {
                  toast.show({
                    type: "error",
                    message: "Unable to find team for deleting game.",
                  });
                  return;
                }
                await backendClient.deleteTeamGame(team, gameId);
                await loadGames();
                if (form.id === gameId) {
                  setForm(emptyForm(selectedDateKey));
                }
                toast.show({ type: "success", message: "Game deleted." });
              })
              .catch(() =>
                toast.show({ type: "error", message: "Unable to delete game." }),
              )
              .finally(() => setIsSaving(false));
          },
        },
      ]);
    },
    [ensureTeam, form.id, loadGames, selectedDateKey, toast],
  );

  return {
    form,
    setForm,
    isFormOpen,
    isSaving,
    formError,
    openCreateForDate,
    startEditingGame,
    closeForm,
    saveGame,
    deleteGame,
  };
};
