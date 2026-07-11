import { Player } from "../../types/lineup";
import { parsePositions } from "../../utils/lineupGenerator";
import { supabase } from "../supabase";
import { normalizePlayerName } from "../../utils/playerNames";
import {
  BackendAuthEvent,
  BackendAuthResponse,
  BackendClient,
  BackendGame,
  BackendLineupRequest,
  BackendSession,
} from "./types";
import { hasHttpStatus, toError } from "./utils";

const EDGE_FUNCTION_NAME = "quick-worker";
const EDGE_FUNCTION_URL = `${
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""
}/functions/v1/${EDGE_FUNCTION_NAME}`;
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  "";

const isUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );

const mapSession = (session: any): BackendSession | null => {
  if (!session?.access_token || !session?.user?.id) return null;

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? null,
    expiresAt: session.expires_at ?? null,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
    },
  };
};

const mapAuthResponse = (data: any, error: any): BackendAuthResponse => ({
  data: {
    session: mapSession(data?.session),
  },
  error: error ? toError(error) : null,
});

const getFreshAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw toError(error ?? "Your session is invalid. Please sign in again.");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = data.session.expires_at ?? 0;
  const expiresSoon = expiresAt > 0 && expiresAt - now < 60;

  if (!expiresSoon) {
    return data.session.access_token;
  }

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session?.access_token) {
    throw toError(refreshed.error ?? "Unable to refresh your session.");
  }

  return refreshed.data.session.access_token;
};

const invokeEdgeFunction = async (
  accessToken: string,
  payload: BackendLineupRequest,
) => {
  if (!EDGE_FUNCTION_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase Edge Function configuration");
  }

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let parsed: unknown = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      parsed = raw;
    }
  }

  if (!res.ok) {
    const error = new Error("Edge Function returned a non-2xx status code");
    (error as { context?: unknown }).context = {
      status: res.status,
      statusText: res.statusText,
      body: parsed,
    };
    throw error;
  }

  return parsed;
};

const toRoster = (rows: any[]): Player[] =>
  rows.map((row: any) => ({
    id: row.players.id,
    name: row.players.name ?? "",
    gender: row.players.gender ?? "male",
    desiredPositions: parsePositions(row.players.desired_positions ?? []),
    fixedAllGame: false,
    lockInPosition: !!row.players.lock_in_position,
  }));

const toGames = (rows: any[]): BackendGame[] =>
  rows.map((row: any) => ({
    id: row.id,
    title: row.title ?? "",
    opponentName: row.opponent_name ?? "",
    scheduledAt: row.scheduled_at ?? new Date().toISOString(),
    location: row.location ?? "",
    homeAway: row.home_away ?? "home",
    status: row.status ?? "scheduled",
    ourScore:
      typeof row.our_score === "number" && Number.isFinite(row.our_score)
        ? row.our_score
        : null,
    opponentScore:
      typeof row.opponent_score === "number" && Number.isFinite(row.opponent_score)
        ? row.opponent_score
        : null,
    competition: row.competition ?? "",
    season: row.season ?? "",
    notes: row.notes ?? "",
    isLeagueGame: !!row.is_league_game,
    isPlayoff: !!row.is_playoff,
  }));

