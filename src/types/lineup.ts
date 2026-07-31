export type Gender = 'male' | 'female'

export type Position = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'LCF' | 'RCF' | 'RF'

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

export type PlayerState = {
  benchCount: number
  lastBenched: boolean
}

export type GameConfig = {
  fielders: number
  positions: Position[]
  catcherMustBeMale: boolean
  droppedPosition?: Position
  minWomen: number
}
