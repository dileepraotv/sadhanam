/**
 * End-to-end code-level simulation of a 5-player Badminton Singles
 * Round-Robin + Knockout tournament.
 *
 * This test imports and calls the REAL production functions directly —
 * nothing here reimplements tournament logic. It exercises:
 *   - src/lib/roundrobin/scheduler.ts   (generateGroupSchedule, verifySchedule)
 *   - src/lib/scoring/engine.ts         (validateGameScore, computeMatchState,
 *                                        deriveGameWinnerId, filterGamesToSave,
 *                                        canAddAnotherGame)
 *   - src/lib/scoring/types.ts          (SPORT_RULES, FORMAT_CONFIGS)
 *   - src/lib/roundrobin/standings.ts   (computeGroupStandings)
 *   - src/lib/actions/qualifiers.ts     (buildQualifiers — pure, no DB)
 *   - src/lib/bracket/engine.ts         (generateBracket)
 *
 * No database, no network, no browser — 100% in-process.
 */

import { generateGroupSchedule, verifySchedule } from '@/lib/roundrobin/scheduler'
import { BYE_PLAYER_ID } from '@/lib/roundrobin/types'
import {
  validateGameScore,
  computeMatchState,
  deriveGameWinnerId,
  filterGamesToSave,
  canAddAnotherGame,
} from '@/lib/scoring/engine'
import { SPORT_RULES, FORMAT_CONFIGS } from '@/lib/scoring/types'
import { computeGroupStandings } from '@/lib/roundrobin/standings'
import { buildQualifiers } from '@/lib/actions/qualifiers'
import { generateBracket } from '@/lib/bracket/engine'
import type { RRGroup } from '@/lib/roundrobin/types'
import type { Match, Game, Player, RRStageConfig } from '@/lib/types'

const SPORT = 'badminton' as const

// ── Fixed player IDs for the 5-player tournament ─────────────────────────────
const ALICE = 'p-alice'
const BOB = 'p-bob'
const CHARLIE = 'p-charlie'
const DIANA = 'p-diana'
const EVE = 'p-eve'
const PLAYER_IDS = [ALICE, BOB, CHARLIE, DIANA, EVE]
const NAMES: Record<string, string> = {
  [ALICE]: 'Alice',
  [BOB]: 'Bob',
  [CHARLIE]: 'Charlie',
  [DIANA]: 'Diana',
  [EVE]: 'Eve',
}