export const supabaseBackendClient: BackendClient = {
  provider: "supabase",
  auth: {
    signInWithPassword: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return mapAuthResponse(data, error);
    },
    signUp: async ({ email, password, options }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options,
      });
      return mapAuthResponse(data, error);
    },
    verifyEmail: async () =>
      mapAuthResponse(
        null,
        new Error(
          "Verification code flow is only available with the FastAPI backend.",
        ),
      ),
    resendVerification: async () => ({
      error: new Error(
        "Verification code flow is only available with the FastAPI backend.",
      ),
    }),
    signOut: async (options) => {
      const { error } = await supabase.auth.signOut(options);
      return { error: error ? toError(error) : null };
    },
    getSession: async () => {
      const { data, error } = await supabase.auth.getSession();
      return mapAuthResponse(data, error);
    },
    refreshSession: async () => {
      const { data, error } = await supabase.auth.refreshSession();
      return mapAuthResponse(data, error);
    },
    onAuthStateChange: (callback) => {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event as BackendAuthEvent, mapSession(session));
      });

      return {
        data: {
          subscription: {
            unsubscribe: () => data.subscription.unsubscribe(),
          },
        },
      };
    },
  },
  getOrCreateTeam: async (userId: string) => {
    const { data, error } = await supabase
      .from("teams")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      throw toError(error);
    }

    if (data?.id) {
      return data.id;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("teams")
      .insert({ name: "My Team", user_id: userId })
      .select("id")
      .single();

    if (insertError) {
      throw toError(insertError);
    }

    return inserted.id;
  },
  getTeamRules: async (teamId: string) => {
    const { data, error } = await supabase
      .from("team_rules")
      .select("rule_text")
      .eq("team_id", teamId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw toError(error);
    }

    return data?.rule_text ?? null;
  },
  upsertTeamRules: async (teamId: string, ruleText: string) => {
    const { error } = await supabase
      .from("team_rules")
      .upsert({ team_id: teamId, rule_text: ruleText }, { onConflict: "team_id" });

    if (error) {
      throw toError(error);
    }
  },
  getTeamRoster: async (teamId: string) => {
    const { data, error } = await supabase
      .from("team_players")
      .select(
        `
          player_id,
          players:player_id (
            id,
            name,
            gender,
            desired_positions,
            fixed_all_game,
            lock_in_position
          )
        `,
      )
      .eq("team_id", teamId);

    if (error) {
      throw toError(error);
    }

    return toRoster(data ?? []);
  },
  saveTeamPlayer: async (teamId: string, player: Player) => {
    const normalizedIncomingName = normalizePlayerName(player.name);
    if (!normalizedIncomingName) {
      throw new Error("Player name is required.");
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("team_players")
      .select(
        `
          player_id,
          players:player_id (
            id,
            name
          )
        `,
      )
      .eq("team_id", teamId);

    if (existingError) {
      throw toError(existingError);
    }

    const existingMatch = (existingRows ?? []).find((row: any) => {
      const existingName = normalizePlayerName(row?.players?.name ?? "");
      if (!existingName) return false;
      if (existingName !== normalizedIncomingName) return false;
      if (isUuid(player.id) && row?.player_id === player.id) return false;
      return true;
    });

    const payload: Record<string, unknown> = {
      name: player.name.trim(),
      gender: player.gender,
      desired_positions: player.desiredPositions,
      fixed_all_game: false,
      lock_in_position: player.lockInPosition,
    };

    if (existingMatch?.player_id) {
      payload.id = existingMatch.player_id;
    } else if (isUuid(player.id)) {
      payload.id = player.id;
    }

    const { data: upserted, error: upsertError } = await supabase
      .from("players")
      .upsert(payload)
      .select("id")
      .single();

    if (upsertError) {
      throw toError(upsertError);
    }

    const id = upserted?.id ?? player.id;

    const { error: joinError } = await supabase
      .from("team_players")
      .upsert({ team_id: teamId, player_id: id });

    if (joinError) {
      throw toError(joinError);
    }

    return { id };
  },
  deleteTeamPlayer: async (teamId: string, playerId: string) => {
    const { error: joinError } = await supabase
      .from("team_players")
      .delete()
      .eq("team_id", teamId)
      .eq("player_id", playerId);

    if (joinError) {
      throw toError(joinError);
    }

    // Remove the underlying player only if no other team still references it.
    const { data: remainingLinks, error: remainingError } = await supabase
      .from("team_players")
      .select("team_id")
      .eq("player_id", playerId)
      .limit(1);

    if (remainingError) {
      throw toError(remainingError);
    }

    if (!remainingLinks || remainingLinks.length === 0) {
      const { error: playerError } = await supabase
        .from("players")
        .delete()
        .eq("id", playerId);

      if (playerError) {
        throw toError(playerError);
      }
    }
  },
  getTeamGames: async (teamId: string) => {
    const { data, error } = await supabase
      .from("team_games")
      .select("*")
      .eq("team_id", teamId)
      .order("scheduled_at", { ascending: true });

    if (error) {
      throw toError(error);
    }

    return toGames(data ?? []);
  },
  saveTeamGame: async (teamId: string, game: BackendGame) => {
    const payload: Record<string, unknown> = {
      team_id: teamId,
      title: game.title,
      opponent_name: game.opponentName,
      scheduled_at: game.scheduledAt,
      location: game.location,
      home_away: game.homeAway,
      status: game.status,
      our_score: game.ourScore,
      opponent_score: game.opponentScore,
      competition: game.competition,
      season: game.season,
      notes: game.notes,
      is_league_game: game.isLeagueGame,
      is_playoff: game.isPlayoff,
    };

    if (game.id) {
      payload.id = game.id;
    }

    const { data, error } = await supabase
      .from("team_games")
      .upsert(payload)
      .select("id")
      .single();

    if (error) {
      throw toError(error);
    }

    return { id: data.id };
  },
  deleteTeamGame: async (_teamId: string, gameId: string) => {
    const { error } = await supabase.from("team_games").delete().eq("id", gameId);

    if (error) {
      throw toError(error);
    }
  },
  generateLineup: async (payload: BackendLineupRequest) => {
    let accessToken = await getFreshAccessToken();

    try {
      return await invokeEdgeFunction(accessToken, payload);
    } catch (err) {
      if (!hasHttpStatus(err, 401)) {
        throw err;
      }

      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session?.access_token) {
        throw toError(refreshed.error ?? "Unable to refresh your session.");
      }

      accessToken = refreshed.data.session.access_token;
      return invokeEdgeFunction(accessToken, payload);
    }
  },
  saveLineupVersion: async (_payload) => {
    throw new Error("Lineup history is currently available only with the FastAPI backend.");
  },
  getLineupVersions: async (_teamId: string, _gameId?: string | null) => {
    throw new Error("Lineup history is currently available only with the FastAPI backend.");
  },
  getLineupVersion: async (_teamId: string, _lineupId: string) => {
    throw new Error("Lineup history is currently available only with the FastAPI backend.");
  },
  deleteLineupVersion: async (_teamId: string, _lineupId: string) => {
    throw new Error("Lineup history is currently available only with the FastAPI backend.");
  },
  exportLineupVersion: async (
    _teamId: string,
    _lineupId: string,
    _format: "xlsx" | "pdf",
  ) => {
    throw new Error("Lineup export is currently available only with the FastAPI backend.");
  },
  verifySubscription: async () => {
    throw new Error("Subscription verification is currently available only with the FastAPI backend.");
  },
  getSubscriptionStatus: async () => {
    throw new Error("Subscription status is currently available only with the FastAPI backend.");
  },
};
