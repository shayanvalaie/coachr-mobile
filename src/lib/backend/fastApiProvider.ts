import { secureStorage } from "../secureStorage";
import Constants from "expo-constants";
import { NativeModules } from "react-native";
import { Player } from "../../types/lineup";
import { parsePositions } from "../../utils/lineupGenerator";
import {
  BackendAuthEvent,
  BackendAuthResponse,
  BackendClient,
  BackendSaveLineupRequest,
  BackendLineupExport,
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
  BackendGame,
  BackendLineupRequest,
  BackendSession,
  BackendSubscriptionStatus,
  BackendVerifySubscriptionRequest,
} from "./types";
import { hasHttpStatus, shouldRefreshSession, toApiError, toError } from "./utils";

const FASTAPI_BASE_URL = (process.env.EXPO_PUBLIC_FASTAPI_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
const SESSION_STORAGE_KEY = "coachr.fastapi.session";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const EXPO_TUNNEL_HOST_PATTERNS = [
  "exp.direct",
  "expo.dev",
  "expo.test",
  "u.expo.dev",
];

const parseHostFromValue = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).hostname || null;
  } catch (_err) {
    if (trimmed.includes(":")) {
      return trimmed.split(":")[0] ?? null;
    }
    return trimmed;
  }
};

const isExpoTunnelHost = (host: string) =>
  EXPO_TUNNEL_HOST_PATTERNS.some((pattern) => host.includes(pattern));

const collectExpoDevHostCandidates = (): string[] => {
  const rawCandidates: Array<string | null | undefined> = [
    (NativeModules as { SourceCode?: { scriptURL?: string } })?.SourceCode?.scriptURL,
    Constants.linkingUri,
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost,
    (Constants as unknown as { expoConfig?: { hostUri?: string } }).expoConfig?.hostUri,
    (
      Constants as unknown as {
        manifest2?: {
          extra?: {
            expoClient?: { hostUri?: string };
            expoGo?: { debuggerHost?: string };
          };
        } | null;
      }
    ).manifest2?.extra?.expoClient?.hostUri,
    (
      Constants as unknown as {
        manifest2?: {
          extra?: {
            expoGo?: { debuggerHost?: string };
          };
        } | null;
      }
    ).manifest2?.extra?.expoGo?.debuggerHost,
  ];

  const seen = new Set<string>();
  const hosts: string[] = [];

  rawCandidates.forEach((candidate) => {
    if (!candidate) return;
    const host = parseHostFromValue(candidate);
    if (!host) return;
    if (LOCAL_HOSTNAMES.has(host)) return;
    if (isExpoTunnelHost(host)) return;
    if (seen.has(host)) return;
    seen.add(host);
    hosts.push(host);
  });

  return hosts;
};

const buildFastApiBaseUrlCandidates = (): string[] => {
  const raw = FASTAPI_BASE_URL;
  if (!raw) return [];

  try {
    const url = new URL(raw);
    if (!__DEV__ || !LOCAL_HOSTNAMES.has(url.hostname)) {
      return [raw];
    }

    const hosts = collectExpoDevHostCandidates();
    if (!hosts.length) {
      return [raw];
    }

    const rewritten = hosts.map((host) => {
      const candidate = new URL(raw);
      candidate.hostname = host;
      return candidate.toString().replace(/\/$/, "");
    });

    const candidates = [...new Set([...rewritten, raw])];
    if (__DEV__) console.log(`[backend] FASTAPI URL candidates: ${candidates.join(" | ")}`);
    return candidates;
  } catch (_err) {
    return [raw];
  }
};

const FASTAPI_BASE_URL_CANDIDATES = buildFastApiBaseUrlCandidates();

type FastApiAuthPayload = {
  session?: BackendSession;
};

const listeners = new Set<
  (event: BackendAuthEvent, session: BackendSession | null) => void
>();

