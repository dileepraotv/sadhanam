'use client'

/**
 * Match scoring UI — redesigned with:
 *  • Per-match format selector (bo3 / bo5 / bo7) — no longer set at event level
 *  • Bulk save: fill ALL game scores, one Save button
 *  • Declare winner visible directly (no expand needed)
 *  • No "Mark Live" button — status transitions automatically on first save
 *  • Consistent header with round context
 */

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trophy, Save, Trash2, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Match, Game, Tournament } from '@/lib/types'
import type { MatchFormat } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui/index'
import { LiveBadge } from '@/components/shared/LiveBadge'
import {
  saveGameScore, bulkSaveGameScores, deleteGameScore, declareMatchWinner, updateMatchFormat,
  saveChessResult, saveCarromBoard, deleteCarromBoard,
} from '@/lib/actions/matches'
import { toast } from '@/components/ui/toaster'
import { cn, playerDisplayName } from '@/lib/utils'
import {
  validateGameScore,
  computeMatchState,
  computeChessMatchState,
  computeCarromMatchState,
  inferGameNumbersToShow,
} from '@/lib/scoring/engine'
import { FORMAT_CONFIGS, SPORT_RULES } from '@/lib/scoring/types'
import type { ComputedMatchState } from '@/lib/scoring/types'
import type { SportType } from '@/lib/types'
import { useLoading } from '@/components/shared/GlobalLoader'
import { sportUi, type SportUiClasses } from '@/components/shared/SportBadge'

interface LocalScore { s1: string; s2: string }

interface MatchScoringClientProps {
  initialMatch:  Match
  initialGames:  Game[]
  tournament:    Tournament
  backHref?:     string
  groupName?:    string | null
  matchKind?:    'knockout' | 'round_robin'
}

