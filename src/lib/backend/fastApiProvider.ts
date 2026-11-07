import { clearPendingRosterImport, validateImportPreview } from "../../utils/rosterImport";
import type { ImportPreview, ImportCommitResult } from "../../utils/rosterImport";
import { parseBlocks, parseReportAcknowledgement, parseReports, parseReviewQueue, parseReviewRevision } from "../moderation/parsers";
import { invalidatePublicContent } from "../moderation/events";
import { assertPaidAccess, capturePaidAccess, requirePaidAccess } from "../access/paidAccess";
import { parsePrivacyState } from "../privacy/contracts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearPersistedSubscription, clearPendingPurchasesForAccount } from "../iap/persistence";
import { clearRosterWrites, writeRoster, waitForRosterWrites } from "./rosterWrites";
import { secureStorage } from "../secureStorage";
import { trace, TRACE_ENABLED } from "./trace";
import {
  API_REQUEST_TIMEOUT_MS, SUBSCRIPTION_VERIFY_TIMEOUT_MS,
  RequestTransportError, runWithRequestDeadline, throwIfRequestAborted,
} from "./requestTransport";
import Constants from "expo-constants";
import { NativeModules } from "react-native";
import { Player } from "../../types/lineup";
import { LeagueDetail, RulesetPayload, TeamRulesState } from "../../types/rules";
import { parsePositions } from "../../utils/lineupGenerator";
import {
  BackendAuthEvent,
  BackendAuthResponse,
  BackendClient,
  BackendCreateLeagueInput,
  BackendTeamRulesInput,
  BackendSaveLineupRequest,
  BackendLineupExport,
  BackendLineupVersionDetail,
  BackendLineupVersionSummary,
  BackendGame,
  BackendLineupRequest,
  BackendSession,
  BackendSubscriptionStatus,
  BackendAdminAccount,
  BackendVerifySubscriptionRequest,
} from "./types";
import { cachedRead, clearReads, invalidateReads } from "./cache";
import { mapLeagueSummary, mapRulesetStatus } from "./leagueMappers";
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
let sessionEpoch = 0;
let deletingAccount = false;
let sessionWrite: Promise<void> = Promise.resolve();
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
  if (TRACE_ENABLED) trace(`session ${event}`, { event, signedIn: session !== null });
  if (event !== "TOKEN_REFRESHED") sessionEpoch += 1;
  cachedSession = session;
  clearReads();
  if (session === null) clearRosterWrites();
  sessionWrite = sessionWrite.catch(() => {}).then(async () => {
    if (session) {
      await secureStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      await secureStorage.removeItem(SESSION_STORAGE_KEY);
    }
  });
  try {
    await sessionWrite;
  } finally {
    emit(event, cachedSession);
  }
};

const assertBaseUrl = () => {
  if (!FASTAPI_BASE_URL_CANDIDATES.length) {
    throw new Error(
      "Missing EXPO_PUBLIC_FASTAPI_BASE_URL for fastapi backend provider.",
    );
  }
};

const parseJson = async (res: Response, signal: AbortSignal): Promise<unknown> => {
  let raw: string;
  try {
    raw = await res.text();
  } catch (_error) {
    throwIfRequestAborted(signal);
    throw new RequestTransportError("NETWORK_ERROR");
  }
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_err) {
    return raw;
  }
};

// Compatibility budgets pending measured server/provider latency. These bound
// client progress; they do not prove the server cancelled already-started work.
const requestTimeoutMs = (path: string, method = "GET"): number => {
  if (method === "GET" || method === "HEAD") return API_REQUEST_TIMEOUT_MS;
  if (path === "/subscriptions/verify") return SUBSCRIPTION_VERIFY_TIMEOUT_MS;
  if (method === "POST" && (path === "/lineups/generate" || path === "/lineups/save" || /^\/teams\/[^/]+\/roster-import\/preview$/.test(path))) return 90_000;
  if (path === "/leagues" || /^\/teams\/[^/]+\/rules$/.test(path) || /^\/admin\/change-requests\/[^/]+\/resolve$/.test(path)) return 390_000;
  return API_REQUEST_TIMEOUT_MS;
};

