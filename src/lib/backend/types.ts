import { Player } from "../../types/lineup";

export type BackendProvider = "fastapi";

export type BackendAuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED";

export type BackendSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  user: {
    id: string;
    email: string | null;
  };
};

export type BackendAuthResponse = {
  data: {
    session: BackendSession | null;
  };
  error: Error | null;
};

export type BackendAuthSubscription = {
  unsubscribe: () => void;
};

export type BackendLineupPlayer = {
  id: string;
  name: string;
  gender: Player["gender"];
  desiredPositions: Player["desiredPositions"];
  fixedAllGame: boolean;
  lockInPosition: boolean;
};

export type BackendRulesConfig = {
  sport: string;
  segmentLabel: string;
  segmentCount: number;
  minimumPlayers: number;
  playersOnField: number;
  maxConsecutiveBench: number;
  lineupSlots: string[];
  customInstructions: string;
};

export type BackendLineupRequest = {
  teamId: string;
  sport: string;
  roster: BackendLineupPlayer[];
  gameId?: string | null;
  gameTitle?: string | null;
  saveLineup?: boolean;
  lineupName?: string | null;
  rulesConfig?: BackendRulesConfig;
};

export type BackendSaveLineupRequest = {
  teamId: string;
  sport: string;
  roster: BackendLineupPlayer[];
  gameId?: string | null;
  gameTitle?: string | null;
  lineupName: string;
  rows: Record<string, unknown>[];
  parentLineupId?: string | null;
  source?: "generated" | "manualSave" | "manualEdit" | null;
  rulesConfig?: BackendRulesConfig;
};

export type BackendLineupVersionSummary = {
  id: string;
  gameId: string | null;
  gameTitle: string;
  lineupName: string;
  sport: string;
  versionNumber: number;
  createdAt: string;
  segmentCount: number | null;
  source: "generated" | "manualSave" | "manualEdit";
  parentLineupId: string | null;
};

export type BackendLineupVersionDetail = BackendLineupVersionSummary & {
  rows: Record<string, unknown>[];
  output: Record<string, unknown>;
};

export type BackendLineupExport = {
  fileName: string;
  mimeType: string;
  base64Data: string;
};

export type BackendSubscriptionStatus = {
  isPro: boolean;
  productId: string | null;
  status: "active" | "expired" | "cancelled" | "billing_retry" | "revoked" | null;
  expiresAt: string | null;
  /** Admin Pro override flag on the user: true/false/null. */
  proAccess: boolean | null;
  /** Whether the signed-in user may set `proAccess` (server-authoritative admin). */
  isAdmin: boolean;
};

export type BackendVerifySubscriptionRequest = {
  productId: string;
  transactionId: string;
  originalTransactionId?: string | null;
  purchaseToken?: string;
  platform: "ios" | "android";
};

export type BackendGame = {
  id?: string;
  title: string;
  opponentName: string;
  scheduledAt: string;
  location: string;
  homeAway: "home" | "away";
  status: "scheduled" | "completed" | "cancelled" | "postponed";
  ourScore: number | null;
  opponentScore: number | null;
  competition: string;
  season: string;
  notes: string;
  isLeagueGame: boolean;
  isPlayoff: boolean;
};

export type BackendClient = {
  provider: BackendProvider;
  auth: {
    signInWithPassword: (input: {
      email: string;
      password: string;
    }) => Promise<BackendAuthResponse>;
    signUp: (input: {
      email: string;
      password: string;
    }) => Promise<BackendAuthResponse>;
    verifyEmail: (input: {
      email: string;
      code: string;
    }) => Promise<BackendAuthResponse>;
    resendVerification: (input: {
      email: string;
    }) => Promise<{ error: Error | null }>;
    signOut: (options?: {
      scope?: "global" | "local";
    }) => Promise<{ error: Error | null }>;
    getSession: () => Promise<BackendAuthResponse>;
    refreshSession: () => Promise<BackendAuthResponse>;
    onAuthStateChange: (
      callback: (event: BackendAuthEvent, session: BackendSession | null) => void,
    ) => { data: { subscription: BackendAuthSubscription } };
  };
  getOrCreateTeam: (userId: string) => Promise<string | null>;
  getTeamRules: (teamId: string) => Promise<string | null>;
  upsertTeamRules: (teamId: string, ruleText: string) => Promise<void>;
  getTeamRoster: (teamId: string) => Promise<Player[]>;
  saveTeamPlayer: (teamId: string, player: Player) => Promise<{ id: string }>;
  deleteTeamPlayer: (teamId: string, playerId: string) => Promise<void>;
  getTeamGames: (teamId: string) => Promise<BackendGame[]>;
  saveTeamGame: (teamId: string, game: BackendGame) => Promise<{ id: string }>;
  deleteTeamGame: (teamId: string, gameId: string) => Promise<void>;
  generateLineup: (payload: BackendLineupRequest) => Promise<unknown>;
  saveLineupVersion: (payload: BackendSaveLineupRequest) => Promise<BackendLineupVersionSummary>;
  getLineupVersions: (teamId: string, gameId?: string | null) => Promise<BackendLineupVersionSummary[]>;
  getLineupVersion: (teamId: string, lineupId: string) => Promise<BackendLineupVersionDetail>;
  deleteLineupVersion: (teamId: string, lineupId: string) => Promise<void>;
  exportLineupVersion: (
    teamId: string,
    lineupId: string,
    format: "xlsx" | "pdf",
  ) => Promise<BackendLineupExport>;
  verifySubscription: (
    payload: BackendVerifySubscriptionRequest,
  ) => Promise<BackendSubscriptionStatus>;
  getSubscriptionStatus: () => Promise<BackendSubscriptionStatus>;
  /** Admin-only: set the caller's Pro override flag (true/false/null). */
  setProAccess: (
    enabled: boolean | null,
  ) => Promise<BackendSubscriptionStatus>;
};