export function MatchScoringClient({ initialMatch, initialGames, tournament, backHref, groupName, matchKind = 'knockout' }: MatchScoringClientProps) {
  const [match, setMatch]   = useState<Match>(initialMatch)
  const [games, setGames]   = useState<Game[]>(initialGames)
  const [scores, setScores] = useState<Record<number, LocalScore>>(
    () => initialGames.reduce<Record<number, LocalScore>>((acc, g) => {
      acc[g.game_number] = { s1: String(g.score1 ?? ''), s2: String(g.score2 ?? '') }
      return acc
    }, {}),
  )
  const [isPending, startTransition] = useTransition()
  const { setLoading }               = useLoading()
  const router                       = useRouter()
  const supabase                     = createClient()

  // Effective format: per-match override or tournament default
  const tournamentFormat = (['bo1', 'bo3', 'bo5', 'bo7'] as MatchFormat[]).includes(tournament.format as MatchFormat)
    ? tournament.format as MatchFormat
    : 'bo5'
  const [activeFormat, setActiveFormat] = useState<MatchFormat>(() => {
    const perMatch = (match as unknown as { match_format?: MatchFormat | null }).match_format
    return (['bo1', 'bo3', 'bo5', 'bo7'] as MatchFormat[]).includes(perMatch as MatchFormat)
      ? perMatch as MatchFormat
      : tournamentFormat
  })

  // Sync games from server on re-render
  useEffect(() => {
    if (initialGames.length === 0) return
    setGames(prev => {
      let next = [...prev]
      for (const sg of initialGames) {
        const optIdx  = next.findIndex(g => g.game_number === sg.game_number && g.id.startsWith('optimistic-'))
        const realIdx = next.findIndex(g => g.id === sg.id)
        if (optIdx !== -1)       next[optIdx] = sg
        else if (realIdx === -1) next.push(sg)
        else                     next[realIdx] = sg
      }
      return next.sort((a, b) => a.game_number - b.game_number)
    })
  }, [initialGames])

  useEffect(() => {
    setMatch(prev => ({ ...prev, ...initialMatch }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMatch.status, initialMatch.player1_games, initialMatch.player2_games, initialMatch.winner_id])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`admin-match-${match.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
        (p) => setMatch(prev => ({ ...prev, ...p.new as Partial<Match> })))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'games', filter: `match_id=eq.${match.id}` },
        (p) => {
          const g = p.new as Game
          setGames(prev => {
            const filtered = prev.filter(x => x.game_number !== g.game_number || x.id === g.id)
            return filtered.find(x => x.id === g.id) ? filtered : [...filtered, g].sort((a, b) => a.game_number - b.game_number)
          })
          setScores(prev => ({ ...prev, [g.game_number]: { s1: String(g.score1 ?? ''), s2: String(g.score2 ?? '') } }))
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `match_id=eq.${match.id}` },
        (p) => {
          const g = p.new as Game
          setGames(prev => prev.map(x => x.id === g.id ? { ...x, ...g } : x))
          setScores(prev => ({ ...prev, [g.game_number]: { s1: String(g.score1 ?? ''), s2: String(g.score2 ?? '') } }))
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'games', filter: `match_id=eq.${match.id}` },
        (p) => {
          const del = p.old as { id: string; game_number: number }
          setGames(prev => prev.filter(x => x.id !== del.id))
          setScores(prev => { const n = { ...prev }; delete n[del.game_number]; return n })
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id])

  // Format change
  const handleFormatChange = (fmt: MatchFormat) => {
    setActiveFormat(fmt)
    setLoading(true)
    startTransition(async () => {
      const res = await updateMatchFormat(match.id, fmt)
      setLoading(false)
      if (!res.success) {
        toast({ title: 'Could not update format', description: res.error, variant: 'destructive' })
        setActiveFormat((match as unknown as { match_format?: MatchFormat | null }).match_format ?? tournamentFormat)
      } else {
        toast({ title: `Format: ${FORMAT_CONFIGS[fmt].label}` })
      }
    })
  }

  const cfg        = FORMAT_CONFIGS[activeFormat as keyof typeof FORMAT_CONFIGS] ?? FORMAT_CONFIGS.bo5
  const sport: SportType = (['badminton', 'carrom', 'chess'] as SportType[]).includes(tournament.sport_type as SportType)
    ? (tournament.sport_type as SportType) : 'table_tennis'
  const isChess  = sport === 'chess'
  const isCarrom = sport === 'carrom'
  const sportRules = SPORT_RULES[sport]
  const ui = sportUi(sport)
  const isTeamSub  = (match as unknown as { match_kind?: string }).match_kind === 'team_submatch'
  const _ep1       = match.player1_id ?? (isTeamSub ? 'TEAM_A' : null)
  const _ep2       = match.player2_id ?? (isTeamSub ? 'TEAM_B' : null)
  const matchState = isChess
    ? computeChessMatchState(games, _ep1, _ep2)
    : isCarrom
    ? computeCarromMatchState(games, tournament, _ep1, _ep2)
    : computeMatchState(games, activeFormat, _ep1, _ep2)
  const gameNumbers = inferGameNumbersToShow(games, activeFormat, _ep1, _ep2)
  const isComplete = match.status === 'complete'
  const isLive     = match.status === 'live'
  const p1 = match.player1
  const p2 = match.player2

  const handleScoreChange = (gameNum: number, player: 1 | 2, value: string) => {
    setScores(prev => ({
      ...prev,
      [gameNum]: { ...(prev[gameNum] ?? { s1: '', s2: '' }), [player === 1 ? 's1' : 's2']: value },
    }))
  }

  // Bulk save all filled scores
  const handleSaveAll = useCallback(() => {
    const toSave: Array<{ gameNum: number; s1: number; s2: number }> = []
    for (const gameNum of gameNumbers) {
      const local = scores[gameNum]
      if (!local || (local.s1 === '' && local.s2 === '')) continue
      if (local.s1 === '' || local.s2 === '') {
        toast({ title: 'Incomplete score', description: `Game ${gameNum}: fill both scores.`, variant: 'destructive' })
        return
      }
      const s1 = parseInt(local.s1, 10)
      const s2 = parseInt(local.s2, 10)
      if (isNaN(s1) || isNaN(s2)) {
        toast({ title: 'Invalid number', description: `Game ${gameNum}: enter valid scores.`, variant: 'destructive' })
        return
      }
      const vr = validateGameScore({ score1: s1, score2: s2 }, sport)
      if (!vr.ok) {
        const msg = vr.errors[0]?.message ?? 'invalid score'
        toast({ title: `Game ${gameNum} invalid`, description: msg, variant: 'destructive' })
        return
      }
      toSave.push({ gameNum, s1, s2 })
    }
    if (toSave.length === 0) {
      toast({ title: 'No scores to save', description: 'Enter at least one game score.' })
      return
    }
    // Optimistic update — show scores immediately in the UI
    for (const { gameNum, s1, s2 } of toSave) {
      setGames(prev => {
        const fake: Game = {
          id: `optimistic-${gameNum}`, match_id: match.id, game_number: gameNum,
          score1: s1, score2: s2,
          winner_id: s1 > s2 ? (match.player1_id ?? '') : (match.player2_id ?? ''),
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        const ex = prev.find(g => g.game_number === gameNum)
        return ex ? prev.map(g => g.game_number === gameNum ? { ...g, ...fake } : g) : [...prev, fake].sort((a, b) => a.game_number - b.game_number)
      })
    }
    setLoading(true)
    startTransition(async () => {
      // Single bulk call — 4 DB round-trips regardless of number of games
      const res = await bulkSaveGameScores(
        match.id,
        toSave.map(({ gameNum, s1, s2 }) => ({ gameNumber: gameNum, score1: s1, score2: s2 })),
      )
      setLoading(false)
      if (!res.success) {
        toast({ title: 'Save failed', description: res.error, variant: 'destructive' })
        return
      }
      toast({ title: `${toSave.length} game${toSave.length > 1 ? 's' : ''} saved ✓` })
      router.refresh()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, gameNumbers, match.id])

  const handleDeleteGame = useCallback((gameNum: number) => {
    setLoading(true)
    startTransition(async () => {
      const res = await deleteGameScore(match.id, gameNum)
      setLoading(false)
      if (!res.success) {
        toast({ title: 'Delete failed', description: res.error, variant: 'destructive' })
      } else {
        setScores(prev => { const n = { ...prev }; delete n[gameNum]; return n })
        toast({ title: `Game ${gameNum} removed` })
        router.refresh()
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id])

  const [declareReason, setDeclareReason] = useState<'walkover' | 'injury' | 'declared'>('walkover')
  // 'p1' or 'p2' — using slot key, NOT the DB player ID (which can be null for team subs)
  const [selectedWinnerSlot, setSelectedWinnerSlot] = useState<'p1' | 'p2' | null>(null)
  
  const handleDeclareWinner = (winnerId: string) => {
    setLoading(true)
    startTransition(async () => {
      const res = await declareMatchWinner(match.id, winnerId, declareReason)
      setLoading(false)
      if (!res.success) toast({ title: 'Error', description: res.error, variant: 'destructive' })
      else { toast({ title: 'Winner declared ✓' }); router.refresh() }
    })
  }

  const hasDirty = gameNumbers.some(gn => {
    const local = scores[gn]
    if (!local || (local.s1 === '' && local.s2 === '')) return false
    const saved = games.find(g => g.game_number === gn)
    if (!saved) return true
    return String(saved.score1 ?? '') !== local.s1 || String(saved.score2 ?? '') !== local.s2
  })

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-black/10" style={{ background: ui.hex }}>
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-3 sm:px-4">
          <Link
            href={backHref ?? `/admin/tournaments/${tournament.id}?tab=stages`}
            className="flex items-center gap-2 text-white bg-white/20 hover:bg-white/30 active:bg-white/40 border border-white/30 transition-colors rounded-xl px-4 py-2.5 font-bold text-sm shrink-0 touch-manipulation min-h-[44px] min-w-[80px]"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={cn(
              'shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border',
              matchKind === 'round_robin'
                ? 'bg-blue-100/20 border-blue-200/40 text-blue-100'
                : 'bg-white/10 border-white/30 text-white/90',
            )}>
              {matchKind === 'round_robin' ? 'RR' : 'KO'}
            </span>
            <span className="font-display font-medium tracking-wide text-sm truncate text-white">
              {groupName
                ? `${groupName} · Match ${match.match_number}`
                : (match.round_name ?? `Round ${match.round}`)
              }
            </span>
          </div>
          <div className="shrink-0">
            {isLive && <LiveBadge />}
            {isComplete && (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Done
              </Badge>
            )}
          </div>
        </div>
        {/* Sport + target context — always visible so an operator scoring
            multiple sports never mis-keys a threshold (11 vs 21 points) */}
        <div className="px-4 pb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
          <span>{sport === 'badminton' ? '🏸 Badminton' : sport === 'carrom' ? '🔘 Carrom' : sport === 'chess' ? '♟️ Chess' : '🏓 Table Tennis'}</span>
          <span className="text-white/40">·</span>
          {isChess ? (
            <span>Single decisive game</span>
          ) : isCarrom ? (
            <span>Race to {tournament.carrom_board_target ?? sportRules.boardTarget} pts · {tournament.carrom_max_boards ?? sportRules.maxBoards} boards</span>
          ) : (
            <>
              <span>{FORMAT_CONFIGS[activeFormat].label}</span>
              <span className="text-white/40">·</span>
              <span>Race to {sportRules.unitWinThreshold}</span>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-6">
        <div className="surface-card p-4 sm:p-6 flex flex-col gap-5">

          {/* Scoreboard */}
          <ScoreboardHeader match={match} matchState={matchState} activeFormat={activeFormat} isComplete={isComplete} isLive={isLive} ui={ui} sport={sport} />

          {/* Format selector — rally sports only (chess is single-game, carrom uses board-target config, not bo-N) */}
          {!isComplete && !isChess && !isCarrom && (
            <div className="flex items-center gap-3 px-1 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground shrink-0">Format:</span>
              <div className="flex gap-1.5 flex-wrap">
                {(['bo1', 'bo3', 'bo5', 'bo7'] as MatchFormat[]).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => activeFormat !== fmt && handleFormatChange(fmt)}
                    disabled={isPending || isComplete}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
                      activeFormat === fmt
                        ? `${ui.bgSolid} text-white ${ui.border}`
                        : `bg-card border-border text-muted-foreground ${ui.hoverBorder} hover:text-foreground`,
                    )}
                  >
                    {FORMAT_CONFIGS[fmt].label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground/60 hidden sm:block">
                First to {cfg.gamesNeeded} games wins (race to {sportRules.unitWinThreshold} pts) · up to {cfg.maxGames} games
              </span>
            </div>
          )}

          {/* No players yet */}
          {(!p1 && !p2 && !isTeamSub) && (
            <div className="info-banner">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              Waiting for both players to be determined before scores can be entered.
            </div>
          )}

          {/* Chess: single decisive game — Win/Draw/Loss picker */}
          {isChess && (p1 || p2) && (
            <ChessResultPanel
              matchId={match.id} p1={p1} p2={p2} games={games} isComplete={isComplete}
              isPending={isPending} ui={ui} startTransition={startTransition} setLoading={setLoading} router={router}
            />
          )}

          {/* Carrom: board-by-board winner + points entry, racing to the tournament's target */}
          {isCarrom && (p1 || p2) && (
            <CarromBoardPanel
              matchId={match.id} p1={p1} p2={p2} games={games} tournament={tournament}
              isComplete={isComplete} isPending={isPending} ui={ui}
              startTransition={startTransition} setLoading={setLoading} router={router}
            />
          )}

          {/* Game score entry — rally sports (table tennis / badminton) */}
          {!isChess && !isCarrom && (p1 || p2 || isTeamSub || games.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Game Scores</span>
                  <span className="text-xs font-normal text-muted-foreground font-sans">
                    To {sportRules.unitWinThreshold} points · win by 2
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {/* Column header */}
                <div className="grid grid-cols-[28px_1fr_14px_1fr_44px] sm:grid-cols-[36px_1fr_16px_1fr_52px] gap-1.5 sm:gap-2 items-center pb-2 px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">#</span>
                  <span className="text-xs font-medium text-foreground text-center truncate">{playerDisplayName(p1)}</span>
                  <span />
                  <span className="text-xs font-medium text-foreground text-center truncate">{playerDisplayName(p2)}</span>
                  <span />
                </div>

                {gameNumbers.map(gameNum => (
                  <GameRow
                    key={gameNum}
                    gameNum={gameNum}
                    savedGame={games.find(g => g.game_number === gameNum) ?? null}
                    localScore={scores[gameNum] ?? { s1: '', s2: '' }}
                    match={match}
                    matchState={matchState}
                    activeFormat={activeFormat}
                    sport={sport}
                    ui={ui}
                    isMatchComplete={isComplete}
                    isTeamSubmatch={isTeamSub}
                    isPending={isPending}
                    onScoreChange={handleScoreChange}
                    onDelete={handleDeleteGame}
                    onReset={(gn) => {
                      const saved = games.find(g => g.game_number === gn)
                      if (saved) setScores(prev => ({ ...prev, [gn]: { s1: String(saved.score1 ?? ''), s2: String(saved.score2 ?? '') } }))
                    }}
                  />
                ))}

                {/* Bulk save button — always available for editing */}
                <div className="pt-3 border-t border-border/40 mt-2 flex flex-col gap-2">
                  <Button
                    className="w-full gap-2 font-bold text-sm"
                    style={{ background: ui.hex, color: '#fff' }}
                    onClick={handleSaveAll}
                    disabled={isPending}
                  >
                    <Save className="h-4 w-4" />
                    {isComplete ? 'Update Scores' : 'Save All Scores'}
                  </Button>
                  {!hasDirty && games.length > 0 && (
                    <p className="text-[11px] text-center text-muted-foreground">All scores saved</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Declare winner — select player, then confirm */}
          {!isComplete && (p1 && p2) && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Declare Match Winner</p>
                <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-0.5">
                  For walkover, injury, or forfeit — no game scores required.
                </p>
              </div>

              {/* Reason */}
              <div className="flex gap-2 flex-wrap">
                {(['walkover', 'injury', 'declared'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setDeclareReason(r)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold border transition-colors capitalize',
                      declareReason === r
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-card border-border text-muted-foreground hover:border-amber-400',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Step 1: tap a player to select them */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { slot: 'p1' as const, player: p1, dbId: match.player1_id },
                  { slot: 'p2' as const, player: p2, dbId: match.player2_id },
                ] as const).map(({ slot, player, dbId }) => {
                  const isSelected = selectedWinnerSlot === slot
                  return (
                    <button
                      key={slot}
                      onClick={() => setSelectedWinnerSlot(isSelected ? null : slot)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-colors',
                        isSelected
                          ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/40'
                          : 'border-border bg-card hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20',
                      )}
                    >
                      <Trophy className={cn('h-4 w-4', isSelected ? 'text-amber-500' : 'text-muted-foreground/40')} />
                      <span className={cn('font-semibold text-sm truncate max-w-full', isSelected ? 'text-amber-800 dark:text-amber-300' : 'text-foreground')}>
                        {player?.name ?? 'TBD'}
                      </span>
                      <span className={cn('text-[10px]', isSelected ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground')}>
                        {isSelected ? '✓ selected' : 'tap to select'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Step 2: confirm — enabled only when a slot is selected */}
              <Button
                className="w-full gap-2 font-bold"
                style={selectedWinnerSlot ? { background: ui.hex, color: '#fff' } : undefined}
                variant={selectedWinnerSlot ? 'default' : 'outline'}
                onClick={() => {
                  if (!selectedWinnerSlot) return
                  const dbId = selectedWinnerSlot === 'p1' ? match.player1_id : match.player2_id
                  // For team submatches player IDs are null in DB — pass the slot key instead
                  handleDeclareWinner(dbId ?? selectedWinnerSlot)
                }}
                disabled={isPending || !selectedWinnerSlot}
              >
                <Trophy className="h-4 w-4" />
                {selectedWinnerSlot
                  ? `Declare Winner · ${declareReason}`
                  : 'Select a player first'
                }
              </Button>
            </div>
          )}

          {/* Winner celebration (or draw, chess only) */}
          {isComplete && (match.winner || isTeamSub || (isChess && matchState.outcome === 'draw')) && (
            <div className={cn('rounded-2xl border p-6 text-center animate-fade-in', ui.borderLight, ui.bgLight)}>
              {matchState.outcome === 'draw' ? (
                <span className="text-3xl mx-auto mb-3 block">🤝</span>
              ) : (
                <Trophy className="h-8 w-8 text-amber-400 mx-auto mb-3" />
              )}
              <p className="font-display text-2xl font-bold tracking-wide">
                {matchState.outcome === 'draw'
                  ? 'Draw'
                  : isTeamSub
                  ? (matchState.outcome === 'player1_wins' ? playerDisplayName(p1) : playerDisplayName(p2))
                  : playerDisplayName(match.winner)
                }
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isCarrom ? `${matchState.player1Points ?? 0}–${matchState.player2Points ?? 0} pts` : `${match.player1_games}–${match.player2_games}`} ·{' '}
                {matchKind === 'round_robin' ? 'match complete' : isTeamSub ? 'sub-match complete' : 'advances to next round'}
              </p>
              <Link
                href={backHref ?? `/admin/tournaments/${tournament.id}?tab=stages`}
                className={cn('mt-4 inline-flex items-center gap-2 rounded-lg text-background font-semibold text-sm px-4 py-2 transition-colors', ui.bgSolid, ui.hoverBgSolid)}
              >
                <ArrowLeft className="h-4 w-4" />
                {matchKind === 'round_robin' ? 'Back to Groups' : 'Back to Bracket'}
              </Link>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

// ── ScoreboardHeader ──────────────────────────────────────────────────────────

function ScoreboardHeader({ match, matchState, activeFormat, isComplete, isLive, ui, sport }: {
  match:        Match
  matchState:   ComputedMatchState
  activeFormat: MatchFormat
  isComplete:   boolean
  isLive:       boolean
  ui:           SportUiClasses
  sport:        SportType
}) {
  const isTeamSub  = (match as unknown as { match_kind?: string }).match_kind === 'team_submatch'
  const p1Win      = isComplete && (isTeamSub ? matchState.outcome === 'player1_wins' : match.winner_id === match.player1_id)
  const p2Win      = isComplete && (isTeamSub ? matchState.outcome === 'player2_wins' : match.winner_id === match.player2_id)
  const isChess    = sport === 'chess'
  const isCarrom   = sport === 'carrom'
  const isDraw     = isChess && matchState.outcome === 'draw'

  // Carrom's headline number is cumulative BOARD POINTS (what decides the
  // match), not boards-won-count. Chess shows a simple 1/½/0 result.
  const bigLeft  = isCarrom ? (matchState.player1Points ?? 0) : isChess ? (isDraw ? '½' : matchState.player1Games) : matchState.player1Games
  const bigRight = isCarrom ? (matchState.player2Points ?? 0) : isChess ? (isDraw ? '½' : matchState.player2Games) : matchState.player2Games
  const leftAhead  = isCarrom ? (matchState.player1Points ?? 0) > (matchState.player2Points ?? 0) : matchState.player1Games > matchState.player2Games
  const rightAhead = isCarrom ? (matchState.player2Points ?? 0) > (matchState.player1Points ?? 0) : matchState.player2Games > matchState.player1Games

  const badgeLabel = isChess ? 'Single Game' : isCarrom ? `${matchState.player1Games}–${matchState.player2Games} boards` : FORMAT_CONFIGS[activeFormat].label

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 px-3 sm:px-5 py-4 sm:py-6">
        <PlayerCol player={match.player1} games={matchState.player1Games} isWinner={p1Win} side="left" />
        <div className="flex flex-col items-center gap-1.5">
          <div className="font-display text-3xl sm:text-5xl font-black tracking-tight tabular-nums leading-none">
            <span className={cn(leftAhead ? 'text-foreground' : rightAhead ? 'text-muted-foreground/50' : 'text-foreground')}>
              {bigLeft}
            </span>
            <span className="text-muted-foreground/30 mx-1 text-2xl">–</span>
            <span className={cn(rightAhead ? 'text-foreground' : leftAhead ? 'text-muted-foreground/50' : 'text-foreground')}>
              {bigRight}
            </span>
          </div>
          <span className={cn(
            'text-xs uppercase tracking-widest font-bold px-3 py-1 rounded-full',
            isComplete
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
              : isLive
              ? `${ui.bgLight} ${ui.text}`
              : 'bg-muted text-muted-foreground',
          )}>
            {badgeLabel}
          </span>
        </div>
        <PlayerCol player={match.player2} games={matchState.player2Games} isWinner={p2Win} side="right" />
      </div>
      {isLive     && <div className="h-1 bg-gradient-to-r from-cyan-500/30 via-cyan-400 to-cyan-500/30 animate-pulse-slow" />}
      {isComplete && <div className={cn('h-1', ui.bgSolid, 'opacity-70')} />}
    </div>
  )
}

function PlayerCol({ player, games, isWinner, side }: {
  player?:  { name: string; seed?: number | null } | null
  games:    number
  isWinner: boolean
  side:     'left' | 'right'
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', side === 'right' ? 'items-end text-right' : 'items-start')}>
      {player?.seed && <span className="seed-badge">{player.seed}</span>}
      <span className={cn(
        'font-display tracking-wide text-sm sm:text-base leading-tight truncate max-w-full transition-colors',
        isWinner
          ? 'font-bold text-foreground'
          : 'font-normal text-muted-foreground',
      )}>
        {player?.name ?? 'TBD'}
      </span>
      {isWinner && (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
          🏆 Winner
        </span>
      )}
    </div>
  )
}

// ── GameRow ───────────────────────────────────────────────────────────────────

function GameRow({
  gameNum, savedGame, localScore, match, matchState, activeFormat, sport, ui,
  isMatchComplete, isTeamSubmatch, isPending,
  onScoreChange, onDelete, onReset,
}: {
  gameNum:         number
  savedGame:       Game | null
  localScore:      LocalScore
  match:           Match
  matchState:      ComputedMatchState
  sport:           SportType
  ui:              SportUiClasses
  activeFormat:    MatchFormat
  isMatchComplete: boolean
  isTeamSubmatch:  boolean
  isPending:       boolean
  onScoreChange:   (n: number, p: 1 | 2, v: string) => void
  onDelete:        (n: number) => void
  onReset:         (n: number) => void
}) {
  const s1 = parseInt(localScore.s1, 10)
  const s2 = parseInt(localScore.s2, 10)
  const bothFilled = localScore.s1 !== '' && localScore.s2 !== ''
  const hasNumbers = !isNaN(s1) && !isNaN(s2)
  const isDirty = savedGame
    ? String(savedGame.score1 ?? '') !== localScore.s1 || String(savedGame.score2 ?? '') !== localScore.s2
    : localScore.s1 !== '' || localScore.s2 !== ''

  const isAfterDeciding = matchState.decidingGame !== undefined && gameNum > matchState.decidingGame
  const isDeciding      = matchState.decidingGame === gameNum

  let scoreValid = true
  let scoreErrorMsg = ''
  if (bothFilled && hasNumbers) {
    const vr = validateGameScore({ score1: s1, score2: s2 }, sport)
    scoreValid = vr.ok
    if (!vr.ok) scoreErrorMsg = vr.errors[0]?.message ?? 'Invalid score'
  }

  const saved_p1Won = savedGame
    ? (isTeamSubmatch ? (savedGame.score1 ?? 0) > (savedGame.score2 ?? 0) : savedGame.winner_id === match.player1_id)
    : false
  const saved_p2Won = savedGame
    ? (isTeamSubmatch ? (savedGame.score2 ?? 0) > (savedGame.score1 ?? 0) : savedGame.winner_id === match.player2_id)
    : false

  if (isAfterDeciding && !savedGame) return null

  return (
    <div className={cn(
      'flex flex-col rounded-xl px-1 py-1 transition-colors',
      savedGame && 'bg-muted/20',
      isAfterDeciding && 'opacity-40 pointer-events-none',
      isDeciding && savedGame && cn('ring-1', ui.ringSoft),
    )}>
      <div className="grid grid-cols-[28px_1fr_12px_1fr_44px] sm:grid-cols-[36px_1fr_16px_1fr_52px] gap-1.5 sm:gap-2 items-center">
        <div className="flex justify-center">
          <span className={cn(
            'font-display text-xs font-bold w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            savedGame ? 'bg-muted text-foreground' : 'border border-border text-muted-foreground',
            isDeciding && savedGame ? cn(ui.bgSoft, ui.border, ui.text) : '',
          )}>
            {gameNum}
          </span>
        </div>
        <ScoreInput
          value={localScore.s1}
          onChange={v => onScoreChange(gameNum, 1, v)}
          isWinner={saved_p1Won}
          hasError={bothFilled && hasNumbers && !scoreValid}
          disabled={isAfterDeciding || (!match.player1_id && !isTeamSubmatch)}
          ui={ui}
        />
        <span className="text-muted-foreground text-center font-bold text-sm select-none">–</span>
        <ScoreInput
          value={localScore.s2}
          onChange={v => onScoreChange(gameNum, 2, v)}
          isWinner={saved_p2Won}
          hasError={bothFilled && hasNumbers && !scoreValid}
          disabled={isAfterDeciding || (!match.player2_id && !isTeamSubmatch)}
          ui={ui}
        />
        <div className="flex gap-1 justify-end">
          {savedGame && !isDirty && (
            <button
              onClick={() => onDelete(gameNum)}
              disabled={isPending}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete this game score"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {isDirty && savedGame && (
            <button
              onClick={() => onReset(gameNum)}
              title="Revert to saved"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors font-bold text-base"
            >
              ↺
            </button>
          )}
        </div>
      </div>
      {bothFilled && hasNumbers && !scoreValid && (
        <div className="mt-1.5 ml-10 flex items-start gap-1.5 rounded-lg bg-destructive/10 border border-destructive/40 px-2.5 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{scoreErrorMsg}</p>
        </div>
      )}
      {savedGame && (savedGame.score1 ?? 0) >= 10 && (savedGame.score2 ?? 0) >= 10 && (
        <div className="ml-10 mt-0.5">
          <span className="text-[10px] text-amber-400/70 font-medium uppercase tracking-widest">Deuce</span>
        </div>
      )}
    </div>
  )
}

// ── ScoreInput ────────────────────────────────────────────────────────────────

function ScoreInput({ value, onChange, isWinner, hasError, disabled, ui }: {
  value:    string
  onChange: (v: string) => void
  isWinner: boolean
  hasError: boolean
  disabled?: boolean
  ui:       SportUiClasses
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'w-full h-11 sm:h-10 rounded-lg border text-center font-display font-bold text-xl tabular-nums',
        'bg-muted/30 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ring touch-manipulation',
        isWinner && cn(ui.border, ui.text, ui.bgLight),
        hasError && !isWinner && 'border-destructive/60 bg-destructive/5 text-destructive',
        !isWinner && !hasError && 'border-border text-foreground',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      placeholder="–"
    />
  )
}

// ── ChessResultPanel ──────────────────────────────────────────────────────────
// Chess has no point tally — a match is a single decisive game, scored as a
// straight Win/Draw/Loss pick (see saveChessResult / computeChessMatchState).

function ChessResultPanel({ matchId, p1, p2, games, isComplete, isPending, ui, startTransition, setLoading, router }: {
  matchId: string
  p1?: { name: string } | null
  p2?: { name: string } | null
  games: Game[]
  isComplete: boolean
  isPending: boolean
  ui: SportUiClasses
  startTransition: (fn: () => void) => void
  setLoading: (v: boolean) => void
  router: ReturnType<typeof useRouter>
}) {
  const existing = games.find(g => g.game_number === 1)

  const pick = (outcome: 'player1_wins' | 'draw' | 'player2_wins') => {
    setLoading(true)
    startTransition(async () => {
      const res = await saveChessResult(matchId, outcome)
      setLoading(false)
      if (!res.success) toast({ title: 'Could not save result', description: res.error, variant: 'destructive' })
      else { toast({ title: 'Result saved ✓' }); router.refresh() }
    })
  }

  const clearResult = () => {
    setLoading(true)
    startTransition(async () => {
      const res = await deleteGameScore(matchId, 1)
      setLoading(false)
      if (!res.success) toast({ title: 'Could not clear result', description: res.error, variant: 'destructive' })
      else { toast({ title: 'Result cleared' }); router.refresh() }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Result</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isComplete && existing ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {existing.is_draw ? 'Game drawn' : 'Result recorded'}
            </p>
            <Button variant="outline" size="sm" onClick={clearResult} disabled={isPending} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Clear Result
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => pick('player1_wins')} disabled={isPending}
              className={cn('flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-colors', 'border-border bg-card hover:border-current', ui.text, ui.hoverBorder)}>
              <Trophy className="h-4 w-4" />
              <span className="text-xs font-semibold truncate max-w-full">{playerDisplayName(p1)}</span>
              <span className="text-[10px] text-muted-foreground">wins</span>
            </button>
            <button onClick={() => pick('draw')} disabled={isPending}
              className="flex flex-col items-center gap-1 rounded-xl border-2 border-border bg-card p-3 hover:border-muted-foreground/40 transition-colors">
              <span className="text-base">🤝</span>
              <span className="text-xs font-semibold">Draw</span>
              <span className="text-[10px] text-muted-foreground">½ – ½</span>
            </button>
            <button onClick={() => pick('player2_wins')} disabled={isPending}
              className={cn('flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-colors', 'border-border bg-card hover:border-current', ui.text, ui.hoverBorder)}>
              <Trophy className="h-4 w-4" />
              <span className="text-xs font-semibold truncate max-w-full">{playerDisplayName(p2)}</span>
              <span className="text-[10px] text-muted-foreground">wins</span>
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── CarromBoardPanel ──────────────────────────────────────────────────────────
// A carrom "board" is winner-take-all points (0-12), not two-sided rally
// scoring — entry is (which side won, how many points), one board at a time.

function CarromBoardPanel({ matchId, p1, p2, games, tournament, isComplete, isPending, ui, startTransition, setLoading, router }: {
  matchId: string
  p1?: { name: string } | null
  p2?: { name: string } | null
  games: Game[]
  tournament: Tournament
  isComplete: boolean
  isPending: boolean
  ui: SportUiClasses
  startTransition: (fn: () => void) => void
  setLoading: (v: boolean) => void
  router: ReturnType<typeof useRouter>
}) {
  const [winner, setWinner] = useState<'player1' | 'player2'>('player1')
  const [points, setPoints] = useState('')
  const rules = SPORT_RULES.carrom
  const cap = rules.maxPointsPerBoard ?? 12
  const sorted = [...games].sort((a, b) => a.game_number - b.game_number)
  const nextBoardNum = (sorted.length ? Math.max(...sorted.map(g => g.game_number)) : 0) + 1

  const addBoard = () => {
    const pts = parseInt(points, 10)
    if (isNaN(pts) || pts < 1 || pts > cap) {
      toast({ title: 'Invalid points', description: `Enter a value between 1 and ${cap}.`, variant: 'destructive' })
      return
    }
    setLoading(true)
    startTransition(async () => {
      const res = await saveCarromBoard(matchId, nextBoardNum, winner, pts)
      setLoading(false)
      if (!res.success) toast({ title: 'Could not save board', description: res.error, variant: 'destructive' })
      else { toast({ title: `Board ${nextBoardNum} saved ✓` }); setPoints(''); router.refresh() }
    })
  }

  const deleteBoard = (boardNum: number) => {
    setLoading(true)
    startTransition(async () => {
      const res = await deleteCarromBoard(matchId, boardNum)
      setLoading(false)
      if (!res.success) toast({ title: 'Could not delete board', description: res.error, variant: 'destructive' })
      else { toast({ title: `Board ${boardNum} removed` }); router.refresh() }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Boards</span>
          <span className="text-xs font-normal text-muted-foreground font-sans">
            Race to {tournament.carrom_board_target ?? rules.boardTarget} pts · max {tournament.carrom_max_boards ?? rules.maxBoards} boards
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sorted.map(g => {
          const p1Won = (g.score1 ?? 0) > 0
          return (
            <div key={g.game_number} className="flex items-center justify-between gap-2 rounded-lg bg-muted/20 px-3 py-2">
              <span className="text-xs font-bold text-muted-foreground w-14 shrink-0">Board {g.game_number}</span>
              <span className="flex-1 text-sm truncate">
                <span className={cn('font-semibold', p1Won ? ui.text : 'text-muted-foreground')}>{playerDisplayName(p1)}</span>
                {' vs '}
                <span className={cn('font-semibold', !p1Won ? ui.text : 'text-muted-foreground')}>{playerDisplayName(p2)}</span>
              </span>
              <span className={cn('font-display font-bold text-sm px-2 py-0.5 rounded-full', ui.bgLight, ui.text)}>
                +{p1Won ? g.score1 : g.score2}
              </span>
              <button onClick={() => deleteBoard(g.game_number)} disabled={isPending}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}

        {!isComplete && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border/40 mt-1">
            <p className="text-xs font-semibold text-muted-foreground">Board {nextBoardNum} winner</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setWinner('player1')}
                className={cn('rounded-lg border-2 px-3 py-2 text-sm font-semibold truncate transition-colors',
                  winner === 'player1' ? `${ui.border} ${ui.bgLight} ${ui.text}` : 'border-border text-muted-foreground')}>
                {playerDisplayName(p1)}
              </button>
              <button onClick={() => setWinner('player2')}
                className={cn('rounded-lg border-2 px-3 py-2 text-sm font-semibold truncate transition-colors',
                  winner === 'player2' ? `${ui.border} ${ui.bgLight} ${ui.text}` : 'border-border text-muted-foreground')}>
                {playerDisplayName(p2)}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="numeric" min={1} max={cap} value={points}
                onChange={e => setPoints(e.target.value)}
                placeholder={`Points (1–${cap})`}
                className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <Button onClick={addBoard} disabled={isPending || !points} className="gap-1.5" style={{ background: ui.hex, color: '#fff' }}>
                <Save className="h-3.5 w-3.5" /> Save Board
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
