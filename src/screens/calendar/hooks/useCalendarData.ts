import { useCallback, useEffect, useMemo, useState } from "react";
import { backendClient } from "../../../lib/backend/client";
import {
  BackendGame,
  BackendLineupVersionSummary,
  BackendSession,
} from "../../../lib/backend/types";
import { useToast } from "../../../components/ui";
import { toDayKeyFromIso } from "../../../utils/calendarDates";
import { buildPlayerGenderByName } from "../../../utils/playerNames";

type Params = {
  session: BackendSession;
};

// Team context for the calendar: games, lineup version summaries, and the
// roster-derived player gender map used when rendering saved lineup grids.
export const useCalendarData = ({ session }: Params) => {
  const toast = useToast();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [games, setGames] = useState<BackendGame[]>([]);
  const [lineupHistory, setLineupHistory] = useState<BackendLineupVersionSummary[]>([]);
  const [playerGenderByName, setPlayerGenderByName] = useState<
    Record<string, "male" | "female">
  >({});
  const [isLoading, setIsLoading] = useState(true);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;
    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;
    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadGames = useCallback(async () => {
    try {
      const team = await ensureTeam();
      if (!team) return;
      const [list, versions, roster] = await Promise.all([
        backendClient.getTeamGames(team),
        backendClient.getLineupVersions(team),
        backendClient.getTeamRoster(team).catch(() => null),
      ]);
      setGames(list);
      setLineupHistory(versions);
      setPlayerGenderByName(roster ? buildPlayerGenderByName(roster) : {});
    } catch (_err) {
      toast.show({ type: "error", message: "Unable to load games." });
    } finally {
      setIsLoading(false);
    }
  }, [ensureTeam, toast]);

  useEffect(() => {
    loadGames().catch(() => {
      toast.show({ type: "error", message: "Unable to load games." });
      setIsLoading(false);
    });
  }, [loadGames, toast]);

  const gamesByDay = useMemo(() => {
    const map = new Map<string, BackendGame[]>();
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

  const upcomingCount = useMemo(
    () =>
      games.filter((game) => {
        const when = new Date(game.scheduledAt).getTime();
        return Number.isFinite(when) && when >= Date.now();
      }).length,
    [games],
  );

  const lineupsByGameId = useMemo(() => {
    const grouped = new Map<string, BackendLineupVersionSummary[]>();
    lineupHistory.forEach((version) => {
      if (!version.gameId) return;
      const current = grouped.get(version.gameId);
      if (current) current.push(version);
      else grouped.set(version.gameId, [version]);
    });

    for (const list of grouped.values()) {
      list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return grouped;
  }, [lineupHistory]);

  return {
    ensureTeam,
    games,
    gamesByDay,
    upcomingCount,
    lineupsByGameId,
    playerGenderByName,
    isLoading,
    loadGames,
  };
};