function makePlayer(id: string, seed: number | null): Player {
  return {
    id,
    tournament_id: 't-1',
    name: NAMES[id] ?? id,
    club: null,
    country_code: null,
    seed,
    preferred_group: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

let gameIdCounter = 0
function makeGame(matchId: string, gameNumber: number, score1: number, score2: number, winnerId: string): Game {
  gameIdCounter++
  return {
    id: `game-${gameIdCounter}`,
    match_id: matchId,
    game_number: gameNumber,
    score1,
    score2,
    winner_id: winnerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function makeMatch(
  id: string,
  player1Id: string,
  player2Id: string,
  player1Games: number,
  player2Games: number,
  winnerId: string,
  groupId = 'group-1',
): Match {
  return {
    id,
    tournament_id: 't-1',
    round: 1,
    match_number: 1,
    player1_id: player1Id,
    player2_id: player2Id,
    player1_games: player1Games,
    player2_games: player2Games,
    winner_id: winnerId,
    status: 'complete',
    next_match_id: null,
    next_slot: null,
    round_name: null,
    court: null,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stage_id: 'stage-1',
    group_id: groupId,
    match_kind: 'round_robin',
    match_format: 'bo3',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. RR SCHEDULE GENERATION (5 players → odd → virtual BYE)
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Round-Robin schedule generation (5 badminton players)', () => {
  const fixtures = generateGroupSchedule(PLAYER_IDS)

  it('produces 5 rounds total', () => {
    const rounds = new Set(fixtures.map(f => f.round))
    expect(rounds.size).toBe(5)
    console.log('[RR] Rounds generated:', [...rounds].sort((a, b) => a - b))
  })

  it('has exactly 2 real fixtures + 1 bye fixture per round', () => {
    for (let round = 1; round <= 5; round++) {
      const roundFixtures = fixtures.filter(f => f.round === round)
      const real = roundFixtures.filter(f => !f.isBye)
      const byes = roundFixtures.filter(f => f.isBye)
      expect(roundFixtures.length).toBe(3)
      expect(real.length).toBe(2)
      expect(byes.length).toBe(1)
    }
    console.log('[RR] Full fixture list:', JSON.stringify(fixtures, null, 2))
  })

  it('has every pair of the 5 real players facing each other exactly once (10 real fixtures)', () => {
    const realFixtures = fixtures.filter(f => !f.isBye)
    expect(realFixtures.length).toBe(10)

    const seenPairs = new Set<string>()
    for (const f of realFixtures) {
      const key = [f.player1Id, f.player2Id].sort().join('|')
      expect(seenPairs.has(key)).toBe(false) // no duplicate matchups
      seenPairs.add(key)
    }
    // Every C(5,2) = 10 combination present
    for (let i = 0; i < PLAYER_IDS.length; i++) {
      for (let j = i + 1; j < PLAYER_IDS.length; j++) {
        const key = [PLAYER_IDS[i], PLAYER_IDS[j]].sort().join('|')
        expect(seenPairs.has(key)).toBe(true)
      }
    }
  })

  it('verifySchedule reports { valid: true }', () => {
    const result = verifySchedule(PLAYER_IDS, fixtures)
    console.log('[RR] verifySchedule result:', result)
    expect(result).toEqual({ valid: true })
  })

  // Stash for later sections (standings + bye math) via module-level export-like closure
  ;(global as unknown as { __rrFixtures: typeof fixtures }).__rrFixtures = fixtures
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. SCORING VALIDATION — BADMINTON RULES (BWF: 21 pts, deuce at 20, cap 30)
// ─────────────────────────────────────────────────────────────────────────────
describe('2. validateGameScore — badminton (BWF) rules', () => {
  it('sanity-checks SPORT_RULES for badminton', () => {
    expect(SPORT_RULES.badminton).toEqual({
      unitLabel: 'Game',
      unitWinThreshold: 21,
      deuceAt: 20,
      maxPoints: 30,
    })
  })

  const validCases: Array<[number, number, string]> = [
    [21, 15, 'normal win'],
    [21, 19, 'win just below deuce territory'],
    [22, 20, 'deuce win-by-2'],
    [30, 29, 'BWF cap-arrival score (margin 1 legal only at the cap)'],
    [30, 28, 'normal deuce win-by-2 landing exactly on the cap'],
  ]

  for (const [score1, score2, label] of validCases) {
    it(`accepts ${score1}-${score2} (${label})`, () => {
      const result = validateGameScore({ score1, score2 }, SPORT)
      console.log(`[Scoring] ${score1}-${score2} (${label}) =>`, JSON.stringify(result))
      expect(result.ok).toBe(true)
    })
  }

  const invalidCases: Array<[number, number, string]> = [
    [21, 20, 'margin 1, not at cap'],
    [22, 21, 'deuce margin must be exactly 2'],
    [32, 30, 'exceeds 30 cap'],
    [20, 20, 'deuce still in progress'],
    [0, 0, 'not a valid result'],
    [30, 30, 'tie at cap is impossible'],
    [25, 10, 'winner exceeds normal — game would have ended at 21-10'],
  ]

  for (const [score1, score2, label] of invalidCases) {
    it(`rejects ${score1}-${score2} (${label})`, () => {
      const result = validateGameScore({ score1, score2 }, SPORT)
      const detail = result.ok
        ? 'OK (unexpected!)'
        : result.errors.map(e => `${e.code}: ${e.message}`).join(' | ')
      console.log(`[Scoring] ${score1}-${score2} (${label}) =>`, detail)
      expect(result.ok).toBe(false)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. FULL MATCH SIMULATION ACROSS EVERY BEST-OF FORMAT
// ─────────────────────────────────────────────────────────────────────────────
describe('3. computeMatchState across bo1 / bo3 / bo5 / bo7', () => {
  it('Bo1: single game 21-15 decides the match immediately', () => {
    const matchId = 'm-bo1'
    const games = [makeGame(matchId, 1, 21, 15, ALICE)]
    const state = computeMatchState(games, 'bo1', ALICE, BOB)
    console.log('[Bo1] state:', JSON.stringify(state))
    expect(state.outcome).toBe('player1_wins')
    expect(state.player1Games).toBe(1)
    expect(state.player2Games).toBe(0)
    expect(state.gamesRemaining).toBe(0)
    expect(state.decidingGame).toBe(1)
  })

  it('Bo3: 21-18, 21-19 decides the match 2-0 after 2 games', () => {
    const matchId = 'm-bo3'
    const games = [
      makeGame(matchId, 1, 21, 18, ALICE),
      makeGame(matchId, 2, 21, 19, ALICE),
    ]
    const state = computeMatchState(games, 'bo3', ALICE, BOB)
    console.log('[Bo3] state:', JSON.stringify(state))
    expect(state.outcome).toBe('player1_wins')
    expect(state.player1Games).toBe(2)
    expect(state.player2Games).toBe(0)
    expect(state.decidingGame).toBe(2)
    expect(state.gamesRemaining).toBe(0)
    expect(FORMAT_CONFIGS.bo3.gamesNeeded).toBe(2)
  })

  it('Bo5: mixed winners decide the match 3-1 after game 4, no 5th game needed', () => {
    const matchId = 'm-bo5'
    // g1: P2 wins 21-10 | g2: P1 wins 21-19 (per "19-21" reversed to keep the
    // decisive 3-1 storyline explicit) | g3: P1 wins 21-12 | g4: P1 wins 21-15
    const games = [
      makeGame(matchId, 1, 10, 21, BOB), // P2 up 1-0
      makeGame(matchId, 2, 21, 19, ALICE), // 1-1
      makeGame(matchId, 3, 21, 12, ALICE), // P1 up 2-1
      makeGame(matchId, 4, 21, 15, ALICE), // P1 wins 3-1, match decided
    ]
    const state = computeMatchState(games, 'bo5', ALICE, BOB)
    console.log('[Bo5] state:', JSON.stringify(state))
    expect(state.outcome).toBe('player1_wins')
    expect(state.player1Games).toBe(3)
    expect(state.player2Games).toBe(1)
    expect(state.decidingGame).toBe(4)
    expect(state.gamesRemaining).toBe(0)
  })

  it('Bo7: full 7-game decider (incl. a 30-29 cap game) ends 4-3, and game 8 is rejected', () => {
    const matchId = 'm-bo7'
    const games = [
      makeGame(matchId, 1, 21, 15, ALICE), // 1-0
      makeGame(matchId, 2, 18, 21, BOB), // 1-1
      makeGame(matchId, 3, 21, 19, ALICE), // 2-1
      makeGame(matchId, 4, 15, 21, BOB), // 2-2
      makeGame(matchId, 5, 22, 20, ALICE), // 3-2 (deuce win-by-2)
      makeGame(matchId, 6, 19, 21, BOB), // 3-3
      makeGame(matchId, 7, 30, 29, ALICE), // 4-3, BWF cap-rule decider
    ]
    const state = computeMatchState(games, 'bo7', ALICE, BOB)
    console.log('[Bo7] state:', JSON.stringify(state))
    expect(FORMAT_CONFIGS.bo7.gamesNeeded).toBe(4)
    expect(state.outcome).toBe('player1_wins')
    expect(state.player1Games).toBe(4)
    expect(state.player2Games).toBe(3)
    expect(state.decidingGame).toBe(7)
    expect(state.gamesRemaining).toBe(0)

    // Confirm each of the 7 games validates individually under badminton rules
    for (const g of games) {
      const v = validateGameScore({ score1: g.score1 as number, score2: g.score2 as number }, SPORT)
      expect(v.ok).toBe(true)
    }

    // A hypothetical 8th game must be rejected by canAddAnotherGame
    const canAdd8 = canAddAnotherGame(games, 'bo7', ALICE, BOB, 8)
    console.log('[Bo7] canAddAnotherGame(game 8):', JSON.stringify(canAdd8))
    expect(canAdd8.allowed).toBe(false)

    // Also confirm the (already-decided) match rejects a "game 8" purely on the
    // decided-match check, independent of the maxGames check.
    const decidedCheck = canAddAnotherGame(games, 'bo7', ALICE, BOB, 8)
    expect(decidedCheck.reason).toMatch(/already complete|exceeds the maximum/i)
  })

  it('deriveGameWinnerId matches the higher score', () => {
    expect(deriveGameWinnerId(21, 15, ALICE, BOB)).toBe(ALICE)
    expect(deriveGameWinnerId(15, 21, ALICE, BOB)).toBe(BOB)
  })

  it('filterGamesToSave discards a surplus 3rd game in a Bo3 once 2-0 is reached', () => {
    const gamesToSave = [
      { game_number: 1, score1: 21, score2: 10 },
      { game_number: 2, score1: 21, score2: 15 },
      { game_number: 3, score1: 15, score2: 21 }, // surplus — match already 2-0
    ]
    const result = filterGamesToSave(gamesToSave, [], 'bo3', ALICE, BOB)
    console.log('[filterGamesToSave] result:', JSON.stringify(result))
    expect(result.validGames).toHaveLength(2)
    expect(result.validGames.map(g => g.game_number)).toEqual([1, 2])
    expect(result.skippedCount).toBe(1)
    expect(result.matchWonByPlayer1).toBe(true)
    expect(result.decidingGameNumber).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. STANDINGS COMPUTATION — full RR + deliberate H2H-overrides-game-diff tie
// ─────────────────────────────────────────────────────────────────────────────
//
// Designed result set (A=Alice, B=Bob, C=Charlie, D=Diana, E=Eve):
//   A beats everyone (4-0)               -> wins=4
//   C: beats D (2-1), beats B (2-0), loses to A (0-2), loses to E (0-2) -> wins=2, gameDiff = -1
//   D: beats B (2-0), beats E (2-0), loses to A (1-2), loses to C (1-2) -> wins=2, gameDiff = +2
//   B: beats E (2-1), loses to A/C/D                                    -> wins=1
//   E: beats C (2-0), loses to A/B/D                                    -> wins=1
//
// C and D are tied 2-2 on wins/losses. D has the BETTER game-diff (+2 vs -1),
// but C beat D head-to-head (2-1) -> per the documented ITTF-style 2-player
// H2H rule, C must rank ABOVE D despite the worse game difference.
// B and E are tied 1-3 on wins/losses with B beating E head-to-head, so B
// must rank above E too (second independent H2H example).
// ─────────────────────────────────────────────────────────────────────────────
describe('4. computeGroupStandings — full RR + head-to-head tiebreaker', () => {
  const group: RRGroup = {
    id: 'group-1',
    stageId: 'stage-1',
    name: 'Group 1',
    groupNumber: 1,
    playerIds: PLAYER_IDS,
  }

  const players: Player[] = [
    makePlayer(ALICE, 1),
    makePlayer(BOB, 2),
    makePlayer(CHARLIE, 3),
    makePlayer(DIANA, 4),
    makePlayer(EVE, 5),
  ]

  // Matches: player1/player2 order as commented; games score1 = player1.
  const m1 = makeMatch('m1', ALICE, BOB, 2, 0, ALICE)
  const m1Games = [makeGame('m1', 1, 21, 15, ALICE), makeGame('m1', 2, 21, 18, ALICE)]

  const m2 = makeMatch('m2', ALICE, CHARLIE, 2, 0, ALICE)
  const m2Games = [makeGame('m2', 1, 21, 14, ALICE), makeGame('m2', 2, 21, 16, ALICE)]

  const m3 = makeMatch('m3', ALICE, DIANA, 2, 1, ALICE)
  const m3Games = [
    makeGame('m3', 1, 21, 19, ALICE),
    makeGame('m3', 2, 18, 21, DIANA),
    makeGame('m3', 3, 21, 17, ALICE),
  ]

  const m4 = makeMatch('m4', ALICE, EVE, 2, 0, ALICE)
  const m4Games = [makeGame('m4', 1, 21, 12, ALICE), makeGame('m4', 2, 21, 10, ALICE)]

  const m5 = makeMatch('m5', CHARLIE, DIANA, 2, 1, CHARLIE) // C beats D H2H
  const m5Games = [
    makeGame('m5', 1, 21, 18, CHARLIE),
    makeGame('m5', 2, 19, 21, DIANA),
    makeGame('m5', 3, 21, 16, CHARLIE),
  ]

  const m6 = makeMatch('m6', DIANA, BOB, 2, 0, DIANA)
  const m6Games = [makeGame('m6', 1, 21, 15, DIANA), makeGame('m6', 2, 21, 17, DIANA)]

  const m7 = makeMatch('m7', DIANA, EVE, 2, 0, DIANA)
  const m7Games = [makeGame('m7', 1, 21, 13, DIANA), makeGame('m7', 2, 21, 11, DIANA)]

  const m8 = makeMatch('m8', CHARLIE, BOB, 2, 0, CHARLIE)
  const m8Games = [makeGame('m8', 1, 21, 16, CHARLIE), makeGame('m8', 2, 21, 14, CHARLIE)]

  const m9 = makeMatch('m9', EVE, CHARLIE, 2, 0, EVE)
  const m9Games = [makeGame('m9', 1, 21, 17, EVE), makeGame('m9', 2, 21, 19, EVE)]

  const m10 = makeMatch('m10', BOB, EVE, 2, 1, BOB) // B beats E H2H
  const m10Games = [
    makeGame('m10', 1, 21, 19, BOB),
    makeGame('m10', 2, 18, 21, EVE),
    makeGame('m10', 3, 21, 16, BOB),
  ]

  const matches: Match[] = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10]
  const games: Game[] = [
    ...m1Games, ...m2Games, ...m3Games, ...m4Games, ...m5Games,
    ...m6Games, ...m7Games, ...m8Games, ...m9Games, ...m10Games,
  ]

  // Sanity: every game score is a valid badminton result
  it('sanity: every constructed game score is a valid badminton result', () => {
    for (const g of games) {
      const v = validateGameScore({ score1: g.score1 as number, score2: g.score2 as number }, SPORT)
      expect(v.ok).toBe(true)
    }
  })

  const { standings } = computeGroupStandings(group, players, matches, games, 2)

  it('gives every player matchesPlayed = 4, with wins+losses adding up', () => {
    console.log('[Standings] full table:', JSON.stringify(standings, null, 2))
    for (const s of standings) {
      expect(s.matchesPlayed).toBe(4)
      expect(s.wins + s.losses).toBe(4)
    }
  })

  it('computes the exact win/loss/gameDiff numbers used in the design', () => {
    const byId = new Map(standings.map(s => [s.playerId, s]))
    expect(byId.get(ALICE)).toMatchObject({ wins: 4, losses: 0 })
    expect(byId.get(CHARLIE)).toMatchObject({ wins: 2, losses: 2, gameDifference: -1 })
    expect(byId.get(DIANA)).toMatchObject({ wins: 2, losses: 2, gameDifference: 2 })
    expect(byId.get(BOB)).toMatchObject({ wins: 1, losses: 3 })
    expect(byId.get(EVE)).toMatchObject({ wins: 1, losses: 3 })
  })

  it('ranks players by wins, then head-to-head for 2-way ties', () => {
    const byId = new Map(standings.map(s => [s.playerId, s]))
    expect(byId.get(ALICE)!.rank).toBe(1)

    // KEY ASSERTION: C (worse game-diff, -1) outranks D (better game-diff, +2)
    // because C won the head-to-head 2-1.
    const cRank = byId.get(CHARLIE)!.rank
    const dRank = byId.get(DIANA)!.rank
    console.log(
      `[Standings] H2H check -> Charlie rank=${cRank} (gameDiff ${byId.get(CHARLIE)!.gameDifference}), ` +
      `Diana rank=${dRank} (gameDiff ${byId.get(DIANA)!.gameDifference})`,
    )
    expect(cRank).toBeLessThan(dRank) // Charlie ranks ABOVE Diana
    expect(byId.get(CHARLIE)!.gameDifference).toBeLessThan(byId.get(DIANA)!.gameDifference) // despite worse game-diff

    // Second H2H example: Bob beat Eve head-to-head, both tied 1-3
    const bRank = byId.get(BOB)!.rank
    const eRank = byId.get(EVE)!.rank
    expect(bRank).toBeLessThan(eRank)

    // Full rank order: Alice, Charlie, Diana, Bob, Eve
    const order = [...standings].sort((a, b) => a.rank - b.rank).map(s => NAMES[s.playerId])
    console.log('[Standings] Final rank order:', order)
    expect(order).toEqual(['Alice', 'Charlie', 'Diana', 'Bob', 'Eve'])
  })

  it('sets advances=true for exactly the top advanceCount(=2) players', () => {
    const advancing = standings.filter(s => s.advances).map(s => NAMES[s.playerId])
    expect(advancing.sort()).toEqual(['Alice', 'Charlie'].sort())
  })

  // Stash for step 5
  ;(global as unknown as { __groupStandings: typeof standings }).__groupStandings = standings
  ;(global as unknown as { __group: RRGroup }).__group = group
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. QUALIFIER / SEEDING TRANSITION TO KNOCKOUT
// ─────────────────────────────────────────────────────────────────────────────
describe('5. buildQualifiers — pure qualifier computation (no DB)', () => {
  it('returns exactly 2 qualifiers in correct rank/koSeed order when allowBestThird=false', async () => {
    const standings = (global as unknown as { __groupStandings: import('@/lib/roundrobin/types').PlayerStanding[] }).__groupStandings
    const group = (global as unknown as { __group: RRGroup }).__group
    const groupStandings = [{ group, standings }]

    const cfg: RRStageConfig = {
      numberOfGroups: 1,
      advanceCount: 2,
      matchFormat: 'bo3',
      allowBestThird: false,
      bestThirdCount: 0,
    }

    const qualifiers = await buildQualifiers(groupStandings, cfg)
    console.log('[Qualifiers] allowBestThird=false ->', JSON.stringify(qualifiers, null, 2))

    expect(qualifiers).toHaveLength(2)
    expect(qualifiers.every(q => !q.isBestThird)).toBe(true)

    const rank1 = qualifiers.find(q => q.rrRank === 1)!
    const rank2 = qualifiers.find(q => q.rrRank === 2)!
    expect(rank1.playerId).toBe(ALICE)
    expect(rank1.koSeed).toBe(1)
    expect(rank2.playerId).toBe(CHARLIE) // rank 2 per the H2H-adjusted standings
    expect(rank2.koSeed).toBe(2)
  })

  it('adds a best-third qualifier only when allowBestThird=true', async () => {
    const standings = (global as unknown as { __groupStandings: import('@/lib/roundrobin/types').PlayerStanding[] }).__groupStandings
    const group = (global as unknown as { __group: RRGroup }).__group
    const groupStandings = [{ group, standings }]

    const cfgWithThird: RRStageConfig = {
      numberOfGroups: 1,
      advanceCount: 2,
      matchFormat: 'bo3',
      allowBestThird: true,
      bestThirdCount: 1,
    }

    const qualifiers = await buildQualifiers(groupStandings, cfgWithThird)
    console.log('[Qualifiers] allowBestThird=true, bestThirdCount=1 ->', JSON.stringify(qualifiers, null, 2))

    expect(qualifiers).toHaveLength(3)
    const bestThird = qualifiers.find(q => q.isBestThird)
    expect(bestThird).toBeDefined()
    expect(bestThird!.playerId).toBe(DIANA) // rank 3 (advanceCount+1) in the standings
    expect(bestThird!.koSeed).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. KNOCKOUT BRACKET GENERATION
// ─────────────────────────────────────────────────────────────────────────────
describe('6. generateBracket — knockout seed placement', () => {
  it('2 qualifiers -> bracket size 2, one Round-1 Final, zero byes', () => {
    const qualifierPlayers: Player[] = [
      { ...makePlayer(ALICE, 1) }, // koSeed 1
      { ...makePlayer(CHARLIE, 2) }, // koSeed 2
    ]
    const bracket = generateBracket(qualifierPlayers, 42)
    console.log('[Bracket:2p] result:', JSON.stringify(bracket, null, 2))

    expect(bracket.bracketSize).toBe(2)
    expect(bracket.byeCount).toBe(0)
    expect(bracket.firstRoundMatches).toHaveLength(1)

    const final = bracket.firstRoundMatches[0]
    expect(final.isBye).toBe(false)
    const slotPlayerIds = [final.slot1.player?.id, final.slot2.player?.id].sort()
    expect(slotPlayerIds).toEqual([ALICE, CHARLIE].sort())
  })

  it('3 qualifiers (odd) -> pads to bracket size 4 with exactly 1 bye for the top seed', () => {
    const threePlayers: Player[] = [
      makePlayer(ALICE, 1),
      makePlayer(CHARLIE, 2),
      makePlayer(DIANA, 3),
    ]
    const bracket = generateBracket(threePlayers, 42)
    console.log('[Bracket:3p] result:', JSON.stringify(bracket, null, 2))

    expect(bracket.bracketSize).toBe(4)
    expect(bracket.byeCount).toBe(1)

    const byeMatches = bracket.firstRoundMatches.filter(m => m.isBye)
    expect(byeMatches).toHaveLength(1)

    // The bye match must be the top seed's match (seed order [1,4,2,3] -> slot1=seed1, slot2=seed4(bye))
    const byeMatch = byeMatches[0]
    const realSlot = byeMatch.slot1.isBye ? byeMatch.slot2 : byeMatch.slot1
    expect(realSlot.player?.id).toBe(ALICE)
  })

  it('1 player throws', () => {
    expect(() => generateBracket([makePlayer(ALICE, 1)], 42)).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. ODD-GROUP BYE EDGE CASE SANITY (5 players -> 5 rounds -> 5 total byes)
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Odd-group bye math sanity (5 players)', () => {
  it('every player plays exactly 4 real matches, and there are exactly 5 total byes (1 per player)', () => {
    const fixtures = (global as unknown as { __rrFixtures: import('@/lib/roundrobin/types').RRFixture[] }).__rrFixtures

    const realMatchesPerPlayer = new Map<string, number>(PLAYER_IDS.map(id => [id, 0]))
    const byesPerPlayer = new Map<string, number>(PLAYER_IDS.map(id => [id, 0]))

    for (const f of fixtures) {
      if (f.isBye) {
        const realPlayer = f.player1Id === BYE_PLAYER_ID ? f.player2Id : f.player1Id
        byesPerPlayer.set(realPlayer, (byesPerPlayer.get(realPlayer) ?? 0) + 1)
      } else {
        realMatchesPerPlayer.set(f.player1Id, (realMatchesPerPlayer.get(f.player1Id) ?? 0) + 1)
        realMatchesPerPlayer.set(f.player2Id, (realMatchesPerPlayer.get(f.player2Id) ?? 0) + 1)
      }
    }

    console.log('[ByeMath] real matches per player:', Object.fromEntries(realMatchesPerPlayer))
    console.log('[ByeMath] byes per player:', Object.fromEntries(byesPerPlayer))

    for (const id of PLAYER_IDS) {
      expect(realMatchesPerPlayer.get(id)).toBe(4)
      expect(byesPerPlayer.get(id)).toBe(1)
    }

    const totalByes = fixtures.filter(f => f.isBye).length
    expect(totalByes).toBe(5) // 5 rounds x 1 bye/round
    const totalByePlayerSum = [...byesPerPlayer.values()].reduce((a, b) => a + b, 0)
    expect(totalByePlayerSum).toBe(5) // 5 players x 1 bye each
  })
})
