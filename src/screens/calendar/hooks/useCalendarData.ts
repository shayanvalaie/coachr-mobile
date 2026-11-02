import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assertPaidAccess, capturePaidAccess } from "../../../lib/access/paidAccess";
import { calendarMonthWindow, readAllPages } from "../../../lib/backend/pagination";
import { backendClient } from "../../../lib/backend/client";
import {
  BackendGame,
  BackendGamePageItem,
  BackendSession,
} from "../../../lib/backend/types";
import { useToast } from "../../../components/ui";
import { toDayKeyFromIso } from "../../../utils/calendarDates";
import { buildPlayerGenderByName } from "../../../utils/playerNames";

type Params = {
  session: BackendSession;
  selectedDateKey: string;
};

// Team context for the calendar: games, lineup version summaries, and the
// roster-derived player gender map used when rendering saved lineup grids.
export const useCalendarData = ({ session, selectedDateKey }: Params) => {
  const toast = useToast();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [games, setGames] = useState<BackendGamePageItem[]>([]);
  const [playerGenderByName, setPlayerGenderByName] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;
    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;
    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const requestEpoch = useRef(0);
  const [year, month] = selectedDateKey.split("-").map(Number);
  const window = useMemo(() => calendarMonthWindow(year, month - 1), [year, month]);

  const loadGames = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    const access = capturePaidAccess();
    setIsLoading(true);
    setLoadError(null);
    setGames([]);
    const assertCurrent = () => {
      assertPaidAccess(access);
      if (epoch !== requestEpoch.current) throw new Error("Calendar window changed");
    };
    try {
      const team = await ensureTeam();
      if (!team) return;
      assertCurrent();
      const [list, roster] = await Promise.all([
        readAllPages(cursor => backendClient.getTeamGamesPage({ teamId: team, ...window, cursor, limit: 100 }), assertCurrent),
        backendClient.getTeamRoster(team),
      ]);
      assertCurrent();
      setGames(list);
      setPlayerGenderByName(buildPlayerGenderByName(roster));
    } catch (_err) {
      if (epoch === requestEpoch.current) setLoadError("Unable to load this calendar month. Try again.");
    } finally {
      if (epoch === requestEpoch.current) setIsLoading(false);
    }
  }, [ensureTeam, toast, window]);

  useEffect(() => {
    loadGames().catch(() => {
      toast.show({ type: "error", message: "Unable to load games." });
      setIsLoading(false);
    });
  }, [loadGames, toast]);

  const gamesByDay = useMemo(() => {
    const map = new Map<string, BackendGamePageItem[]>();
    for (const game of games) {
      const dayKey = toDayKeyFromIso(game.scheduledAt);
      if (!dayKey) continue;
      const current = map.get(dayKey);
      if (current) current.push(game);
      else map.set(dayKey, [game]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
    }
    return map;
  }, [games]);

  return {
    ensureTeam,
    games,
    gamesByDay,
    playerGenderByName,
    isLoading,
    loadError,
    loadGames,
  };
};
