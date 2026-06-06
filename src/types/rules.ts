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

export const sportPresets: Record<string, Omit<TeamRulesConfig, "customInstructions">> = {
  softball: {
    sport: "softball",
    segmentLabel: "inning",
    segmentCount: 7,
    minimumPlayers: 10,
    playersOnField: 10,
    maxConsecutiveBench: 1,
    lineupSlots: ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"],
  },
};

export const parseTeamRulesConfig = (rawRuleText: string | null): TeamRulesConfig => {
  if (!rawRuleText) return defaultTeamRulesConfig;

  try {
    const parsed = JSON.parse(rawRuleText) as Partial<TeamRulesConfig>;
    return {
      sport:
        parsed.sport?.trim().toLowerCase() === "softball"
          ? "softball"
          : defaultTeamRulesConfig.sport,
      segmentLabel: parsed.segmentLabel?.trim() || defaultTeamRulesConfig.segmentLabel,
      segmentCount:
        typeof parsed.segmentCount === "number" && Number.isFinite(parsed.segmentCount)
          ? Math.max(1, Math.floor(parsed.segmentCount))
          : defaultTeamRulesConfig.segmentCount,
      minimumPlayers:
        typeof parsed.minimumPlayers === "number" && Number.isFinite(parsed.minimumPlayers)
          ? Math.max(1, Math.floor(parsed.minimumPlayers))
          : defaultTeamRulesConfig.minimumPlayers,
      playersOnField:
        typeof parsed.playersOnField === "number" && Number.isFinite(parsed.playersOnField)
          ? Math.max(1, Math.floor(parsed.playersOnField))
          : defaultTeamRulesConfig.playersOnField,
      maxConsecutiveBench:
        typeof parsed.maxConsecutiveBench === "number" && Number.isFinite(parsed.maxConsecutiveBench)
          ? Math.max(0, Math.floor(parsed.maxConsecutiveBench))
          : defaultTeamRulesConfig.maxConsecutiveBench,
      lineupSlots: Array.isArray(parsed.lineupSlots)
        ? parsed.lineupSlots
            .map((slot) => String(slot).trim())
            .filter(Boolean)
        : defaultTeamRulesConfig.lineupSlots,
      customInstructions:
        typeof parsed.customInstructions === "string" ? parsed.customInstructions : "",
    };
  } catch (_err) {
    return {
      ...defaultTeamRulesConfig,
      customInstructions: rawRuleText,
    };
  }
};

export const stringifyTeamRulesConfig = (config: TeamRulesConfig): string =>
  JSON.stringify(config);