let cachedSession: BackendSession | null = null;
// Single-flight guard: dedupes concurrent /auth/refresh calls. Because the
// backend rotates (revokes) the refresh token on every refresh, two concurrent
// refreshes would race — the first rotates the token, the second sends the now
// revoked token, 401s, and wipes the session (spurious sign-out on reload).
// All concurrent callers await the same in-flight promise instead.
let inFlightRefresh: Promise<BackendAuthResponse> | null = null;

// Single shared load promise: every caller awaits the same storage read.
// A plain boolean flag raced here — a second caller returned immediately
// while the read was still in flight, observing cachedSession === null and
// emitting INITIAL_SESSION with no session for a signed-in user.
let loadPromise: Promise<void> | null = null;

const ensureLoaded = (): Promise<void> => {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await secureStorage.getItem(SESSION_STORAGE_KEY);
        cachedSession = raw ? (JSON.parse(raw) as BackendSession) : null;
      } catch (_err) {
        cachedSession = null;
      }
    })();
  }
  return loadPromise;
};

const emit = (event: BackendAuthEvent, session: BackendSession | null) => {
  listeners.forEach((listener) => {
    try {
      listener(event, session);
    } catch (_err) {
      // Ignore individual callback failures.
    }
  });
};

const persistSession = async (
  session: BackendSession | null,
  event: BackendAuthEvent,
) => {
  cachedSession = session;

  if (session) {
    await secureStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    await secureStorage.removeItem(SESSION_STORAGE_KEY);
  }

  emit(event, session);
};

const assertBaseUrl = () => {
  if (!FASTAPI_BASE_URL_CANDIDATES.length) {
    throw new Error(
      "Missing EXPO_PUBLIC_FASTAPI_BASE_URL for fastapi backend provider.",
    );
  }
};

const parseJson = async (res: Response): Promise<unknown> => {
  const raw = await res.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_err) {
    return raw;
  }
};

const requestJson = async (
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
) => {
  assertBaseUrl();

  let lastNetworkError: unknown = null;
  for (const baseUrl of FASTAPI_BASE_URL_CANDIDATES) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

      if (!res.ok) {
        throw await toApiError(res, fallbackErrorMessage);
      }

      return parseJson(res);
    } catch (err) {
      const message = toError(err).message.toLowerCase();
      const networkFailed =
        err instanceof TypeError || message.includes("network request failed");

      if (!networkFailed) {
        throw err;
      }

      lastNetworkError = err;
      if (__DEV__) {
        console.log(`[backend] Network request failed for ${baseUrl}${path}`);
      }
    }
  }

  if (lastNetworkError) {
    const attempted = FASTAPI_BASE_URL_CANDIDATES.join(", ");
    throw new Error(
      `Network request failed. Tried base URLs: ${attempted}. ` +
        "If testing on iPhone, ensure backend runs with --host 0.0.0.0 and " +
        "EXPO_PUBLIC_FASTAPI_BASE_URL points to your Mac LAN IP (or keep localhost and let auto-rewrite resolve).",
    );
  }

  throw new Error(fallbackErrorMessage);
};

const authedRequest = async (
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
) => {
  await ensureLoaded();

  if (!cachedSession?.accessToken) {
    throw new Error("You are not signed in.");
  }

  const run = async (token: string) =>
    requestJson(
      path,
      {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      },
      fallbackErrorMessage,
    );

  try {
    return await run(cachedSession.accessToken);
  } catch (err) {
    if (!hasHttpStatus(err, 401) || !cachedSession.refreshToken) {
      throw err;
    }

    const refreshed = await fastApiBackendClient.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session?.accessToken) {
      throw refreshed.error ?? new Error("Unable to refresh session.");
    }

    return run(refreshed.data.session.accessToken);
  }
};

const buildAuthResponse = (session: BackendSession | null, error?: unknown): BackendAuthResponse => ({
  data: { session },
  error: error ? toError(error) : null,
});

const authWithSessionPayload = async (
  path: string,
  body: Record<string, unknown>,
  fallbackErrorMessage: string,
  event: BackendAuthEvent,
): Promise<BackendAuthResponse> => {
  try {
    const parsed = (await requestJson(
      path,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      fallbackErrorMessage,
    )) as FastApiAuthPayload | null;

    const session = parsed?.session ?? null;
    await persistSession(session, event);
    return buildAuthResponse(session);
  } catch (err) {
    return buildAuthResponse(null, err);
  }
};

