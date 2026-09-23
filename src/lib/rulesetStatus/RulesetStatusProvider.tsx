import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useToast } from "../../components/ui";
import { navigateFromRef } from "../../navigation/navigationRef";
import { RulesetPayload, RulesetStatus } from "../../types/rules";
import { invalidateReads } from "../backend/cache";
import { backendClient } from "../backend/client";
import { BackendSession } from "../backend/types";

const LAST_SEEN_KEY_PREFIX = "coachr_ruleset_last_seen.";
const POLL_MS = 20_000;

type RulesetStatusValue = {
  rulesetId: string | null;
  // null until first load or when the team has no ruleset.
  status: RulesetStatus | null;
  // Bypasses the read cache.
  refresh: () => Promise<void>;
};

const RulesetStatusContext = createContext<RulesetStatusValue | null>(null);

export const useRulesetStatus = (): RulesetStatusValue => {
  const context = useContext(RulesetStatusContext);
  if (!context) {
    throw new Error("useRulesetStatus must be used inside RulesetStatusProvider");
  }
  return context;
};

type Snapshot = { rulesetId: string; status: RulesetStatus } | null;

const toSnapshot = (ruleset: RulesetPayload | null): Snapshot =>
  ruleset ? { rulesetId: ruleset.id, status: ruleset.status } : null;

const serialize = (snapshot: Snapshot) =>
  snapshot ? `${snapshot.rulesetId}:${snapshot.status}` : null;

const openLineupGenerator = () => {
  navigateFromRef("Main", {
    screen: "LineupTab",
    params: {
      launch: { id: Date.now(), gameId: null, autoGenerate: true },
    },
  });
};

// Owns the team's ruleset status for the whole signed-in session: polls while
// a ruleset is baking, feeds the global banner, and fires the one-time "ready"
// toast the first time a baking ruleset is observed active (persisted so a
// flip that happens while the app is closed is still announced once).
export const RulesetStatusProvider = ({
  session,
  children,
}: {
  session: BackendSession;
  children: ReactNode;
}) => {
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<Snapshot>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const teamIdRef = useRef<string | null>(null);

  // Last-seen "<rulesetId>:<status>" for the current team. undefined until
  // read from storage, so the first apply always compares against disk.
  const lastSeenRef = useRef<string | null | undefined>(undefined);
  const snapshotRef = useRef<Snapshot>(null);

  const applyRuleset = useCallback(
    async (team: string, ruleset: RulesetPayload | null) => {
      const next = toSnapshot(ruleset);
      const key = LAST_SEEN_KEY_PREFIX + team;
      if (lastSeenRef.current === undefined) {
        lastSeenRef.current = await AsyncStorage.getItem(key);
      }

      const previous = snapshotRef.current;
      if (serialize(previous) !== serialize(next)) {
        // Screens read rules through the cache; a status change observed here
        // must not be masked by a stale cached read on their next focus.
        invalidateReads(`rules:${team}`);
      }
      snapshotRef.current = next;
      setSnapshot(next);

      const becameReady =
        next !== null &&
        next.status === "active" &&
        lastSeenRef.current === `${next.rulesetId}:baking`;
      if (becameReady) {
        toast.show({
          message: "Your lineup engine is ready.",
          type: "success",
          actionLabel: "Generate a lineup",
          durationMs: 6000,
          onPress: openLineupGenerator,
        });
      }

      const serialized = serialize(next);
      lastSeenRef.current = serialized;
      if (serialized) {
        await AsyncStorage.setItem(key, serialized);
      } else {
        await AsyncStorage.removeItem(key);
      }
    },
    [toast],
  );

  const ensureTeam = useCallback(async () => {
    if (teamIdRef.current) return teamIdRef.current;
    const next = await backendClient.getOrCreateTeam(session.user.id);
    if (!next) return null;
    teamIdRef.current = next;
    return next;
  }, [session.user.id]);

  const loadRules = useCallback(
    async (bypassCache: boolean) => {
      try {
        const team = await ensureTeam();
        if (!team) return;
        if (bypassCache) invalidateReads(`rules:${team}`);
        const rules = await backendClient.getTeamRules(team);
        await applyRuleset(team, rules.ruleset);
      } catch (_err) {
        // Non-fatal: the next poll, foreground, or mutation refresh retries.
      }
    },
    [applyRuleset, ensureTeam],
  );

  const refresh = useCallback(() => loadRules(true), [loadRules]);

  // Initial load.
  useEffect(() => {
    void loadRules(false);
  }, [loadRules]);

  // Foreground: refresh once immediately; polling resumes via appActive.
  const appActiveRef = useRef(appActive);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      const wasActive = appActiveRef.current;
      appActiveRef.current = active;
      setAppActive(active);
      if (active && !wasActive) void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Poll the ruleset while it is baking and the app is in the foreground.
  useEffect(() => {
    if (!snapshot || snapshot.status !== "baking" || !appActive) return;
    const team = teamIdRef.current;
    if (!team) return;
    const rulesetId = snapshot.rulesetId;
    const timer = setInterval(() => {
      backendClient
        .getRuleset(rulesetId)
        .then((ruleset) => applyRuleset(team, ruleset))
        .catch(() => {
          // Transient failure: the next tick retries.
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [appActive, applyRuleset, snapshot]);

  const value = useMemo<RulesetStatusValue>(
    () => ({
      rulesetId: snapshot?.rulesetId ?? null,
      status: snapshot?.status ?? null,
      refresh,
    }),
    [refresh, snapshot],
  );

  return (
    <RulesetStatusContext.Provider value={value}>{children}</RulesetStatusContext.Provider>
  );
};
