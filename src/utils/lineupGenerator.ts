import { Gender, Player } from '../types/lineup'

// Roster utilities. Lineup generation itself is server-only.

const generateId = () => {
  // Prefer platform crypto when available for UUID; fallback to pseudo-random.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    // @ts-ignore
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const boolish = (value: any) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['true', 'yes', 'y', '1'].includes(normalized)
}

// Positions are free-form slot names from the team's ruleset, so nothing is
// filtered here - only trimmed, upper-cased, and de-duplicated.
export const parsePositions = (value: any): string[] => {
  if (!value) return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  const cleaned = raw.map((item) => String(item).trim().toUpperCase()).filter(Boolean)
  return Array.from(new Set(cleaned))
}

export const createPlayer = (overrides?: Partial<Player>): Player => ({
  id: generateId(),
  name: '',
  gender: 'male',
  desiredPositions: [],
  fixedAllGame: false,
  lockInPosition: false,
  benched: false,
  ...overrides,
})

export const buildPlayersFromRows = (rows: any[][]): Player[] => {
  if (!rows || rows.length < 2) return []

  const [header, ...data] = rows
  if (!header) return []

  // Normalize headers for flexible matching
  const normalizedHeaders = header.map((cell) => String(cell || '').toLowerCase().trim())

  // Find indices with flexible matching
  const nameIndex = normalizedHeaders.findIndex((h) =>
    h.includes('name') || h.includes('player')
  )
  const genderIndex = normalizedHeaders.findIndex((h) =>
    h.includes('gender') || h.includes('sex')
  )
  const positionsIndex = normalizedHeaders.findIndex((h) =>
    h.includes('position') || h.includes('pos')
  )
  const fixedIndex = normalizedHeaders.findIndex((h) =>
    h.includes('fixed')
  )
  const lockIndex = normalizedHeaders.findIndex((h) =>
    h.includes('lock')
  )

  if (nameIndex === -1) {
    if (__DEV__) console.log('[buildPlayersFromRows] No name column found. Headers:', normalizedHeaders)
    return []
  }

  return data
    .map((row) => {
      if (!row || row.length === 0) return null

      const name = String(row[nameIndex] ?? '').trim()
      if (!name) return null

      const genderValue = String(row[genderIndex] ?? 'male').toLowerCase().trim()
      const gender: Gender =
        genderValue.startsWith('f') || genderValue === 'female' || genderValue === 'woman'
          ? 'female'
          : 'male'

      const positionsValue = positionsIndex >= 0 ? row[positionsIndex] : ''
      const positions = parsePositions(positionsValue)

      const fixedAllGame = fixedIndex >= 0 ? boolish(row[fixedIndex]) : false
      const lockInPosition =
        (lockIndex >= 0 ? boolish(row[lockIndex]) : false) && positions.length === 1

      return createPlayer({
        name,
        gender,
        desiredPositions: positions,
        fixedAllGame,
        lockInPosition,
      })
    })
    .filter(Boolean) as Player[]
}
