import {
  Gender,
  Position,
  Player,
  PlayerState,
  InningAssignment,
  GameConfig,
} from '../types/lineup'

const ALL_POSITIONS: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LCF', 'RCF', 'RF']
const POSITION_SET = new Set(ALL_POSITIONS)

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

export const parsePositions = (value: any): Position[] => {
  if (!value) return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  const cleaned = raw
    .map((item) => String(item).trim().toUpperCase())
    .filter((entry) => POSITION_SET.has(entry as Position)) as Position[]
  return Array.from(new Set(cleaned))
}

export const createPlayer = (overrides?: Partial<Player>): Player => ({
  id: generateId(),
  name: '',
  gender: 'male',
  desiredPositions: [],
  fixedAllGame: false,
  lockInPosition: false,
  ...overrides,
})

// Decide roster size rules based on available women.
const buildGameConfig = (players: Player[]): { config?: GameConfig; error?: string } => {
  const women = players.filter((p) => p.gender === 'female').length
  if (women < 3) {
    return { error: 'At least 3 women are required to play under these rules.' }
  }

  if (women >= 5) {
    return {
      config: { fielders: 10, positions: [...ALL_POSITIONS], catcherMustBeMale: false, minWomen: 4 },
    }
  }

  if (women === 4) {
    return {
      config: { fielders: 10, positions: [...ALL_POSITIONS], catcherMustBeMale: true, minWomen: 4 },
    }
  }

  return {
    config: {
      fielders: 9,
      positions: ALL_POSITIONS.filter((pos) => pos !== 'RCF'),
      catcherMustBeMale: true,
      droppedPosition: 'RCF',
      minWomen: 3,
    },
  }
}

// Pick a pitcher; locked pitcher wins, otherwise prefer players who want P.
const selectPitcher = (players: Player[]): { pitcher?: Player; error?: string } => {
  const lockedPitchers = players.filter(
    (p) => p.lockInPosition && p.desiredPositions.includes('P'),
  )
  if (lockedPitchers.length > 1) {
    return { error: 'Multiple players are locked to Pitcher. Only one pitcher is allowed.' }
  }
  if (lockedPitchers.length === 1) {
    return { pitcher: lockedPitchers[0] }
  }

  const preferred = players.filter((p) => p.desiredPositions.includes('P'))
  if (preferred.length > 0) {
    return { pitcher: preferred[Math.floor(Math.random() * preferred.length)] }
  }

  return { pitcher: players[Math.floor(Math.random() * players.length)] }
}

// Map any lock-in players to their forced positions.
const buildLockMap = (players: Player[]) => {
  const lockMap = new Map<Position, Player>()
  for (const player of players) {
    if (player.lockInPosition && player.desiredPositions.length === 1) {
      const lockedPos = player.desiredPositions[0]
      if (lockMap.has(lockedPos)) {
        return { error: `Position ${lockedPos} is locked by multiple players.` }
      }
      lockMap.set(lockedPos, player)
    }
  }
  return { lockMap }
}

// Pick who sits this inning while avoiding back-to-back bench time.
const selectBenchPlayers = (
  count: number,
  players: Player[],
  playerStates: Map<string, PlayerState>,
  protectedIds: Set<string>,
) => {
  if (count <= 0) return [] as Player[]

  const eligible = players.filter(
    (p) =>
      !protectedIds.has(p.id) &&
      !playerStates.get(p.id)?.lastBenched &&
      (!p.lockInPosition || p.desiredPositions[0] !== 'P'),
  )

  if (eligible.length < count) {
    return null
  }

  const ranked = shuffle(eligible).sort((a, b) => {
    const aState = playerStates.get(a.id)!
    const bState = playerStates.get(b.id)!
    const aPenalty = (a.lockInPosition ? 8 : 0) + aState.benchCount
    const bPenalty = (b.lockInPosition ? 8 : 0) + bState.benchCount
    return aPenalty - bPenalty
  })

  return ranked.slice(0, count)
}

