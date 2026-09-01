'use client'
// cache-bust: 1773800313

import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn, playerDisplayName } from '@/lib/utils'
import { WinnerTrophy } from '@/components/shared/MatchUI'
import { InlineLoader } from '@/components/shared/GlobalLoader'
import { getRoundTab } from '@/lib/utils'
import type { Match, Game, SportType } from '@/lib/types'
import { MatchCard } from './MatchCard'
import { Check, Trophy, AlertTriangle } from 'lucide-react'
import { validateGameScore, formatValidationErrors } from '@/lib/scoring/engine'
import { SPORT_RULES, FORMAT_CONFIGS } from '@/lib/scoring/types'
import { toast } from '@/components/ui/toaster'
import { sportUi, sportEmoji, SPORT_CONFIG, type SportUiClasses } from '@/components/shared/SportBadge'

interface BracketViewProps {
  tournament:    { id: string; name: string; sport_type?: SportType }
  matches:       Match[]
  isAdmin?:      boolean
  isPending?:     boolean   // shows loading overlay while bracket is generating
  matchBasePath?: string   // override match href base, e.g. /admin/championships/cid/events/eid/match
  onMatchClick?: (match: Match) => void
}

export function BracketView({ tournament, matches, isAdmin, isPending, matchBasePath, onMatchClick }: BracketViewProps) {
  const sport: SportType = (['badminton', 'carrom', 'chess'] as SportType[]).includes(tournament.sport_type as SportType)
    ? (tournament.sport_type as SportType) : 'table_tennis'
  const isInlineScoreSport = sport === 'table_tennis' || sport === 'badminton'
  const ui = sportUi(sport)
  const latestRound = useMemo(() => {
    const live = matches.find(m => m.status === 'live')?.round
    if (live) return live
    const done = matches.filter(m => m.status === 'complete').map(m => m.round)
    if (done.length) return Math.max(...done)
    return 1
  }, [matches])

  const [activeRound, setActiveRound] = useState<number | null>(null)
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)

  if (!matches.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="text-5xl mb-3">{sportEmoji(sport)}</div>
        <p className="text-lg font-bold text-foreground">Groups not generated yet</p>
        {isAdmin && <p className="text-sm mt-1 text-muted-foreground">Add players and generate the bracket</p>}
      </div>
    )
  }

  const rounds        = groupByRound(matches)
  // The 3rd-place/bronze match lives in its own round after the Final, but
  // must not be counted when deriving "totalRounds" (used to label real
  // elimination rounds) or the sibling-pair connector geometry in FullBracket.
  const bronzeRound   = rounds.find(r => r.roundName === '3rd Place')
  const bracketRounds = bronzeRound ? rounds.filter(r => r !== bronzeRound) : rounds
  const totalRounds   = bracketRounds.length
  const displayRound  = activeRound ?? latestRound

  const roundTabs = rounds.map(r => ({
    round:     r.round,
    label:     r === bronzeRound ? '3rd Place' : getRoundTab(r.round, totalRounds),
    liveCount: r.matches.filter(m => m.status === 'live').length,
    isLatest:  r.round === latestRound,
  }))

  return (
    <div className="relative flex flex-col gap-4">
      {isPending && (
        <InlineLoader />
      )}

      {/* ── Round tabs ── */}
      <div
        className="flex items-end gap-1 overflow-x-auto pb-0 scrollbar-hide border-b-2"
        style={{ borderColor: ui.hex }}
      >
        {roundTabs.map(tab => {
          const isActive = displayRound === tab.round
          return (
            <button
              key={tab.round}
              onClick={() => setActiveRound(tab.round)}
              style={isActive
                ? { background: ui.hex, color: '#fff', border: `2px solid ${ui.hex}`, borderBottom: 'none' }
                : undefined}
              className={cn(
                // whitespace-nowrap so "Semi Finals" never wraps mid-word
                'shrink-0 px-4 pt-2.5 pb-2.5 text-sm font-bold transition-all rounded-t-lg whitespace-nowrap',
                !isActive && tab.isLatest && !activeRound
                  ? cn(ui.bgFaint, ui.text, 'border-2 border-b-0', ui.borderLight)
                  : !isActive
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-muted/40'
                  : '',
              )}
            >
              {tab.label}

              {/* Live count bubble */}
              {tab.liveCount > 0 && (
                <span
                  className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: isActive ? 'rgba(255,255,255,0.35)' : ui.hex, color: '#fff' }}
                >
                  {tab.liveCount}
                </span>
              )}

              {/* Dot: latest round, not yet chosen */}
              {tab.isLatest && !isActive && !activeRound && (
                <span
                  className="ml-1 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: ui.hex, verticalAlign: 'middle' }}
                />
              )}
            </button>
          )
        })}

        <div className="flex-1" />

        <button
          onClick={() => setActiveRound(-1)}
          style={displayRound === -1
            ? { background: ui.hex, color: '#fff', border: `2px solid ${ui.hex}`, borderBottom: 'none' }
            : undefined}
          className={cn(
            'shrink-0 px-4 pt-2.5 pb-2.5 text-sm font-bold transition-all rounded-t-lg whitespace-nowrap',
            displayRound !== -1 && 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          All Groups
        </button>
      </div>

      {/* ── Content ── */}
      {displayRound === -1 ? (
        <>
          <FullBracket rounds={bracketRounds} isAdmin={isAdmin} onMatchClick={onMatchClick} ui={ui} />
          {bronzeRound && (
            <div className="flex flex-col gap-2 pt-2 max-w-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                🥉 3rd Place Match
              </span>
              <DrawCard
                match={bronzeRound.matches[0]}
                isAdmin={isAdmin}
                ui={ui}
                onClick={onMatchClick && bronzeRound.matches[0].status !== 'bye' ? () => onMatchClick(bronzeRound.matches[0]) : undefined}
              />
            </div>
          )}
        </>
      ) : (
        <RoundList
          round={rounds.find(r => r.round === displayRound)!}
          isAdmin={isAdmin}
          sport={sport}
          matchBasePath={matchBasePath}
          onMatchClick={onMatchClick}
          expandedMatchId={expandedMatchId}
          onToggleExpand={(id) => setExpandedMatchId(prev => prev === id ? null : id)}
        />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
interface RoundGroup {
  round:     number
  roundName: string
  matches:   Match[]
}

function groupByRound(matches: Match[]): RoundGroup[] {
  const map = new Map<number, Match[]>()
  matches.forEach(m => {
    if (!map.has(m.round)) map.set(m.round, [])
    map.get(m.round)!.push(m)
  })
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([round, ms]) => ({
      round,
      roundName: ms[0].round_name ?? `Round ${round}`,
      matches:   ms.sort((a, b) => a.match_number - b.match_number),
    }))
}

// ── Full Draw horizontal scroll ───────────────────────────────────────────────
//
// Card sizing — deliberately wider so player names are always visible.
// Scores are shown in a small monospaced font to the right so they don't compete.
//
const CARD_W = 240   // px — mobile-friendly width
const CARD_H = 92    // px — enough height for two player rows + divider
const CONN_W = 30    // connector line width
const COL_PAD = 10   // gap between card edge and connector
const LEAF_GAP = 8   // px gap between adjacent cards in the first (leaf) column

// ── Column layout (computed from the tree, not a power-of-2 formula) ──────────
//
// Each match's vertical CENTER is the midpoint of its two feeder matches'
// centers (found via next_match_id/next_slot, never by array index) — the
// classic recursive bracket-tree layout. The leaf (first) column gets simple
// uniform spacing; every later column inherits its rhythm from its children.
// This is what makes every "V" elbow symmetric even when a round's match
// count isn't a clean half of the previous round's (byes, odd seed counts,
// group-stage carry-over, etc. all break the old Math.pow(2, roundIdx) math).
function computeColumnLayout(rounds: RoundGroup[]): Map<string, number> {
  const top = new Map<string, number>()
  if (rounds.length === 0) return top

  rounds[0].matches.forEach((m, i) => {
    top.set(m.id, i * (CARD_H + LEAF_GAP))
  })

  for (let k = 1; k < rounds.length; k++) {
    const feedersByNext = new Map<string, string[]>()
    for (let j = 0; j < k; j++) {
      for (const fm of rounds[j].matches) {
        if (!fm.next_match_id) continue
        const arr = feedersByNext.get(fm.next_match_id) ?? []
        arr.push(fm.id)
        feedersByNext.set(fm.next_match_id, arr)
      }
    }

    rounds[k].matches.forEach((m, i) => {
      const centers = (feedersByNext.get(m.id) ?? [])
        .map(id => top.get(id))
        .filter((v): v is number => v != null)
        .map(t => t + CARD_H / 2)

      if (centers.length > 0) {
        const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length
        top.set(m.id, avgCenter - CARD_H / 2)
      } else {
        // No feeder found (shouldn't normally happen) — stack after the
        // previous match in this same round rather than collapsing to 0.
        const prevId = rounds[k].matches[i - 1]?.id
        const prevTop = prevId ? (top.get(prevId) ?? 0) : -CARD_H - LEAF_GAP
        top.set(m.id, prevTop + CARD_H + LEAF_GAP)
      }
    })
  }

  return top
}

// ── Connector line (measured, not formula-based) ──────────────────────────────
//
// Why measured instead of computed-by-formula: the previous implementation
// derived every connector's start/end pixel purely from a doubling formula
// (Math.pow(2, roundIdx)) that only produces a clean symmetric tree when every
// round has EXACTLY half as many matches as the previous one, and when
// sibling matches are adjacent-by-index within their round. Neither is
// guaranteed — group-stage seeding, odd bracket sizes, and byes can all break
// those assumptions — which is exactly what caused the crooked, hard-to-follow
// lines. Measuring real DOM positions after layout and connecting by the
// match's actual `next_match_id` / `next_slot` (never by index) guarantees
// every line touches the correct box, at the correct row, pixel-perfectly.
interface Connector { x1: number; y1: number; x2: number; y2: number; live: boolean }

function FullBracket({ rounds, isAdmin, onMatchClick, ui }: {
  rounds:        RoundGroup[]
  isAdmin?:      boolean
  onMatchClick?: (match: Match) => void
  ui:            SportUiClasses
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cardRefs      = useRef<Map<string, HTMLDivElement>>(new Map())
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })

  const allMatches = useMemo(() => rounds.flatMap(r => r.matches), [rounds])
  const columnLayout = useMemo(() => computeColumnLayout(rounds), [rounds])
  const columnHeight = useMemo(() => {
    let max = 0
    for (const t of columnLayout.values()) max = Math.max(max, t + CARD_H)
    return max
  }, [columnLayout])

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const next: Connector[] = []

    for (const m of allMatches) {
      if (!m.next_match_id) continue
      const sourceEl = cardRefs.current.get(m.id)
      const destEl   = cardRefs.current.get(m.next_match_id)
      if (!sourceEl || !destEl) continue

      const sr = sourceEl.getBoundingClientRect()
      const dr = destEl.getBoundingClientRect()

      const x1 = sr.right - containerRect.left
      // Leave from the exact row of the player who is actually advancing
      // (winner_id — set for both 'complete' and auto-advanced 'bye'
      // matches), not the card's overall vertical center. Without this the
      // line visually detaches from the winner's name whenever a card's two
      // rows aren't perfectly symmetric around its center (e.g. a BYE row),
      // which is what made the elbows look crooked/unaligned. Fall back to
      // the card center only while the match is still undecided.
      const srcRowFrac = m.winner_id != null
        ? (m.winner_id === m.player1_id ? 0.25 : 0.75)
        : 0.5
      const y1 = sr.top + sr.height * srcRowFrac - containerRect.top
      const x2 = dr.left - containerRect.left
      // Land on the exact player row the winner slots into (top row for
      // next_slot 1, bottom row for next_slot 2) instead of the card's
      // overall center — this is what makes the destination touch-point
      // symmetric with the OTHER feeder line for that same match.
      const rowFrac = m.next_slot === 2 ? 0.75 : 0.25
      const y2 = dr.top + dr.height * rowFrac - containerRect.top

      next.push({ x1, y1, x2, y2, live: m.status === 'live' })
    }

    setConnectors(next)
    setSvgSize({ width: container.scrollWidth, height: container.scrollHeight })
  }, [allMatches])

  useLayoutEffect(() => {
    measure()
    // Fonts/images can shift layout slightly after first paint — remeasure
    // once more on the next frame to catch that, then keep in sync with
    // any further size changes (e.g. sidebar collapse, window resize).
    const raf = requestAnimationFrame(measure)
    const ro  = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  return (
    <div className="overflow-x-auto pb-4">
      <div ref={containerRef} className="relative flex min-w-max" style={{ alignItems: 'flex-start' }}>
        {/* Connector overlay — drawn from measured card positions, so it is
            always pixel-symmetric regardless of round sizes / match order. */}
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          width={svgSize.width}
          height={svgSize.height}
          style={{ overflow: 'visible' }}
        >
          {connectors.map((c, i) => {
            const midX = (c.x1 + c.x2) / 2
            return (
              <path
                key={i}
                d={`M ${c.x1} ${c.y1} H ${midX} V ${c.y2} H ${c.x2}`}
                fill="none"
                stroke={c.live ? ui.hex : 'currentColor'}
                strokeWidth={c.live ? 2 : 1}
                className={c.live ? undefined : 'text-border'}
                opacity={c.live ? 0.9 : 0.6}
              />
            )
          })}
        </svg>

        {rounds.map((round, roundIdx) => {
          const isLast     = roundIdx === rounds.length - 1
          const hasLive    = round.matches.some(m => m.status === 'live')
          const colWidth   = CARD_W + 8 + (isLast ? 0 : CONN_W + COL_PAD)

          return (
            <div key={round.round} className="flex flex-col" style={{ width: colWidth }}>
              {/* Round column header */}
              <div className="text-center py-2 px-3 mb-1">
                <span
                  className={cn(
                    'text-xs font-bold uppercase tracking-wider',
                    hasLive ? ui.text : 'text-muted-foreground',
                  )}
                >
                  {round.roundName}
                </span>
              </div>

              {/* Match column — each card is absolutely positioned at its
                  computed (tree-centered) top offset, so every column shares
                  the same coordinate space and elbows land symmetrically. */}
              <div className="relative" style={{ height: columnHeight }}>
                {round.matches.map(match => (
                  <div
                    key={match.id}
                    style={{
                      position:     'absolute',
                      top:          columnLayout.get(match.id) ?? 0,
                      left:         0,
                      right:        0,
                      paddingRight: isLast ? '0' : `${CONN_W + COL_PAD}px`,
                    }}
                  >
                    <div
                      ref={el => {
                        if (el) cardRefs.current.set(match.id, el)
                        else cardRefs.current.delete(match.id)
                      }}
                      style={{ width: CARD_W, paddingLeft: 4, paddingRight: 4 }}
                    >
                      <DrawCard
                        match={match}
                        isAdmin={isAdmin}
                        ui={ui}
                        onClick={onMatchClick && match.status !== 'bye' ? () => onMatchClick(match) : undefined}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── DrawCard — compact card used ONLY in the Full Draw view ───────────────────
//
// Design goals:
//  • Name is the primary element — large, never truncated by score
//  • Set score (games won) is small monospaced digits on the right
//  • Individual game point-scores are hidden here (too cramped)
//  • Completed cards get a clear grey background
//  • Trophy emoji for winner — no icon import needed
//
function DrawCard({ match, isAdmin, onClick, ui }: { match: Match; isAdmin?: boolean; onClick?: () => void; ui: SportUiClasses }) {
  const { player1, player2, player1_games, player2_games, status, winner_id } = match

  const isComplete = status === 'complete'
  const isLive     = status === 'live'
  const isBye      = status === 'bye'

  const p1Win = isComplete && winner_id === match.player1_id
  const p2Win = isComplete && winner_id === match.player2_id

  const cardClass = (isComplete || isBye)
    ? 'draw-card-complete'
    : isLive
    ? 'draw-card-live'
    : 'draw-card-pending'

  const Wrapper = onClick ? 'button' : 'div'
  const canScore = isAdmin && !isBye && (status === 'pending' || status === 'live')

  return (
    <div className={canScore ? 'score-cta-wrap relative' : 'relative'}>
      {canScore && (
        <div className="score-cta">
          <span
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg"
            style={{ background: ui.hex, pointerEvents: 'none' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Enter Score
          </span>
        </div>
      )}
      <Wrapper
        onClick={onClick}
        className={cn('w-full text-left block rounded-lg overflow-hidden transition-all duration-150 border-[1.5px]', cardClass, canScore && ui.hoverBorder)}
        style={{
          cursor:    onClick ? 'pointer' : 'default',
          minHeight: CARD_H,
        }}
      >
      <DrawPlayerRow
        player={player1}
        games={player1_games}
        isWinner={p1Win}
        isLoser={p2Win}
        showScore={isLive || isComplete}
        matchIsBye={isBye}
      />
      <div className="border-b border-border/30 mx-2" />
      <DrawPlayerRow
        player={player2}
        games={player2_games}
        isWinner={p2Win}
        isLoser={p1Win}
        showScore={isLive || isComplete}
        matchIsBye={isBye}
      />
      {isLive && (
        <div style={{
          height:     3,
          background: `linear-gradient(90deg,${ui.hex},${ui.hex}cc,${ui.hex})`,
          animation:  'animate-pulse-slow 2s ease-in-out infinite',
        }} />
      )}
    </Wrapper>
    </div>
  )
}

function DrawPlayerRow({ player, games, isWinner, isLoser, showScore, matchIsBye }: {
  player?:    { name?: string | null; seed?: number | null; partner_name?: string | null } | null
  games:      number
  isWinner:   boolean
  isLoser:    boolean
  showScore:  boolean
  matchIsBye: boolean
}) {
  const name  = (matchIsBye && !player?.name) ? 'BYE' : playerDisplayName(player?.name ? player as { name: string; partner_name?: string | null } : null)
  const isTbd = name === 'TBD'

  return (
    <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5" style={{ minHeight: 44 }}>
      {/* Left: trophy + seed + name */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {/* Trophy slot — fixed width to keep name column aligned */}
        <WinnerTrophy show={isWinner} size="md" />

        {/* Seed pill */}
        {player?.seed && (
          <span className="seed-badge shrink-0 text-[11px]">{player.seed}</span>
        )}

        {/* Name */}
        <span className={cn(
          'flex-1 min-w-0 text-[13px] sm:text-[15px] overflow-hidden text-ellipsis whitespace-nowrap leading-tight',
          isTbd          && 'text-muted-foreground/60 italic',
          isWinner       && 'font-bold text-foreground',
          isLoser        && 'text-muted-foreground',
          !isWinner && !isLoser && !isTbd && 'text-foreground',
        )}>
          {name}
        </span>
      </div>

      {/* Set score */}
      {showScore && (
        <span className={cn(
          'font-mono text-xs font-bold tabular-nums shrink-0',
          isWinner ? 'text-orange-600 dark:text-orange-400' :
          isLoser  ? 'text-muted-foreground/60' :
                     'text-muted-foreground',
        )}>
          {games}
        </span>
      )}
    </div>
  )
}

// ── Single-round list (tab view) ──────────────────────────────────────────────
function RoundList({ round, isAdmin, sport, matchBasePath, onMatchClick, expandedMatchId, onToggleExpand }: {
  round:           RoundGroup
  isAdmin?:        boolean
  sport?:          SportType
  matchBasePath?:  string
  onMatchClick?:   (match: Match) => void
  expandedMatchId?: string | null
  onToggleExpand?:  (id: string) => void
}) {
  if (!round) return null

  const ui = sportUi(sport)
  // Chess/Carrom have their own scoring UI that only exists on the full match
  // page — the inline scorer below only knows rally-point games.
  const isInlineScoreSport = sport === 'table_tennis' || sport === 'badminton' || !sport

  // Sort: live first, then pending, then completed (greyed at bottom)
  const sortedMatches = [...round.matches].sort((a, b) => {
    const order = (s: string) => s === 'live' ? 0 : s === 'pending' ? 1 : 2
    return order(a.status) - order(b.status)
  })
  const live      = round.matches.filter(m => m.status === 'live')
  const pending   = round.matches.filter(m => m.status === 'pending')
  const completed = round.matches.filter(m => m.status === 'complete' || m.status === 'bye')

  const card = (m: Match) => {
    const base      = matchBasePath ?? `/admin/tournaments/${m.tournament_id}/match`
    const isExpanded = expandedMatchId === m.id
    const isBye     = m.status === 'bye'
    const isComplete = m.status === 'complete'

    // Admin: show inline scorer, no navigation (rally sports only — chess/carrom
    // have their own scoring UI that only exists on the full match page)
    if (isAdmin && !isBye && !onMatchClick && isInlineScoreSport) {
      return (
        <div key={m.id} className="flex flex-col">
          <div className="relative">
            <MatchCard
              match={m}
              isAdmin={isAdmin}
              sportType={sport}
              // no href — scoring is inline
            />
            {/* Score / Edit button overlaid at bottom of card */}
            <button
              onClick={() => onToggleExpand?.(m.id)}
              className={cn(
                'absolute bottom-2 right-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors',
                isComplete
                  ? 'text-emerald-600 border-emerald-200 dark:border-emerald-800/40 bg-card hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  : cn(ui.text, ui.borderLight, 'bg-card', ui.hoverBorder),
              )}
            >
              {isExpanded ? 'Close ↑' : isComplete ? 'Edit →' : 'Score →'}
            </button>
          </div>
          {isExpanded && (
            <div className="border border-t-0 border-border/50 rounded-b-xl px-3 pb-3 pt-2 bg-card">
              <SingleMatchInlineScorer
                matchId={m.id}
                player1Name={playerDisplayName(m.player1)}
                player2Name={playerDisplayName(m.player2)}
                sport={sport ?? 'table_tennis'}
                onSaved={() => onToggleExpand?.(m.id)}
              />
            </div>
          )}
        </div>
      )
    }

    return (
      <MatchCard
        key={m.id}
        match={m}
        isAdmin={isAdmin}
        sportType={sport}
        onClick={onMatchClick && !isBye ? () => onMatchClick(m) : undefined}
        href={isAdmin ? `${base}/${m.id}` : undefined}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {live.length > 0 && (
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="live-dot" />
          <span className={cn('text-xs font-bold uppercase tracking-widest', ui.text)}>
            {live.length} on court
          </span>
        </div>
      )}
      {/* Sorted: live → pending → completed (greyed + pushed to bottom) */}
      {sortedMatches.map(m => card(m))}
    </div>
  )
}


// ── SingleMatchInlineScorer ────────────────────────────────────────────────────
// Inline scorer for KO bracket matches.
// Uses render-time validation (no scoreErrors state) and bulkSaveGameScores.

export function SingleMatchInlineScorer({ matchId, player1Name, player2Name, sport = 'table_tennis', onSaved }: {
  matchId:     string
  player1Name: string
  player2Name: string
  sport?:      SportType
  onSaved?:    () => void
}) {
  const sportRules = SPORT_RULES[sport]
  const ui = sportUi(sport)
  const router = useRouter()
  const [games,   setGames]   = useState<{id:string;game_number:number;score1:number;score2:number;winner_id:string|null}[]>([])
  const [local,   setLocal]   = useState<Record<number,{s1:string;s2:string}>>({})
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(true)
  const [format,  setFormat]  = useState<'bo1'|'bo3'|'bo5'|'bo7'>('bo5')
  const [matchStatus, setMatchStatus] = useState<string>('pending')
  const [p1Id,    setP1Id]    = useState<string|null>(null)
  const [p2Id,    setP2Id]    = useState<string|null>(null)
  const [saveError, setSaveError] = useState<string|null>(null)
  const sbRef = useRef<ReturnType<typeof import('@/lib/supabase/client').createClient> | null>(null)

  const getSb = useCallback(async () => {
    if (!sbRef.current) {
      const { createClient } = await import('@/lib/supabase/client')
      sbRef.current = createClient()
    }
    return sbRef.current!
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sb = await getSb()
      const [gRes, mRes] = await Promise.all([
        sb.from('games').select('*').eq('match_id', matchId).order('game_number'),
        sb.from('matches').select('match_format, player1_id, player2_id, status').eq('id', matchId).single(),
      ])
      const gs = gRes.data ?? []
      setGames(gs)
      const init: Record<number,{s1:string;s2:string}> = {}
      for (const g of gs) init[g.game_number] = { s1: String(g.score1 ?? ''), s2: String(g.score2 ?? '') }
      setLocal(init)
      setSaveError(null)
      if (mRes.data?.match_format) setFormat(mRes.data.match_format as 'bo1'|'bo3'|'bo5'|'bo7')
      if (mRes.data?.player1_id)   setP1Id(mRes.data.player1_id)
      if (mRes.data?.player2_id)   setP2Id(mRes.data.player2_id)
      if (mRes.data?.status)       setMatchStatus(mRes.data.status)
    } finally {
      setLoading(false)
    }
  }, [matchId, getSb])

  useEffect(() => { load() }, [load])

  const maxG = FORMAT_CONFIGS[format].maxGames

  const handleFormatChange = async (f: 'bo1'|'bo3'|'bo5'|'bo7') => {
    setFormat(f)
    const { updateMatchFormat } = await import('@/lib/actions/matches')
    await updateMatchFormat(matchId, f)
  }

  // Simple onChange — just update local state. Validation is render-time below.
  const handleChange = (gn: number, side: 's1'|'s2', val: string) =>
    setLocal(prev => ({ ...prev, [gn]: { ...prev[gn] ?? { s1:'', s2:'' }, [side]: val } }))

  const handleSave = async () => {
    setSaveError(null)
    const entries = Array.from({length:maxG},(_,i)=>i+1)
      .map(gn => ({gn, sc: local[gn]}))
      .filter(({sc}) => sc && !(sc.s1==='' && sc.s2===''))
    if (!entries.length) { setSaveError('Enter at least one game score'); return }
    for (const {gn, sc} of entries) {
      const s1 = parseInt(sc!.s1, 10), s2 = parseInt(sc!.s2, 10)
      if (isNaN(s1) || isNaN(s2)) { setSaveError(`Game ${gn}: enter valid numbers`); return }
      const vr = validateGameScore({ score1: s1, score2: s2 }, sport)
      if (!vr.ok) { setSaveError(`Game ${gn}: ${formatValidationErrors(vr)}`); return }
    }
    setSaving(true)
    const { bulkSaveGameScores } = await import('@/lib/actions/matches')
    const res = await bulkSaveGameScores(
      matchId,
      entries.map(({gn, sc}) => ({ gameNumber: gn, score1: parseInt(sc!.s1,10), score2: parseInt(sc!.s2,10) })),
      matchStatus === 'complete',
    )
    if (!res.success) { setSaveError(res.error); setSaving(false); return }
    
    // Show notification if any games were skipped due to match already being decided
    if (res.skippedCount > 0 && res.decidingGameNumber) {
      const gameText = res.skippedCount === 1 ? 'Game' : 'Games'
      const gameNums = Array.from({length: res.skippedCount}, (_, i) => res.decidingGameNumber! + i + 1).join(', ')
      toast({
        title: `${gameText} ${gameNums} not saved`,
        description: `Match winner was already decided at game ${res.decidingGameNumber}`,
        variant: 'warning',
      })
    }
    
    setSaving(false)
    await load()
    router.refresh()
    onSaved?.()
  }

  if (loading) return <div className="text-xs text-muted-foreground py-2">Loading…</div>

  // ── Render-time validation — computed fresh every render, zero lag ──────────
  const gameValidation: Record<number, { valid: boolean; errorMsg: string }> = {}
  for (let gn = 1; gn <= maxG; gn++) {
    const row = local[gn]
    const s1str = row?.s1 ?? '', s2str = row?.s2 ?? ''
    if (s1str !== '' && s2str !== '') {
      const s1 = parseInt(s1str, 10), s2 = parseInt(s2str, 10)
      if (!isNaN(s1) && !isNaN(s2)) {
        const vr = validateGameScore({ score1: s1, score2: s2 }, sport)
        gameValidation[gn] = { valid: vr.ok, errorMsg: vr.ok ? '' : vr.errors[0]?.message ?? 'Invalid score' }
      } else { gameValidation[gn] = { valid: true, errorMsg: '' } }
    } else { gameValidation[gn] = { valid: true, errorMsg: '' } }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Sport + format context */}
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
        <span>{sportEmoji(sport)} {SPORT_CONFIG[sport].label}</span>
        <span className="opacity-40">·</span>
        <span>Race to {sportRules.unitWinThreshold}</span>
      </div>

      {/* Format selector */}
      <div className="flex items-center gap-1 pt-1">
        {(['bo1','bo3','bo5','bo7'] as const).map(f => (
          <button key={f} onClick={() => handleFormatChange(f)}
            className={cn(
              'px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-colors',
              format === f ? cn(ui.bgSolid, 'text-white') : 'text-muted-foreground hover:text-foreground',
            )}>
            {FORMAT_CONFIGS[f].label}
          </button>
        ))}
      </div>

      {/* Score grid */}
      <div className="overflow-x-auto">
        <div className="grid gap-1" style={{gridTemplateColumns: `minmax(80px,1fr) repeat(${maxG}, 44px)`, minWidth: 'fit-content'}}>
          <div className="text-[10px] font-bold text-muted-foreground uppercase py-1">Player</div>
          {Array.from({length: maxG}, (_, i) => (
            <div key={i} className="text-[10px] text-center font-mono text-muted-foreground py-1 font-bold">G{i+1}</div>
          ))}
        {/* P1 */}
        <div className="text-xs font-semibold py-1 truncate self-center">{player1Name}</div>
        {Array.from({length: maxG}, (_, i) => {
          const gn = i + 1
          const stored = games.find(g => g.game_number === gn)
          const { valid } = gameValidation[gn]
          const won = stored ? stored.score1 > stored.score2 : false
          return (
            <input key={gn} type="number" min={0} max={99}
              value={local[gn]?.s1 ?? ''} disabled={saving}
              onChange={e => handleChange(gn, 's1', e.target.value)}
              className={cn(
                'w-full text-center text-sm font-bold py-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-2 [appearance:textfield]',
                ui.focusRing,
                !valid              ? 'border-red-400 bg-red-50/40 dark:bg-red-950/20' :
                won && stored       ? 'border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' :
                                      'border-border bg-background',
                saving && 'opacity-40',
              )}
            />
          )
        })}
        {/* P2 */}
        <div className="text-xs font-semibold py-1 truncate self-center">{player2Name}</div>
        {Array.from({length: maxG}, (_, i) => {
          const gn = i + 1
          const stored = games.find(g => g.game_number === gn)
          const { valid } = gameValidation[gn]
          const won = stored ? stored.score2 > stored.score1 : false
          return (
            <input key={gn} type="number" min={0} max={99}
              value={local[gn]?.s2 ?? ''} disabled={saving}
              onChange={e => handleChange(gn, 's2', e.target.value)}
              className={cn(
                'w-full text-center text-sm font-bold py-1.5 rounded-lg border transition-colors focus:outline-none focus:ring-2 [appearance:textfield]',
                ui.focusRing,
                !valid              ? 'border-red-400 bg-red-50/40 dark:bg-red-950/20' :
                won && stored       ? 'border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' :
                                      'border-border bg-background',
                saving && 'opacity-40',
              )}
            />
          )
        })}
      </div>
      </div>

      {/* Per-game validation errors — render-time, always current */}
      {Array.from({length: maxG}, (_, i) => {
        const gn = i + 1
        const { valid, errorMsg } = gameValidation[gn]
        if (valid || !errorMsg) return null
        return (
          <p key={gn} className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" /> Game {gn}: {errorMsg}
          </p>
        )
      })}

      {/* Save */}
      <div className="flex flex-col gap-1.5 pt-1">
        {saveError && (
          <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {saveError}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSave} disabled={saving}
            className={cn('px-4 py-1.5 rounded-lg text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5', ui.bgSolid, ui.hoverBgSolid)}>
            {saving ? <span className="tt-spinner tt-spinner-sm" /> : <Check className="h-3 w-3" />}
            {saving ? 'Saving…' : 'Save Scores'}
          </button>
          <button onClick={async () => {
            setSaving(true)
            const { declareMatchWinner } = await import('@/lib/actions/matches')
            await declareMatchWinner(matchId, p1Id ?? 'p1', 'declared')
            setSaving(false); await load(); router.refresh(); onSaved?.()
          }} disabled={saving || !p1Id}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:border-amber-400 hover:text-foreground transition-colors disabled:opacity-30 flex items-center gap-1">
            <Trophy className="h-3 w-3 text-amber-500" /> {player1Name} wins
          </button>
          <button onClick={async () => {
            setSaving(true)
            const { declareMatchWinner } = await import('@/lib/actions/matches')
            await declareMatchWinner(matchId, p2Id ?? 'p2', 'declared')
            setSaving(false); await load(); router.refresh(); onSaved?.()
          }} disabled={saving || !p2Id}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:border-amber-400 hover:text-foreground transition-colors disabled:opacity-30 flex items-center gap-1">
            <Trophy className="h-3 w-3 text-amber-500" /> {player2Name} wins
          </button>
        </div>
      </div>
    </div>
  )
}
