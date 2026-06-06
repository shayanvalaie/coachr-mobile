import { Player } from "../types/lineup";

export const normalizePlayerName = (name: string): string =>
  name
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

export const findDuplicatePlayerNames = (players: Player[]): string[] => {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const player of players) {
    const raw = player.name.trim();
    if (!raw) continue;

    const key = normalizePlayerName(raw);
    if (seen.has(key)) {
      duplicates.add(seen.get(key) ?? raw);
      duplicates.add(raw);
      continue;
    }
    seen.set(key, raw);
  }

  return Array.from(duplicates);
};

export const buildPlayerGenderByName = (
  players: Array<Pick<Player, "name" | "gender">>,
): Record<string, Player["gender"]> => {
  const byName: Record<string, Player["gender"]> = {};

  for (const player of players) {
    const key = normalizePlayerName(player.name);
    if (!key) continue;
    if (byName[key]) continue;
    byName[key] = player.gender;
  }

  return byName;
};
