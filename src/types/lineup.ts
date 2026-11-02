export type Gender = string

// Lineup slots are whatever the team's or league's ruleset defines, so a
// position is any string.
export type Position = string

export type Player = {
  rulesContext?: string
  id: string
  name: string
  gender: Gender
  desiredPositions: Position[]
  fixedAllGame: boolean
  lockInPosition: boolean
  benched: boolean
}

export type InningAssignment = {
  inning: number
  positions: Record<string, string | null>
  bench: string[]
  droppedPosition?: string
}