const requestJsonWithinDeadline = async (
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
  signal: AbortSignal,
) => {
  assertBaseUrl();
  const method = init.method ?? "GET";
  const canProbeHosts = method === "GET" || method === "HEAD";
  for (const baseUrl of FASTAPI_BASE_URL_CANDIDATES) {
    throwIfRequestAborted(signal);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
    } catch (_error) {
      throwIfRequestAborted(signal);
      if (!canProbeHosts) throw new RequestTransportError("NETWORK_ERROR");
      continue;
    }
    throwIfRequestAborted(signal);
    if (!res.ok) {
      const apiError = await toApiError(res, fallbackErrorMessage, signal);
      throwIfRequestAborted(signal);
      if (TRACE_ENABLED) trace("response", { status: res.status });
      throw apiError;
    }
    const parsed = await parseJson(res, signal);
    throwIfRequestAborted(signal);
    if (TRACE_ENABLED) trace("response", { status: res.status });
    return parsed;
  }
  throw new RequestTransportError("NETWORK_ERROR");
};

const requestJson = (
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
) => runWithRequestDeadline(
  requestTimeoutMs(path, init.method),
  signal => requestJsonWithinDeadline(path, init, fallbackErrorMessage, signal),
  init.signal ?? undefined,
);

const authedRequest = async (
  path: string,
  init: RequestInit,
  fallbackErrorMessage: string,
) => runWithRequestDeadline(requestTimeoutMs(path, init.method), async (signal) => {
  await ensureLoaded();
  throwIfRequestAborted(signal);
  if (deletingAccount && path !== "/auth/account") {
    throw new Error("Account deletion is in progress.");
  }
  const requestEpoch = sessionEpoch;

  if (!cachedSession?.accessToken) {
    throw new Error("You are not signed in.");
  }

  const run = async (token: string) => {
    const result = await requestJsonWithinDeadline(
      path,
      {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      },
      fallbackErrorMessage,
      signal,
    );
    // A committed deletion still needs its original account's local cleanup.
    const deletionAcknowledgement = path === "/auth/account" && init.method === "DELETE";
    if (requestEpoch !== sessionEpoch && !deletionAcknowledgement) {
      throw new Error("Account changed. Please try again.");
    }
    return result;
  };

  try {
    return await run(cachedSession.accessToken);
  } catch (err) {
    if (requestEpoch !== sessionEpoch || !hasHttpStatus(err, 401) || !cachedSession?.refreshToken) {
      throw err;
    }

    const refreshed = await fastApiBackendClient.auth.refreshSession();
    throwIfRequestAborted(signal);
    if (requestEpoch !== sessionEpoch) throw new Error("Account changed. Please try again.");
    if (refreshed.error || !refreshed.data.session?.accessToken) {
      throw refreshed.error ?? new Error("Unable to refresh session.");
    }

    return run(refreshed.data.session.accessToken);
  }
}, init.signal ?? undefined);

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
  await ensureLoaded();
  const requestEpoch = sessionEpoch;
  try {
    if (deletingAccount) throw new Error("Account deletion is in progress.");
    const parsed = (await requestJson(
      path,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      fallbackErrorMessage,
    )) as FastApiAuthPayload | null;

    if (deletingAccount) throw new Error("Account deletion is in progress.");
    if (requestEpoch !== sessionEpoch) throw new Error("Account changed. Please try again.");
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
  benched: !!raw.benched,
});

const mapGame = (raw: any): BackendGame => ({
  id: raw.id,
  title: raw.title ?? "",
  opponentName: raw.opponentName ?? "",
  scheduledAt: raw.scheduledAt ?? new Date().toISOString(),
  location: raw.location ?? "",
  // Legacy games may still hold "neutral"; fold anything non-away into home.
  homeAway: raw.homeAway === "away" ? "away" : "home",
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
  rulesContext: raw.rulesContext,
  rulesSpec: raw.rulesSpec,
  rows: Array.isArray(raw?.rows) ? raw.rows : [],
  output: raw?.output && typeof raw.output === "object" ? raw.output : {},
});

const mapLineupExport = (raw: any): BackendLineupExport => ({
  fileName: typeof raw?.fileName === "string" ? raw.fileName : "lineup-export",
  mimeType: typeof raw?.mimeType === "string" ? raw.mimeType : "application/octet-stream",
  base64Data: typeof raw?.base64Data === "string" ? raw.base64Data : "",
});