const mapPlayer = (raw: any): Player => ({
  id: raw.id,
  name: raw.name ?? "",
  gender: raw.gender ?? "male",
  desiredPositions: parsePositions(raw.desiredPositions ?? []),
  fixedAllGame: false,
  lockInPosition: !!raw.lockInPosition,
});

const mapGame = (raw: any): BackendGame => ({
  id: raw.id,
  title: raw.title ?? "",
  opponentName: raw.opponentName ?? "",
  scheduledAt: raw.scheduledAt ?? new Date().toISOString(),
  location: raw.location ?? "",
  homeAway: raw.homeAway ?? "home",
  status: raw.status ?? "scheduled",
  ourScore:
    typeof raw.ourScore === "number" && Number.isFinite(raw.ourScore)
      ? raw.ourScore
      : null,
  opponentScore:
    typeof raw.opponentScore === "number" && Number.isFinite(raw.opponentScore)
      ? raw.opponentScore
      : null,
  competition: raw.competition ?? "",
  season: raw.season ?? "",
  notes: raw.notes ?? "",
  isLeagueGame: !!raw.isLeagueGame,
  isPlayoff: !!raw.isPlayoff,
});

const mapLineupVersionSummary = (raw: any): BackendLineupVersionSummary => ({
  id: String(raw?.id ?? ""),
  gameId: typeof raw?.gameId === "string" ? raw.gameId : null,
  gameTitle: typeof raw?.gameTitle === "string" ? raw.gameTitle : "",
  lineupName: typeof raw?.lineupName === "string" ? raw.lineupName : "",
  sport: typeof raw?.sport === "string" ? raw.sport : "softball",
  versionNumber:
    typeof raw?.versionNumber === "number" && Number.isFinite(raw.versionNumber)
      ? raw.versionNumber
      : 1,
  createdAt:
    typeof raw?.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  segmentCount:
    typeof raw?.segmentCount === "number" && Number.isFinite(raw.segmentCount)
      ? raw.segmentCount
      : null,
  source:
    raw?.source === "manualSave" || raw?.source === "manualEdit"
      ? raw.source
      : "generated",
  parentLineupId:
    typeof raw?.parentLineupId === "string" ? raw.parentLineupId : null,
});

const mapLineupVersionDetail = (raw: any): BackendLineupVersionDetail => ({
  ...mapLineupVersionSummary(raw),
  rows: Array.isArray(raw?.rows) ? raw.rows : [],
  output: raw?.output && typeof raw.output === "object" ? raw.output : {},
});

const mapLineupExport = (raw: any): BackendLineupExport => ({
  fileName: typeof raw?.fileName === "string" ? raw.fileName : "lineup-export",
  mimeType: typeof raw?.mimeType === "string" ? raw.mimeType : "application/octet-stream",
  base64Data: typeof raw?.base64Data === "string" ? raw.base64Data : "",
});

const mapSubscriptionStatus = (raw: any): BackendSubscriptionStatus => ({
  isPro: !!raw?.isPro,
  productId: typeof raw?.productId === "string" ? raw.productId : null,
  status: raw?.status ?? null,
  expiresAt: typeof raw?.expiresAt === "string" ? raw.expiresAt : null,
  proAccess: typeof raw?.proAccess === "boolean" ? raw.proAccess : null,
  isAdmin: !!raw?.isAdmin,
});

