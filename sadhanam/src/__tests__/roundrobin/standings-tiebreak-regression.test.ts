import { computeGroupStandings } from '@/lib/roundrobin/standings'
import { buildQualifiers } from '@/lib/actions/qualifiers'
import type { Match, Game, Player } from '@/lib/types'
import type { RRGroup } from '@/lib/roundrobin/types'

// Regression test — locks in correct 3-way-tie tiebreak behaviour using the
// exact real match/game data from a live Group 4 (badminton, 5-player group,
// advanceCount=2) where Shivakumar / B K Kamath / Ravikumar were all tied on
// wins (3) and game difference (+2). Only points difference discriminates:
// Kamath (+7) must rank above Ravikumar (+3). A previously-deployed build
// generated an incorrect knockout bracket for this exact scenario, so this
// test pins the fix in place.

const SHIVA = 'a9f5d646-ccad-4869-bf14-311b90497b8a'
const KAMATH = 'fc8e766a-3de9-4142-953a-bd169eefdb09'
const RAVI = '254548ad-78b5-445f-b19f-b5ad6e4e98a4'
const RICHARD = '3d8eba89-94d0-4b0c-b75b-c789f1381be5'
const RAGHA = '1e59623b-b550-4013-8f74-75ecc8a5a4e7'

const group: RRGroup = {
  id: '846c92d2-886e-454b-9677-79e1f04442e2',
  stageId: 'a3cbe6e7-e7d0-461b-8dbb-e1e7b8c4633a',
  name: 'Group 4',
  groupNumber: 4,
  playerIds: [SHIVA, KAMATH, RAVI, RICHARD, RAGHA],
}

const players: Player[] = [
  { id: SHIVA, name: 'Shivakumar', seed: 4, club: 'India' } as Player,
  { id: KAMATH, name: 'B K Kamath', seed: 14, club: 'India' } as Player,
  { id: RAVI, name: 'Ravikumar', seed: 12, club: 'India' } as Player,
  { id: RICHARD, name: 'Richard', seed: 19, club: 'India' } as Player,
  { id: RAGHA, name: 'Raghavendra', seed: 5, club: 'India' } as Player,
]

function m(id: string, p1: string | null, p2: string | null, p1g: number, p2g: number, winner: string | null, status = 'complete'): Match {
  return {
    id, group_id: group.id, stage_id: group.stageId, status,
    player1_id: p1, player2_id: p2, winner_id: winner,
    player1_games: p1g, player2_games: p2g,
  } as unknown as Match
}

function g(matchId: string, s1: number, s2: number, winner: string | null): Game {
  return { id: `${matchId}-g1`, match_id: matchId, game_number: 1, score1: s1, score2: s2, winner_id: winner } as Game
}

const matches: Match[] = [
  m('2f078245', SHIVA, null, 0, 0, null, 'bye'),
  m('baaf4a8e', null, KAMATH, 0, 0, null, 'bye'),
  m('441f8016', null, RAGHA, 0, 0, null, 'bye'),
  m('c5e62c81', RICHARD, RAVI, 0, 1, RAVI),
  m('25174acd', SHIVA, KAMATH, 0, 1, KAMATH),
  m('dc201828', RAGHA, RICHARD, 0, 1, RICHARD),
  m('b03d6db8', RAGHA, RAVI, 0, 1, RAVI),
  m('97904b83', SHIVA, RAVI, 1, 0, SHIVA),
  m('c8e16b6f', SHIVA, RICHARD, 1, 0, SHIVA),
  m('9e7c39e9', RAVI, KAMATH, 1, 0, RAVI),
  m('5e494ce2', KAMATH, RICHARD, 1, 0, KAMATH),
  m('ed04784e', KAMATH, RAGHA, 1, 0, KAMATH),
  m('62997e2d', SHIVA, RAGHA, 1, 0, SHIVA),
  m('ec0a00bb', RICHARD, null, 0, 0, null, 'bye'),
  m('58914498', RAVI, null, 0, 0, null, 'bye'),
]

const games: Game[] = [
  g('c5e62c81', 17, 21, RAVI),
  g('25174acd', 17, 21, KAMATH),
  g('97904b83', 21, 17, SHIVA),
  g('c8e16b6f', 21, 11, SHIVA),
  g('9e7c39e9', 21, 18, RAVI),
  g('5e494ce2', 21, 15, KAMATH),
  // dc201828, b03d6db8, ed04784e, 62997e2d have NO game rows in the live DB
  // (declared/walkover wins) — reproduced faithfully here.
]

test('Group 4 standings rank Kamath above Ravikumar (PD tiebreak)', () => {
  const { standings } = computeGroupStandings(group, players, matches, games, 2)
  const byName = Object.fromEntries(standings.map(s => [s.playerName, s]))

  expect(byName['Shivakumar'].rank).toBe(1)
  expect(byName['B K Kamath'].rank).toBe(2)
  expect(byName['Ravikumar'].rank).toBe(3)
})

test('buildQualifiers picks Kamath (not Ravikumar) as Group 4 runner-up', async () => {
  const { standings } = computeGroupStandings(group, players, matches, games, 2)
  const qualifiers = await buildQualifiers(
    [{ group, standings }],
    { advanceCount: 2, allowBestThird: false, bestThirdCount: 0, matchFormat: 'bo1', numberOfGroups: 1, finalizationRule: 'manual' } as any,
  )
  const names = qualifiers.map(q => q.name)
  expect(names).toContain('B K Kamath')
  expect(names).not.toContain('Ravikumar')
})
