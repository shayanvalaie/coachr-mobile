import {
  LeagueMatchReason,
  LeagueSuggestion,
  LeagueSummary,
  RulesetStatus,
} from "../../types/rules";

// Shared by the provider (search / detail / team rules) and the 409 error
// parser in utils, so a suggestion is shaped exactly like a search result.

const RULESET_STATUSES: RulesetStatus[] = ["active", "baking", "review", "rejected"];

export const mapRulesetStatus = (raw: unknown): RulesetStatus =>
  RULESET_STATUSES.includes(raw as RulesetStatus) ? (raw as RulesetStatus) : "review";

const LEAGUE_MATCH_REASONS: LeagueMatchReason[] = ["zip", "size", "name"];

const isMatchReason = (value: unknown): value is LeagueMatchReason =>
  LEAGUE_MATCH_REASONS.includes(value as LeagueMatchReason);

export const mapLeagueSummary = (raw: any): LeagueSummary => ({
  id: String(raw?.id ?? ""),
  name: typeof raw?.name === "string" ? raw.name : "",
  sport: typeof raw?.sport === "string" ? raw.sport : "",
  region: typeof raw?.region === "string" ? raw.region : null,
  city: typeof raw?.city === "string" ? raw.city : null,
  state: typeof raw?.state === "string" ? raw.state : null,
  zip: typeof raw?.zip === "string" ? raw.zip : null,
  status: mapRulesetStatus(raw?.status),
  teamCount: typeof raw?.teamCount === "number" ? raw.teamCount : 0,
});

export const mapLeagueSuggestion = (raw: any): LeagueSuggestion => ({
  ...mapLeagueSummary(raw),
  matchReasons: Array.isArray(raw?.matchReasons)
    ? raw.matchReasons.filter(isMatchReason)
    : [],
});
