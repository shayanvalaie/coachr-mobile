export type Gender = 'male' | 'female'

// Lineup slots are whatever the team's or league's ruleset defines, so a
// position is any string.
export type Position = string

export type Player = {
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
