// Sports a league or team can pick. `code` is the lowercase string the server
// stores and validates against (its SPORTS set must match this list).
export const SPORTS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "softball", name: "Softball" },
  { code: "baseball", name: "Baseball" },
  { code: "kickball", name: "Kickball" },
  { code: "basketball", name: "Basketball" },
  { code: "soccer", name: "Soccer" },
  { code: "flag football", name: "Flag Football" },
  { code: "volleyball", name: "Volleyball" },
  { code: "hockey", name: "Hockey" },
  { code: "lacrosse", name: "Lacrosse" },
  { code: "ultimate", name: "Ultimate" },
  { code: "dodgeball", name: "Dodgeball" },
];