// Score and choose the best available player for a position.
const chooseCandidate = (
  position: Position,
  available: Player[],
  minWomen: number,
  femaleAssigned: number,
  femaleRemaining: number,
  catcherMustBeMale: boolean,
) => {
  const viable = available.filter((player) => {
    if (position === 'C' && catcherMustBeMale && player.gender !== 'male') return false

    const newFemaleCount = femaleAssigned + (player.gender === 'female' ? 1 : 0)
    const remainingFemaleAfterPick = femaleRemaining - (player.gender === 'female' ? 1 : 0)

    if (newFemaleCount < minWomen && remainingFemaleAfterPick + newFemaleCount < minWomen) {
      return false
    }

    return true
  })

  if (viable.length === 0) return null

  const scored = viable.map((player) => {
    const desired = player.desiredPositions.includes(position)
    let score = 0
    if (desired) score += 4
    if (!desired) score -= 1
    score += Math.random()
    return { player, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].player
}

// Attempt multiple randomized builds until a valid 7-inning lineup is found.
export const generateLineup = (
  players: Player[],
): { lineup?: InningAssignment[]; error?: string; meta?: GameConfig } => {
  if (players.length === 0) return { error: 'Select at least one active player.' }

  const configResult = buildGameConfig(players)
  if (configResult.error) return { error: configResult.error }
  const config = configResult.config!

  if (players.length < config.fielders) {
    return { error: `Not enough players to fill ${config.fielders} field spots.` }
  }

  const lockMapResult = buildLockMap(players)
  if (lockMapResult.error) return { error: lockMapResult.error }
  const lockMap = lockMapResult.lockMap

  const pitcherResult = selectPitcher(players)
  if (pitcherResult.error) return { error: pitcherResult.error }
  const pitcher = pitcherResult.pitcher!

  if (lockMap.has('P') && lockMap.get('P')?.id !== pitcher.id) {
    return { error: 'Pitcher is locked to a different player. Resolve the conflict.' }
  }

  const attempts = 240

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const playerStates = new Map<string, PlayerState>()
    players.forEach((p) => {
      playerStates.set(p.id, { benchCount: 0, lastBenched: false })
    })

    const innings: InningAssignment[] = []
    let success = true

    for (let inning = 1; inning <= 7 && success; inning += 1) {
      const fieldPositions = [...config.positions]
      const benchSlots = players.length - config.fielders

      const protectedIds = new Set<string>([pitcher.id])
      lockMap.forEach((player) => protectedIds.add(player.id))
      const benchPlayers = selectBenchPlayers(benchSlots, players, playerStates, protectedIds)

      if (!benchPlayers) {
        success = false
        break
      }

      const benchIds = new Set(benchPlayers.map((p) => p.id))
      if (benchIds.has(pitcher.id)) {
        success = false
        break
      }

      const assignment: Record<Position, string | null> = {
        P: null,
        C: null,
        '1B': null,
        '2B': null,
        '3B': null,
        SS: null,
        LF: null,
        LCF: null,
        RCF: null,
        RF: null,
      }

      let femaleAssigned = 0
      const assignedIds = new Set<string>()

      const assignPlayer = (pos: Position, player: Player) => {
        assignment[pos] = player.name
        if (player.gender === 'female') femaleAssigned += 1
        assignedIds.add(player.id)
      }

      assignPlayer('P', pitcher)
      const pitcherIndex = fieldPositions.indexOf('P')
      if (pitcherIndex > -1) fieldPositions.splice(pitcherIndex, 1)

      if (lockMap.size > 0) {
        for (const [pos, player] of lockMap.entries()) {
          if (benchIds.has(player.id)) {
            success = false
            break
          }
          if (assignment[pos] && assignment[pos] !== player.name) {
            success = false
            break
          }
          assignPlayer(pos, player)
          const index = fieldPositions.indexOf(pos)
          if (index > -1) fieldPositions.splice(index, 1)
        }
      }

      if (!success) break

      const availablePlayers = players.filter(
        (p) => !benchIds.has(p.id) && !assignedIds.has(p.id),
      )

      const catcherPosIndex = fieldPositions.indexOf('C')
      if (catcherPosIndex > -1) {
        fieldPositions.splice(catcherPosIndex, 1)
        fieldPositions.unshift('C')
      }

      for (const position of fieldPositions) {
        const remainingWomen = availablePlayers.filter((p) => p.gender === 'female').length
        const candidate = chooseCandidate(
          position,
          availablePlayers,
          config.minWomen,
          femaleAssigned,
          remainingWomen,
          config.catcherMustBeMale,
        )
        if (!candidate) {
          success = false
          break
        }

        assignPlayer(position, candidate)
        availablePlayers.splice(
          availablePlayers.findIndex((p) => p.id === candidate.id),
          1,
        )
      }

      if (!success) break
      if (femaleAssigned < config.minWomen) {
        success = false
        break
      }

      players.forEach((p) => {
        const state = playerStates.get(p.id)!
        if (benchIds.has(p.id)) {
          state.benchCount += 1
          state.lastBenched = true
        } else {
          state.lastBenched = false
        }
      })

      innings.push({
        inning,
        positions: assignment,
        bench: benchPlayers.map((p) => p.name),
        droppedPosition: config.droppedPosition,
      })
    }

    if (success) {
      return { lineup: innings, meta: config }
    }
  }

  return { error: 'Unable to generate a valid lineup with the current constraints.' }
}

const shuffle = <T,>(items: T[]) => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const sampleRoster: Player[] = [
  createPlayer({ name: 'Alex', gender: 'male', desiredPositions: ['P'], lockInPosition: true }),
  createPlayer({ name: 'Bri', gender: 'female', desiredPositions: ['C'] }),
  createPlayer({ name: 'Casey', gender: 'female', desiredPositions: ['1B', '2B'] }),
  createPlayer({ name: 'Dee', gender: 'male', desiredPositions: ['SS', '3B'] }),
  createPlayer({ name: 'Evan', gender: 'female', desiredPositions: ['LF', 'RF'] }),
  createPlayer({ name: 'Frank', gender: 'male', desiredPositions: ['LCF', 'RCF'] }),
  createPlayer({ name: 'Gia', gender: 'female', desiredPositions: ['2B', 'SS'] }),
  createPlayer({ name: 'Harper', gender: 'female', desiredPositions: ['LF', 'LCF'] }),
  createPlayer({ name: 'Isaac', gender: 'male', desiredPositions: ['1B', '3B'] }),
  createPlayer({ name: 'Jules', gender: 'male', desiredPositions: ['RCF', 'RF'] }),
]

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
    console.log('[buildPlayersFromRows] No name column found. Headers:', normalizedHeaders)
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
        desiredPositions: positions.length > 0 ? positions : ['P'],
        fixedAllGame,
        lockInPosition,
      })
    })
    .filter(Boolean) as Player[]
}
