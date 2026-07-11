import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { backendClient } from "../../../lib/backend/client";
import { BackendGame, BackendSession } from "../../../lib/backend/types";
import { Player } from "../../../types/lineup";
import { parseTeamRulesConfig, TeamRulesConfig } from "../../../types/rules";
import { buildPlayerGenderByName } from "../../../utils/playerNames";

type Params = {
  session: BackendSession;
  setError: Dispatch<SetStateAction<string | null>>;
};

// Team context for the lineup screen: team id, roster, games, rules, and the
// active-player selection used for generation.
export const useLineupData = ({ session, setError }: Params) => {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [games, setGames] = useState<BackendGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [rulesConfig, setRulesConfig] = useState<TeamRulesConfig | null>(null);

  const ensureTeam = useCallback(async () => {
    if (teamId) return teamId;

    const nextTeamId = await backendClient.getOrCreateTeam(session.user.id);
    if (!nextTeamId) return null;

    setTeamId(nextTeamId);
    return nextTeamId;
  }, [session.user.id, teamId]);

  const loadTeamContext = useCallback(async () => {
    try {
      setError(null);
      const team = await ensureTeam();
      if (!team) return;

      const [loadedRoster, loadedRules, loadedGames] = await Promise.all([
        backendClient.getTeamRoster(team),
        backendClient.getTeamRules(team),
        backendClient.getTeamGames(team),
      ]);
      setRoster(loadedRoster);
      setActiveIds(new Set(loadedRoster.map((player) => player.id)));
      setRulesConfig(parseTeamRulesConfig(loadedRules));
      setGames(loadedGames);
      setSelectedGameId((prev) => {
        if (prev && loadedGames.some((game) => game.id === prev)) {
          return prev;
        }
        const nextUpcoming = [...loadedGames]
          .filter((game) => game.status === "scheduled")
          .sort(
            (a, b) =>
              new Date(a.scheduledAt).getTime() -
              new Date(b.scheduledAt).getTime(),
          )[0];
        return nextUpcoming?.id ?? null;
      });
    } catch (_err) {
      setError("Unable to load lineup context.");
    }
  }, [ensureTeam, setError]);

  useEffect(() => {
    loadTeamContext().catch(() => {
      setError("Unable to load lineup context.");
    });
  }, [loadTeamContext, setError]);

  const activePlayers = useMemo(
    () => roster.filter((player) => activeIds.has(player.id)),
    [roster, activeIds],
  );
  const playerGenderByName = useMemo(
    () => buildPlayerGenderByName(roster),
    [roster],
  );

  const handleToggleActive = useCallback((playerId: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  return {
    roster,
    games,
    selectedGameId,
    setSelectedGameId,
    activeIds,
    setActiveIds,
    rulesConfig,
    ensureTeam,
    activePlayers,
    playerGenderByName,
    handleToggleActive,
    selectedGame,
  };
};
