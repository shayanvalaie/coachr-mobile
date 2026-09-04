// Rules now live in a shared ruleset spec (league or team). The client renders
// the spec and projects it onto the flat TeamRulesConfig shape the existing
// screens were built around.

export type TeamRulesConfig = {
  sport: string;
  segmentLabel: string;
  segmentCount: number;
  minimumPlayers: number;
  playersOnField: number;
  maxConsecutiveBench: number;
  lineupSlots: string[];
  customInstructions: string;
};

export const defaultTeamRulesConfig: TeamRulesConfig = {
  sport: "softball",
  segmentLabel: "inning",
  segmentCount: 7,
  minimumPlayers: 10,
  playersOnField: 10,
  maxConsecutiveBench: 1,
  lineupSlots: ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"],
  customInstructions: "",
};

export type RulesetStatus = "active" | "baking" | "review" | "rejected";

export type GenderMin = { gender: string; min: number };

export type SpecTierWhen = {
  gender: string;
  eq?: number;
  gte?: number;
  lte?: number;
};

export type SpecTier = {
  when: SpecTierWhen;
  dropSlots?: string[];
  slotGenders?: Record<string, string>;
  onFieldMin?: GenderMin[];
  playersOnField?: number;
};

export type RulesetSpec = {
  specVersion: number;
  sport: string;
  segment: { label: string; count: number };
  roster: { minPlayers: number; requirements?: GenderMin[] };
  field: { playersOnField: number; slots: string[] };
  bench: { maxConsecutive: number };
  tiers?: SpecTier[];
};

export type RulesetPayload = {
  id: string;
  sport: string;
  status: RulesetStatus;
  engineCompatible: boolean;
  spec: RulesetSpec;
  rulesText: string;
  unexpressedRules: string[];
  createdAt: string;
  activatedAt: string | null;
};

export type LeagueSummary = {
  id: string;
  name: string;
  sport: string;
  region: string | null;
  status: RulesetStatus;
  teamCount: number;
};

export type LeagueDetail = LeagueSummary & {
  description: string | null;
  rulesText: string;
  ruleset: RulesetPayload;
  createdAt: string;
  joined: boolean;
};

export type TeamRulesState = {
  ruleset: RulesetPayload | null;
  league: LeagueSummary | null;
  coachPreferences: string;
  // Leagueless teams only: the team's own rules text (the ruleset's source).
  rulesText: string | null;
};

export type ResolvedTier = {
  slots: string[];
  playersOnField: number;
  slotGenders: Record<string, string>;
  onFieldMin: GenderMin[];
  droppedSlots: string[];
};

const tierMatches = (when: SpecTierWhen, count: number): boolean => {
  if (when.eq !== undefined) return count === when.eq;
  if (when.gte !== undefined) return count >= when.gte;
  if (when.lte !== undefined) return count <= when.lte;
  return false;
};

// Mirrors the server's tier resolution: the first tier whose `when` matches
// the roster's count of that gender applies; otherwise the defaults do.
export const resolveSpecTier = (
  spec: RulesetSpec,
  players: Array<{ gender: string }>,
): ResolvedTier => {
  const counts = new Map<string, number>();
  players.forEach((player) => {
    const gender = player.gender.trim().toLowerCase();
    counts.set(gender, (counts.get(gender) ?? 0) + 1);
  });

  const tier = (spec.tiers ?? []).find((candidate) =>
    tierMatches(candidate.when, counts.get(candidate.when.gender) ?? 0),
  );
  if (!tier) {
    return {
      slots: [...spec.field.slots],
      playersOnField: spec.field.playersOnField,
      slotGenders: {},
      onFieldMin: [],
      droppedSlots: [],
    };
  }

  const dropped = new Set((tier.dropSlots ?? []).map((slot) => slot.toLowerCase()));
  const slots = spec.field.slots.filter((slot) => !dropped.has(slot.toLowerCase()));
  return {
    slots,
    playersOnField: slots.length,
    slotGenders: tier.slotGenders ?? {},
    onFieldMin: tier.onFieldMin ?? [],
    droppedSlots: tier.dropSlots ?? [],
  };
};

export const rulesConfigFromSpec = (
  spec: RulesetSpec,
  tier: ResolvedTier = resolveSpecTier(spec, []),
): TeamRulesConfig => ({
  sport: spec.sport,
  segmentLabel: spec.segment.label,
  segmentCount: spec.segment.count,
  minimumPlayers: spec.roster.minPlayers,
  playersOnField: tier.playersOnField,
  maxConsecutiveBench: spec.bench.maxConsecutive,
  lineupSlots: tier.slots,
  customInstructions: "",
});

// Flat projection for screens that only need counts and slot names. Falls back
// to the softball defaults when the team has no ruleset yet.
export const rulesConfigFromTeamRules = (
  state: TeamRulesState | null,
): TeamRulesConfig => {
  if (!state?.ruleset) return defaultTeamRulesConfig;
  return {
    ...rulesConfigFromSpec(state.ruleset.spec),
    customInstructions: state.coachPreferences,
  };
};

export const describeTierWhen = (when: SpecTierWhen): string => {
  const gender = when.gender === "female" ? "women" : when.gender === "male" ? "men" : when.gender;
  if (when.eq !== undefined) return `exactly ${when.eq} ${gender}`;
  if (when.gte !== undefined) return `${when.gte}+ ${gender}`;
  return `${when.lte ?? 0} or fewer ${gender}`;
};

export const describeGender = (gender: string, count: number): string => {
  if (gender === "female") return count === 1 ? "woman" : "women";
  if (gender === "male") return count === 1 ? "man" : "men";
  return gender;
};