export const fastApiBackendClient: BackendClient = {
  provider: "fastapi",
  auth: {
    signInWithPassword: async ({ email, password }) =>
      authWithSessionPayload(
        "/auth/signin",
        { email, password },
        "Failed to sign in",
        "SIGNED_IN",
      ),
    signUp: async ({ email, password }) =>
      authWithSessionPayload(
        "/auth/signup",
        { email, password },
        "Failed to sign up",
        "SIGNED_IN",
      ),
    verifyEmail: async ({ email, code }) =>
      authWithSessionPayload(
        "/auth/verify-email",
        { email, code },
        "Failed to verify email",
        "SIGNED_IN",
      ),
    resendVerification: async ({ email }) => {
      try {
        await requestJson(
          "/auth/resend-verification",
          {
            method: "POST",
            body: JSON.stringify({ email }),
          },
          "Failed to resend verification code",
        );
        return { error: null };
      } catch (err) {
        return { error: toError(err) };
      }
    },
    signOut: async (options) => {
      await ensureLoaded();

      if (options?.scope === "local") {
        await persistSession(null, "SIGNED_OUT");
        return { error: null };
      }

      try {
        if (cachedSession?.accessToken) {
          await requestJson(
            "/auth/signout",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${cachedSession.accessToken}`,
              },
              body: JSON.stringify({
                refreshToken: cachedSession.refreshToken,
              }),
            },
            "Failed to sign out",
          );
        }

        await persistSession(null, "SIGNED_OUT");
        return { error: null };
      } catch (err) {
        return { error: toError(err) };
      }
    },
    getSession: async () => {
      await ensureLoaded();

      if (shouldRefreshSession(cachedSession) && cachedSession?.refreshToken) {
        const refreshed = await fastApiBackendClient.auth.refreshSession();
        if (!refreshed.error) {
          return refreshed;
        }
      }

      return buildAuthResponse(cachedSession);
    },
    refreshSession: async () => {
      await ensureLoaded();

      if (!cachedSession?.refreshToken) {
        return buildAuthResponse(null, new Error("No refresh token available."));
      }

      // Coalesce concurrent refreshes onto a single network call so the
      // rotating refresh token is only spent once.
      if (inFlightRefresh) return inFlightRefresh;

      const refreshToken = cachedSession.refreshToken;
      inFlightRefresh = (async () => {
        try {
          const parsed = (await requestJson(
            "/auth/refresh",
            {
              method: "POST",
              body: JSON.stringify({ refreshToken }),
            },
            "Failed to refresh session",
          )) as FastApiAuthPayload | null;

          const session = parsed?.session ?? null;
          await persistSession(session, "TOKEN_REFRESHED");
          return buildAuthResponse(session);
        } catch (err) {
          // Only a rejected token means the session is truly dead. A network
          // failure (backend unreachable) must not wipe a valid session.
          if (hasHttpStatus(err, 401)) {
            await persistSession(null, "SIGNED_OUT");
          }
          return buildAuthResponse(null, err);
        } finally {
          inFlightRefresh = null;
        }
      })();

      return inFlightRefresh;
    },
    onAuthStateChange: (callback) => {
      listeners.add(callback);

      ensureLoaded()
        .then(() => {
          callback("INITIAL_SESSION", cachedSession);
        })
        .catch(() => {
          callback("INITIAL_SESSION", null);
        });

      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(callback);
            },
          },
        },
      };
    },
  },
  getOrCreateTeam: async (_userId: string) => {
    const payload = (await authedRequest(
      "/teams/me",
      { method: "GET" },
      "Unable to load team",
    )) as { id?: string } | null;

    if (!payload?.id) {
      throw new Error("Team payload missing id.");
    }

    return payload.id;
  },
  getTeamRules: async (teamId: string) => {
    const payload = (await authedRequest(
      `/teams/${teamId}/rules`,
      { method: "GET" },
      "Unable to load team rules",
    )) as { ruleText?: string | null } | null;

    return payload?.ruleText ?? null;
  },
  upsertTeamRules: async (teamId: string, ruleText: string) => {
    await authedRequest(
      `/teams/${teamId}/rules`,
      {
        method: "PUT",
        body: JSON.stringify({ ruleText }),
      },
      "Unable to save team rules",
    );
  },
  getTeamRoster: async (teamId: string) => {
    const payload = (await authedRequest(
      `/teams/${teamId}/players`,
      { method: "GET" },
      "Unable to load roster",
    )) as { players?: any[] } | null;

    return (payload?.players ?? []).map(mapPlayer);
  },
  saveTeamPlayer: async (teamId: string, player: Player) => {
    const payload = (await authedRequest(
      `/teams/${teamId}/players`,
      {
        method: "POST",
        body: JSON.stringify({ player }),
      },
      "Unable to save player",
    )) as { id?: string } | null;

    if (!payload?.id) {
      throw new Error("Save player response did not include an id.");
    }

    return { id: payload.id };
  },
  deleteTeamPlayer: async (teamId: string, playerId: string) => {
    await authedRequest(
      `/teams/${teamId}/players/${playerId}`,
      { method: "DELETE" },
      "Unable to delete player",
    );
  },
  getTeamGames: async (teamId: string) => {
    const payload = (await authedRequest(
      `/teams/${teamId}/games`,
      { method: "GET" },
      "Unable to load games",
    )) as { games?: any[] } | null;

    return (payload?.games ?? []).map(mapGame);
  },
  saveTeamGame: async (teamId: string, game: BackendGame) => {
    const payload = (await authedRequest(
      `/teams/${teamId}/games`,
      {
        method: "POST",
        body: JSON.stringify({ game }),
      },
      "Unable to save game",
    )) as { id?: string } | null;

    if (!payload?.id) {
      throw new Error("Save game response did not include an id.");
    }

    return { id: payload.id };
  },
  deleteTeamGame: async (teamId: string, gameId: string) => {
    await authedRequest(
      `/teams/${teamId}/games/${gameId}`,
      { method: "DELETE" },
      "Unable to delete game",
    );
  },
  generateLineup: async (payload: BackendLineupRequest) =>
    authedRequest(
      "/lineups/generate",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      "Unable to generate lineup",
    ),
  saveLineupVersion: async (payload: BackendSaveLineupRequest) => {
    const parsed = (await authedRequest(
      "/lineups/save",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      "Unable to save lineup version",
    )) as any;

    return mapLineupVersionSummary(parsed);
  },
  getLineupVersions: async (teamId: string, gameId?: string | null) => {
    const query =
      gameId === undefined
        ? ""
        : `?gameId=${encodeURIComponent(gameId ?? "__none__")}`;
    const payload = (await authedRequest(
      `/teams/${teamId}/lineups${query}`,
      { method: "GET" },
      "Unable to load lineup history",
    )) as { lineups?: any[] } | null;

    return (payload?.lineups ?? []).map(mapLineupVersionSummary);
  },
  getLineupVersion: async (teamId: string, lineupId: string) => {
    const payload = (await authedRequest(
      `/teams/${teamId}/lineups/${lineupId}`,
      { method: "GET" },
      "Unable to load lineup version",
    )) as any;

    return mapLineupVersionDetail(payload);
  },
  deleteLineupVersion: async (teamId: string, lineupId: string) => {
    await authedRequest(
      `/teams/${teamId}/lineups/${lineupId}`,
      { method: "DELETE" },
      "Unable to delete lineup",
    );
  },
  exportLineupVersion: async (
    teamId: string,
    lineupId: string,
    format: "xlsx" | "pdf",
  ) => {
    const payload = (await authedRequest(
      `/teams/${teamId}/lineups/${lineupId}/export?format=${format}`,
      { method: "GET" },
      "Unable to export lineup",
    )) as any;

    return mapLineupExport(payload);
  },
  verifySubscription: async (body: BackendVerifySubscriptionRequest) => {
    const payload = (await authedRequest(
      "/subscriptions/verify",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      "Unable to verify subscription",
    )) as any;

    return mapSubscriptionStatus(payload);
  },
  getSubscriptionStatus: async () => {
    const payload = (await authedRequest(
      "/subscriptions/status",
      { method: "GET" },
      "Unable to fetch subscription status",
    )) as any;

    return mapSubscriptionStatus(payload);
  },
  setProAccess: async (enabled: boolean | null) => {
    const payload = (await authedRequest(
      "/subscriptions/pro-access",
      {
        method: "POST",
        body: JSON.stringify({ enabled }),
      },
      "Unable to update Pro access",
    )) as any;

    return mapSubscriptionStatus(payload);
  },
};