const mapRuleset = (raw: any): RulesetPayload => {
  if (!raw?.id || !raw?.spec) {
    throw new Error("Ruleset payload is missing id or spec.");
  }
  return {
    id: String(raw.id),
    context: raw.context,
    submissionId: raw.submissionId,
    publicationRevisionId: raw.publicationRevisionId,
    proseStatus: raw.proseStatus,
    sport: typeof raw.sport === "string" ? raw.sport : "",
    status: mapRulesetStatus(raw.status),
    engineCompatible: !!raw.engineCompatible,
    spec: raw.spec,
    rulesText: typeof raw.rulesText === "string" ? raw.rulesText : "",
    unexpressedRules: Array.isArray(raw.unexpressedRules)
      ? raw.unexpressedRules.filter((rule: unknown) => typeof rule === "string")
      : [],
    summaryRules: Array.isArray(raw.summaryRules)
      ? raw.summaryRules.filter((rule: unknown) => typeof rule === "string")
      : [],
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    activatedAt: typeof raw.activatedAt === "string" ? raw.activatedAt : null,
  };
};

const mapLeagueDetail = (raw: any): LeagueDetail => ({
  ...mapLeagueSummary(raw),
  description: typeof raw?.description === "string" ? raw.description : null,
  rulesText: typeof raw?.rulesText === "string" ? raw.rulesText : "",
  ruleset: mapRuleset(raw?.ruleset),
  createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  joined: !!raw?.joined,
});

const mapTeamRules = (raw: any): TeamRulesState => ({
  ruleset: raw?.ruleset ? mapRuleset(raw.ruleset) : null,
  league: raw?.league ? mapLeagueSummary(raw.league) : null,
  coachPreferences: typeof raw?.coachPreferences === "string" ? raw.coachPreferences : "",
  rulesText: typeof raw?.rulesText === "string" ? raw.rulesText : null,
});

const mapSubscriptionStatus = (raw: unknown): BackendSubscriptionStatus => {
  if (!raw || typeof raw !== "object") throw new Error("Invalid subscription status response.");
  const value = raw as Record<string, unknown>;
  if (
    typeof value.isPro !== "boolean" ||
    typeof value.isAdmin !== "boolean" ||
    typeof value.canManageAdmins !== "boolean" ||
    (value.productId !== null && typeof value.productId !== "string") ||
    (value.proAccess !== null && typeof value.proAccess !== "boolean") ||
    (value.status !== null && !["active", "grace", "expired", "cancelled", "billing_retry", "revoked"].includes(value.status as string)) ||
    (value.expiresAt !== null && (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)))) ||
    (value.accessUntil !== null && (typeof value.accessUntil !== "string" || !Number.isFinite(Date.parse(value.accessUntil))))
  ) {
    throw new Error("Invalid subscription status response.");
  }
  return {
    isPro: value.isPro,
    productId: value.productId as string | null,
    status: value.status as BackendSubscriptionStatus["status"],
    expiresAt: value.expiresAt as string | null,
    accessUntil: value.accessUntil as string | null,
    proAccess: value.proAccess as boolean | null,
    isAdmin: value.isAdmin,
    canManageAdmins: value.canManageAdmins,
  };
};

const withPaidAccess = async <T>(operation: () => Promise<T>): Promise<T> => {
  const access = requirePaidAccess();
  const result = await operation();
  assertPaidAccess(access);
  return result;
};

const withAccessEpoch = async <T>(operation: () => Promise<T>): Promise<T> => {
  const access = capturePaidAccess();
  const result = await operation();
  assertPaidAccess(access);
  return result;
};

const mapPage = <T>(raw: unknown, map: (item: any) => T): import("./pagination").Page<T> => {
  if (!raw || typeof raw !== "object") throw new Error("Invalid page response.");
  const page = raw as {items?: unknown; nextCursor?: unknown; hasMore?: unknown};
  if (!Array.isArray(page.items) || page.items.length > 100 || typeof page.hasMore !== "boolean" ||
      !(page.nextCursor === null || typeof page.nextCursor === "string") || page.hasMore !== (page.nextCursor !== null)) throw new Error("Invalid page response.");
  return {items: page.items.map(map), nextCursor: page.nextCursor as string | null, hasMore: page.hasMore};
};

export const fastApiBackendClient: BackendClient = {
  getTeamGamesPage: async ({teamId, from, to, cursor, limit}) => withPaidAccess(async () => {
    const query = new URLSearchParams({from, to});
    if (cursor) query.set("cursor", cursor); if (limit !== undefined) query.set("limit", String(limit));
    const raw = await authedRequest(`/teams/${teamId}/games/page?${query}`, {method: "GET"}, "Unable to load calendar page");
    return mapPage(raw, (item) => { if (!Number.isSafeInteger(item.lineupCount) || item.lineupCount < 0) throw new Error("Invalid game history count."); return {...mapGame(item), lineupCount: item.lineupCount}; });
  }),
  getLineupVersionsPage: async ({teamId, gameId, cursor, limit}) => withAccessEpoch(async () => {
    const query = new URLSearchParams();
    if (gameId !== undefined) query.set("gameId", gameId ?? "__none__");
    if (cursor) query.set("cursor", cursor); if (limit !== undefined) query.set("limit", String(limit));
    const raw = await authedRequest(`/teams/${teamId}/lineups/page?${query}`, {method: "GET"}, "Unable to load lineup history page");
    return mapPage(raw, mapLineupVersionSummary);
  }),

  reportLeague: async (leagueId, input) => parseReportAcknowledgement(await authedRequest(`/moderation/leagues/${leagueId}/reports`, {method: "POST", body: JSON.stringify(input)}, "Unable to report league")),
  blockLeaguePublisher: async (leagueId, revisionId) => { await authedRequest(`/moderation/leagues/${leagueId}/block`, {method: "POST", body: JSON.stringify({revisionId})}, "Unable to block publisher"); invalidatePublicContent(); },
  getPublisherBlocks: async () => parseBlocks(await authedRequest("/moderation/blocks", {method: "GET"}, "Unable to load blocked publishers")),
  unblockPublisher: async (targetId) => { await authedRequest(`/moderation/blocks/${targetId}`, {method: "DELETE"}, "Unable to unblock publisher"); invalidatePublicContent(); },
  getModerationReviewQueue: async () => parseReviewQueue(await authedRequest("/moderation/review", {method: "GET"}, "Unable to load publication review")),
  getModerationReports: async () => parseReports(await authedRequest("/moderation/reports", {method: "GET"}, "Unable to load content reports")),
  getModerationRevision: async (id) => parseReviewRevision(await authedRequest(`/moderation/revisions/${id}`, {method: "GET"}, "Unable to inspect publication")),
  reviewPublication: async (id, input) => { const result = await authedRequest(`/moderation/revisions/${id}/review`, {method: "POST", body: JSON.stringify(input)}, "Unable to review publication"); invalidatePublicContent(); return parseReviewRevision(result); },
  suspendLeaguePublisher: async (id, input) => { const result = await authedRequest(`/moderation/leagues/${id}/suspend`, {method: "POST", body: JSON.stringify(input)}, "Unable to suspend publisher"); invalidatePublicContent(); return result as {version: number; suspended: true}; },
  resolveContentReport: async (id, input) => { await authedRequest(`/moderation/reports/${id}/resolve`, {method: "POST", body: JSON.stringify(input)}, "Unable to resolve report"); },

  getPrivacyState: async () => parsePrivacyState(await authedRequest(
    "/privacy", { method: "GET" }, "Unable to load privacy settings",
  )),
  setAgeEligibility: async (input) => parsePrivacyState(await authedRequest(
    "/privacy/eligibility", { method: "PUT", body: JSON.stringify(input) }, "Unable to update age group",
  )),
  setAiConsent: async (input) => parsePrivacyState(await authedRequest(
    "/privacy/ai-consent", { method: "PUT", body: JSON.stringify(input) }, "Unable to update AI permission",
  )),
  provider: "fastapi",
  auth: {
    getSessionEpoch: () => sessionEpoch,
    signInWithPassword: async ({ email, password }) =>
      authWithSessionPayload(
        "/auth/signin",
        { email, password },
        "Failed to sign in",
        "SIGNED_IN",
      ),
    signUp: async ({ email, password, ageBand, policyVersion }) =>
      authWithSessionPayload(
        "/auth/signup",
        { email, password, ageBand, policyVersion },
        "Failed to sign up",
        "SIGNED_IN",
      ),
    verifyEmail: async ({ email, code, password }) =>
      authWithSessionPayload(
        "/auth/verify-email",
        { email, code, password },
        "Failed to verify email",
        "SIGNED_IN",
      ),
    resendVerification: async ({ email, password }) => {
      try {
        await requestJson(
          "/auth/resend-verification",
          {
            method: "POST",
            body: JSON.stringify({ email, password }),
          },
          "Failed to resend verification code",
        );
        return { error: null };
      } catch (err) {
        return { error: toError(err) };
      }
    },
    forgotPassword: async (input) => {
      try {
        await requestJson("/auth/forgot-password", { method: "POST", body: JSON.stringify(input) }, "Unable to send reset code");
        return { error: null };
      } catch (err) {
        return { error: toError(err) };
      }
    },
    resetPassword: async (input) => {
      try {
        await requestJson("/auth/reset-password", { method: "POST", body: JSON.stringify(input) }, "Unable to reset password");
        return { error: null };
      } catch (err) {
        return { error: toError(err) };
      }
    },
    deleteAccount: async (password) => {
      await ensureLoaded();
      if (deletingAccount) return { error: new Error("Account deletion is in progress."), cleanupError: null };
      if (!cachedSession) return { error: new Error("You are not signed in."), cleanupError: null };
      deletingAccount = true;
      const userId = cachedSession.user.id;
      const deletionEpoch = sessionEpoch;
      let deletedTeamIds: string[];
      try {
        const result = await runWithRequestDeadline(API_REQUEST_TIMEOUT_MS, async (signal) => {
          if (inFlightRefresh) await inFlightRefresh;
          throwIfRequestAborted(signal);
          if (shouldRefreshSession(cachedSession)) {
            const refreshed = await fastApiBackendClient.auth.refreshSession();
            if (refreshed.error) throw refreshed.error;
          }
          throwIfRequestAborted(signal);
          if (deletionEpoch !== sessionEpoch) throw new Error("Account changed. Please try again.");
          return await authedRequest(
            "/auth/account",
            { method: "DELETE", body: JSON.stringify({ password }), signal },
            "Unable to delete your account",
          ) as { ok: boolean; deletedTeamIds: string[] };
        });
        deletedTeamIds = result.deletedTeamIds;
      } catch (err) {
        deletingAccount = false;
        return { error: toError(err), cleanupError: null };
      }
      // Server deletion is committed. Attempt every local cleanup even if one
      // storage operation fails, and still invalidate the in-memory session.
      const results = await Promise.allSettled([
        ...(deletionEpoch === sessionEpoch ? [persistSession(null, "SIGNED_OUT")] : []),
        AsyncStorage.multiRemove([
          SESSION_STORAGE_KEY,
          `coachr_setup_wizard_v2.${userId}`,
          ...deletedTeamIds.map((id) => `coachr_ruleset_last_seen.${id}`),
        ]),
      ]);
      results.push(...await Promise.allSettled([
        clearPersistedSubscription(),
        clearPendingPurchasesForAccount(userId),
        clearPendingRosterImport(userId, {deleted: true}),
      ]));
      deletingAccount = false;
      const failed = results.find((result) => result.status === "rejected");
      return { error: null, cleanupError: failed?.status === "rejected" ? toError(failed.reason) : null };
    },
    signOut: async (options) => {
      await ensureLoaded();

      const revoked = cachedSession;

      // The local session is cleared first so signing out always succeeds.
      // Revoking the refresh token server-side is best effort: an unreachable
      // or failing backend must not strand the user in a signed-in app.
      await persistSession(null, "SIGNED_OUT");

      if (options?.scope === "local" || !revoked) {
        return { error: null };
      }

      try {
        await requestJson(
          "/auth/signout",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${revoked.accessToken}`,
            },
            body: JSON.stringify({
              refreshToken: revoked.refreshToken,
            }),
          },
          "Failed to sign out",
        );
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
      const refreshEpoch = sessionEpoch;

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

          if (refreshEpoch !== sessionEpoch) return buildAuthResponse(cachedSession);
          const session = parsed?.session ?? null;
          await persistSession(session, "TOKEN_REFRESHED");
          return buildAuthResponse(session);
        } catch (err) {
          // Only a rejected token means the session is truly dead. A network
          // failure (backend unreachable) must not wipe a valid session.
          if (refreshEpoch === sessionEpoch && hasHttpStatus(err, 401)) {
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
  getMyTeam: async () =>
    cachedRead("team", async () => {
      const payload = (await authedRequest(
        "/teams/me",
        { method: "GET" },
        "Unable to load team",
      )) as { id?: string; name?: string } | null;

      if (!payload?.id) {
        throw new Error("Team payload missing id.");
      }

      return { id: payload.id, name: payload.name?.trim() || "My Team" };
    }),
  getOrCreateTeam: async (_userId: string) => {
    const team = await fastApiBackendClient.getMyTeam();
    return team.id;
  },
  getTeamRules: async (teamId: string) =>
    cachedRead(`rules:${teamId}`, async () => {
      const payload = await authedRequest(
        `/teams/${teamId}/rules`,
        { method: "GET" },
        "Unable to load team rules",
      );

      return mapTeamRules(payload);
    }),
  upsertTeamRules: async (teamId: string, input: BackendTeamRulesInput) => {
    const payload = await authedRequest(
      `/teams/${teamId}/rules`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
      "Unable to save team rules",
    );

    invalidateReads(`rules:${teamId}`);
    return mapTeamRules(payload);
  },
  setTeamLeague: async (teamId: string, leagueId: string | null) => {
    const payload = await authedRequest(
      `/teams/${teamId}/league`,
      {
        method: "PUT",
        body: JSON.stringify({ leagueId }),
      },
      "Unable to update league membership",
    );

    invalidateReads(`rules:${teamId}`);
    return mapTeamRules(payload);
  },
  searchLeagues: async (query: string, sport?: string) => {
    const params = new URLSearchParams({ q: query });
    if (sport) params.set("sport", sport);
    const payload = (await authedRequest(
      `/leagues/search?${params.toString()}`,
      { method: "GET" },
      "Unable to search leagues",
    )) as { leagues?: any[] } | null;

    return (payload?.leagues ?? []).map(mapLeagueSummary);
  },
  createLeague: async (input: BackendCreateLeagueInput) => {
    const payload = await authedRequest(
      "/leagues",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      "Unable to create league",
    );

    return mapLeagueDetail(payload);
  },
  getLeague: async (leagueId: string) => {
    const payload = await authedRequest(
      `/leagues/${leagueId}`,
      { method: "GET" },
      "Unable to load league",
    );

    return mapLeagueDetail(payload);
  },
  createChangeRequest: async (leagueId: string, message: string) => {
    await authedRequest(
      `/leagues/${leagueId}/change-requests`,
      {
        method: "POST",
        body: JSON.stringify({ message }),
      },
      "Unable to send change request",
    );
  },
  getRuleset: async (rulesetId: string, context) => {
    const query = new URLSearchParams();
    if (context) { query.set("contextKind", context.kind); if (context.id) query.set("contextId", context.id); if (context.submissionId) query.set("submissionId", context.submissionId); }
    const payload = await authedRequest(
      `/rulesets/${rulesetId}${query.size ? `?${query}` : ""}`,
      { method: "GET" },
      "Unable to load ruleset status",
    );

    return mapRuleset(payload);
  },
  getTeamRoster: async (teamId: string, options) => {
    await waitForRosterWrites(teamId, options?.requireSaved === true);
    return cachedRead(`roster:${teamId}`, async () => {
      const payload = (await authedRequest(
        `/teams/${teamId}/players`,
        { method: "GET" },
        "Unable to load roster",
      )) as { players?: any[]; rulesContext?: string } | null;

      return (payload?.players ?? []).map((player) => ({...mapPlayer(player), rulesContext: payload?.rulesContext}));
    });
  },
  previewRosterImport: (teamId, payload, options) => withPaidAccess(async () => {
    const body = JSON.stringify(payload);
    if (body.length > 3 * 1024 * 1024) throw new Error("Roster file exceeds the import limit.");
    return validateImportPreview(await authedRequest(`/teams/${teamId}/roster-import/preview`,
      {method: "POST", body, signal: options?.signal}, "Unable to preview roster") as ImportPreview);
  }),
  commitRosterImport: (teamId, payload, options) => withPaidAccess(async () => {
    const result = await authedRequest(`/teams/${teamId}/roster-import/commit`,
      {method: "POST", body: JSON.stringify(payload), signal: options?.signal}, "Unable to import roster") as ImportCommitResult;
    if (!result || result.operationId !== payload.operationId || result.committed !== true || typeof result.replayed !== "boolean" ||
        !Array.isArray(result.createdPlayerIds) || result.createdPlayerIds.some(id => typeof id !== "string") ||
        !Number.isInteger(result.createdCount) || result.createdCount !== result.createdPlayerIds.length ||
        !Array.isArray(result.skippedSourceRows) || result.skippedSourceRows.some(row => !Number.isInteger(row) || row < 2 || row > 201)) {
      throw new Error("Roster import acknowledgement could not be read. Retry this import to confirm its result.");
    }
    invalidateReads(`roster:${teamId}`);
    return result;
  }),
  saveTeamPlayer: (teamId: string, player: Player, options) => writeRoster(teamId, player.id, async () => {
    const payload = (await authedRequest(
      `/teams/${teamId}/players`,
      {
        method: "POST",
        body: JSON.stringify({ player, rulesContext: options?.rulesContext ?? player.rulesContext }),
      },
      "Unable to save player",
    )) as { id?: string } | null;

    invalidateReads(`roster:${teamId}`);
    if (!payload?.id) {
      throw new Error("Save player response did not include an id.");
    }

    return { id: payload.id };
  }),
  deleteTeamPlayer: (teamId: string, playerId: string) => writeRoster(teamId, playerId, async () => {
    await authedRequest(
      `/teams/${teamId}/players/${playerId}`,
      { method: "DELETE" },
      "Unable to delete player",
    );
    invalidateReads(`roster:${teamId}`);
  }),
  getTeamGames: async (teamId: string) =>
    withPaidAccess(() => cachedRead(`games:${teamId}`, async () => {
      const payload = (await authedRequest(
        `/teams/${teamId}/games`,
        { method: "GET" },
        "Unable to load games",
      )) as { games?: any[] } | null;

      return (payload?.games ?? []).map(mapGame);
    })),
  saveTeamGame: async (teamId: string, game: BackendGame) => withPaidAccess(async () => {
    const payload = (await authedRequest(
      `/teams/${teamId}/games`,
      {
        method: "POST",
        body: JSON.stringify({ game }),
      },
      "Unable to save game",
    )) as { id?: string } | null;

    invalidateReads(`games:${teamId}`);
    invalidateReads(`lineups:${teamId}`);
    if (!payload?.id) {
      throw new Error("Save game response did not include an id.");
    }

    return { id: payload.id };
  }),
  deleteTeamGame: async (teamId: string, gameId: string) => {
    await authedRequest(
      `/teams/${teamId}/games/${gameId}`,
      { method: "DELETE" },
      "Unable to delete game",
    );
    invalidateReads(`games:${teamId}`);
    invalidateReads(`lineups:${teamId}`);
  },
  generateLineup: async (payload: BackendLineupRequest) => withAccessEpoch(async () => {
    const result = await authedRequest(
      "/lineups/generate",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      "Unable to generate lineup",
    );
    if (payload.saveLineup) invalidateReads(`lineups:${payload.teamId}`);
    return result;
  }),
  saveLineupVersion: async (payload: BackendSaveLineupRequest) => withAccessEpoch(async () => {
    const parsed = (await authedRequest(
      "/lineups/save",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      "Unable to save lineup version",
    )) as any;

    invalidateReads(`lineups:${payload.teamId}`);
    return mapLineupVersionSummary(parsed);
  }),
  getLineupVersions: async (teamId: string, gameId?: string | null) => {
    const query =
      gameId === undefined
        ? ""
        : `?gameId=${encodeURIComponent(gameId ?? "__none__")}`;
    return withAccessEpoch(() => cachedRead(`lineups:${teamId}:${query}`, async () => {
      const payload = (await authedRequest(
        `/teams/${teamId}/lineups${query}`,
        { method: "GET" },
        "Unable to load lineup history",
      )) as { lineups?: any[] } | null;

      return (payload?.lineups ?? []).map(mapLineupVersionSummary);
    }));
  },
  getLineupVersion: async (teamId: string, lineupId: string) =>
    withAccessEpoch(() => cachedRead(`lineup:${teamId}:${lineupId}`, async () => {
      const payload = (await authedRequest(
        `/teams/${teamId}/lineups/${lineupId}`,
        { method: "GET" },
        "Unable to load lineup version",
      )) as any;

      return mapLineupVersionDetail(payload);
    })),
  deleteLineupVersion: async (teamId: string, lineupId: string) => {
    await authedRequest(
      `/teams/${teamId}/lineups/${lineupId}`,
      { method: "DELETE" },
      "Unable to delete lineup",
    );
    invalidateReads(`lineups:${teamId}`);
    invalidateReads(`lineup:${teamId}:${lineupId}`);
  },
  exportLineupVersion: async (
    teamId: string,
    lineupId: string,
    format: "xlsx" | "pdf",
  ) => withPaidAccess(async () => {
    const payload = (await authedRequest(
      `/teams/${teamId}/lineups/${lineupId}/export?format=${format}`,
      { method: "GET" },
      "Unable to export lineup",
    )) as any;

    return mapLineupExport(payload);
  }),
  verifySubscription: async (body: BackendVerifySubscriptionRequest, options) => {
    const payload = (await authedRequest(
      "/subscriptions/verify",
      {
        method: "POST",
        body: JSON.stringify(body),
        signal: options?.signal,
      },
      "Unable to verify subscription",
    )) as any;

    const snapshot = mapSubscriptionStatus(payload);
    if (payload.acknowledgement?.state !== "committed" || payload.acknowledgement.transactionId !== body.transactionId) {
      throw new Error("Invalid subscription acknowledgement.");
    }
    invalidateReads("subscription");
    return { ...snapshot, acknowledgement: { transactionId: body.transactionId, state: "committed" } };
  },
  getSubscriptionAccountToken: async () => {
    const payload = await authedRequest("/subscriptions/account-token", { method: "GET" }, "Unable to prepare purchase") as any;
    if (typeof payload?.appAccountToken !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.appAccountToken)) {
      throw new Error("Invalid purchase account token.");
    }
    return { appAccountToken: payload.appAccountToken };
  },
  getSubscriptionStatus: async (options) => {
    const payload = await authedRequest(
      "/subscriptions/status", { method: "GET", signal: options?.signal }, "Unable to fetch subscription status",
    );
    return mapSubscriptionStatus(payload);
  },
  lookupAdminAccount: async (email) =>
    await authedRequest(
      `/admin/accounts/lookup?email=${encodeURIComponent(email)}`,
      { method: "GET" },
      "Unable to look up account",
    ) as BackendAdminAccount,
  grantAdminAccount: async (email) =>
    await authedRequest(
      "/admin/accounts/grant",
      { method: "POST", body: JSON.stringify({ email }) },
      "Unable to grant admin access",
    ) as BackendAdminAccount,
  revokeAdminAccount: async (email) =>
    await authedRequest(
      "/admin/accounts/revoke",
      { method: "POST", body: JSON.stringify({ email }) },
      "Unable to remove admin access",
    ) as BackendAdminAccount,
  listAdminAccounts: async () =>
    ((await authedRequest("/admin/accounts", { method: "GET" }, "Unable to load admins")) as { accounts: BackendAdminAccount[] })
      .accounts,
  searchAdminAccounts: async (query, options) =>
    ((await authedRequest(
      `/admin/accounts/search?q=${encodeURIComponent(query)}`,
      { method: "GET", signal: options?.signal },
      "Unable to search accounts",
    )) as { accounts: BackendAdminAccount[] }).accounts,
  setProAccess: async (enabled: boolean | null) => {
    const payload = (await authedRequest(
      "/subscriptions/pro-access",
      {
        method: "POST",
        body: JSON.stringify({ enabled }),
      },
      "Unable to update Pro access",
    )) as any;

    invalidateReads("subscription");
    return mapSubscriptionStatus(payload);
  },
};
