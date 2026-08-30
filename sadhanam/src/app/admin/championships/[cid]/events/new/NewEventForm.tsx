'use client'
// cache-bust: 1773842500

import { useState, useRef } from 'react'
import { useLoading } from '@/components/shared/GlobalLoader'
import Link from 'next/link'
import {
  Swords, Users, Layers, RotateCcw, GitBranch, Shield,
  Trophy, CalendarDays, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { sportUi } from '@/components/shared/SportBadge'
import type { SportType } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

const SPORT_EMOJI: Record<SportType, string> = {
  table_tennis: '🏓',
  badminton:    '🏸',
  carrom:       '🥌',
  chess:        '♟️',
}

const SPORT_LABEL: Record<SportType, string> = {
  table_tennis: 'Table Tennis',
  badminton:    'Badminton',
  carrom:       'Carrom',
  chess:        'Chess',
}

/** Sports that currently have team formats. Carrom/Chess are singles-only for now. */
const TEAM_SPORTS: SportType[] = ['table_tennis', 'badminton']

type FormatType =
  | 'single_knockout'
  | 'single_round_robin'
  | 'multi_rr_to_knockout'
  | 'pure_round_robin'
  | 'double_elimination'
  | 'team_league_ko'
  | 'team_league_swaythling'
  | 'team_group_corbillon'
  | 'team_group_swaythling'
  | 'team_thomas'
  | 'team_uber'
  | 'team_sudirman'

// ─── Date suffix ──────────────────────────────────────────────────────────────

function getDateSuffix(): string {
  const now = new Date()
  const dd  = String(now.getDate()).padStart(2, '0')
  const mm  = String(now.getMonth() + 1).padStart(2, '0')
  const yy  = String(now.getFullYear()).slice(-2)
  const hh  = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `${dd}${mm}${yy}-${hh}:${min}`
}

// ─── Format catalogue ─────────────────────────────────────────────────────────

type Category = 'singles' | 'teams'

interface FormatOption {
  value:       FormatType
  category:    Category
  /** Which sport(s) this format applies to. Singles formats are sport-neutral
   *  (only the scoring engine's point thresholds differ); team cup formats
   *  are sport-specific rubber orders and only apply to one sport each. */
  sports:      SportType[]
  icon:        React.ReactNode
  label:       string
  tagline:     string          // one-line in the picker list
  /** Plain-language structure, shown right under the label — e.g. "Men's
   *  Teams · 3 singles + 2 doubles". Mainly for team cup formats, whose
   *  label is a competition name (Thomas Cup, Corbillon Cup, …) that
   *  doesn't tell you anything on its own unless you already know that
   *  cup's rubber order. Keeps the picker skimmable without opening the
   *  detail pane. */
  structure?:  string
  description: string          // shown in the detail pane
  bullets:     string[]        // key facts shown in detail pane
  defaultName: string
  badge?:      string
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'single_knockout', category: 'singles', sports: ['table_tennis', 'badminton', 'carrom', 'chess'],
    icon: <Swords className="h-4 w-4" />,
    label: 'Knockout',
    tagline: 'Single-elimination bracket',
    description: 'The classic knockout format. One loss and you\'re out. Seeds are placed into the bracket so top players meet in the later rounds.',
    bullets: ['Draw supported (seeded & random)', 'Any number of players', 'Quickest format to complete', 'Best of 5 per match'],
    defaultName: 'Singles - Knockout',
  },
  {
    value: 'pure_round_robin', category: 'singles', sports: ['table_tennis', 'badminton', 'carrom', 'chess'],
    icon: <RotateCcw className="h-4 w-4" />,
    label: 'Round Robin',
    tagline: 'Everyone plays everyone',
    description: 'Every player faces every other player exactly once. Final standings are determined by wins, then game difference, then H2H.',
    bullets: ['ITTF-compliant tiebreakers', 'Guaranteed matches for all', 'Great for small groups', 'Full standings table'],
    defaultName: 'Singles - Round Robin',
  },
  {
    value: 'double_elimination', category: 'singles', sports: ['table_tennis', 'badminton', 'carrom', 'chess'],
    icon: <GitBranch className="h-4 w-4" />,
    label: 'Double Elimination',
    tagline: 'Two losses to be knocked out',
    description: 'Winners and Losers brackets run in parallel. A player must lose twice to be eliminated, giving a second chance to every participant.',
    bullets: ['Winners + Losers brackets', 'Grand Final with bracket reset', 'Fairer than single KO', 'Best of 5 per match'],
    defaultName: 'Singles - Double Elimination',
  },
  {
    value: 'single_round_robin', category: 'singles', sports: ['table_tennis', 'badminton', 'carrom', 'chess'],
    icon: <Users className="h-4 w-4" />,
    label: 'Round Robin + Knockout',
    tagline: 'Round-robin groups then knockout',
    description: 'Players are placed into round-robin groups. Top finishers from each group advance to a single-elimination knockout bracket.',
    bullets: ['Configure group count & size', 'Best third across groups option', 'Group standings + KO bracket', 'Most common tournament format'],
    defaultName: 'Singles - Round Robin + Knockout',
  },
  {
    value: 'multi_rr_to_knockout', category: 'singles', sports: ['table_tennis', 'badminton', 'carrom', 'chess'],
    icon: <Layers className="h-4 w-4" />,
    label: 'Round Robin + Knockout (Flexible)',
    tagline: 'Top N across all groups advance',
    description: 'Like Round Robin + Knockout, but advancement is based on overall ranking across all groups rather than per-group qualification.',
    bullets: ['Top N players across all groups advance', 'More balanced bracket seeding', 'Best-third handling built in', 'Configurable advance count'],
    defaultName: 'Singles - Round Robin + Knockout (Flexible)',
  },
  {
    value: 'team_league_ko', category: 'teams', sports: ['table_tennis', 'badminton'],
    icon: <Shield className="h-4 w-4" />,
    label: 'Knockout (Corbillon Cup)',
    tagline: '4 singles + 1 doubles · 2 players/team',
    structure: '2 players/team · 4 singles + 1 doubles',
    description: 'Team knockout using the Corbillon Cup rubber order. Each tie consists of 4 singles rubbers and 1 doubles rubber. First team to win 3 rubbers wins the tie.',
    bullets: ['Order: A×X, B×Y, Doubles A/B×X/Y, A×Y, B×X', '2 players per team (positions A and B)', 'Seeded bracket draw', 'Same scoring UI as Round Robin+KO'],
    defaultName: 'Teams - Knockout (Corbillon Cup)',
  },
  {
    value: 'team_league_swaythling', category: 'teams', sports: ['table_tennis'],
    icon: <Shield className="h-4 w-4" />,
    label: 'Knockout (Swaythling Cup)',
    tagline: '5 singles, no doubles · 3 players/team',
    structure: '3 players/team · 5 singles, no doubles',
    description: 'Team knockout using the Swaythling Cup rubber order. Each tie consists of 5 singles rubbers and no doubles. First team to win 3 rubbers wins the tie.',
    bullets: ['Order: A×X, B×Y, C×Z, A×Y, B×X', '3 players per team (positions A, B and C)', 'Seeded bracket draw', 'Same scoring UI as Round Robin+KO'],
    defaultName: 'Teams - Knockout (Swaythling Cup)',
  },
  {
    value: 'team_group_corbillon', category: 'teams', sports: ['table_tennis'],
    icon: <Shield className="h-4 w-4" />,
    label: 'Groups + Knockout (Corbillon Cup)',
    tagline: 'Groups stage then Corbillon KO',
    structure: '2 players/team · 4 singles + 1 doubles',
    description: 'Teams are seeded into round-robin groups. Top teams from each group advance to a Corbillon Cup knockout bracket (4 singles + 1 doubles).',
    bullets: ['Group stage + Corbillon KO bracket', '2 players per team', 'Configurable group size & advance count', 'Full group standings + KO draw'],
    defaultName: 'Teams - Groups + Knockout (Corbillon Cup)',
  },
  {
    value: 'team_group_swaythling', category: 'teams', sports: ['table_tennis'],
    icon: <Shield className="h-4 w-4" />,
    label: 'Groups + Knockout (Swaythling Cup)',
    tagline: 'Groups stage then Swaythling KO',
    structure: '3 players/team · 5 singles, no doubles',
    description: 'Teams are seeded into round-robin groups. Top teams from each group advance to a Swaythling Cup knockout bracket (5 singles, no doubles).',
    bullets: ['Group stage + Swaythling KO bracket', '3 players per team', 'Configurable group size & advance count', 'Full group standings + KO draw'],
    defaultName: 'Teams - Groups + Knockout (Swaythling Cup)',
  },
  {
    value: 'team_thomas', category: 'teams', sports: ['badminton'],
    icon: <Shield className="h-4 w-4" />,
    label: 'Thomas Cup (Men\'s Teams)',
    tagline: '3 singles + 2 doubles · knockout tie',
    structure: 'Men\'s teams · 3 singles + 2 doubles',
    description: 'Men\'s team knockout using the Thomas Cup rubber order. Each tie is 5 rubbers — 3 singles and 2 doubles. First team to win 3 rubbers wins the tie.',
    bullets: ['Order: MS1, MD1, MS2, MD2, MS3', 'BWF-style seeded bracket draw', 'Best of 3 games, race to 21', 'Same scoring UI as other team formats'],
    defaultName: 'Teams - Thomas Cup',
  },
  {
    value: 'team_uber', category: 'teams', sports: ['badminton'],
    icon: <Shield className="h-4 w-4" />,
    label: 'Uber Cup (Women\'s Teams)',
    tagline: '3 singles + 2 doubles · knockout tie',
    structure: 'Women\'s teams · 3 singles + 2 doubles',
    description: 'Women\'s team knockout using the Uber Cup rubber order. Each tie is 5 rubbers — 3 singles and 2 doubles. First team to win 3 rubbers wins the tie.',
    bullets: ['Order: WS1, WD1, WS2, WD2, WS3', 'BWF-style seeded bracket draw', 'Best of 3 games, race to 21', 'Same scoring UI as other team formats'],
    defaultName: 'Teams - Uber Cup',
  },
  {
    value: 'team_sudirman', category: 'teams', sports: ['badminton'],
    icon: <Shield className="h-4 w-4" />,
    label: 'Sudirman Cup (Mixed Teams)',
    tagline: '5 mixed rubbers · knockout tie',
    structure: 'Mixed teams · 1 of each: MD, WS, MS, WD, XD',
    description: 'Mixed team knockout using the Sudirman Cup rubber order. Each tie is 5 rubbers covering all five disciplines. First team to win 3 rubbers wins the tie.',
    bullets: ['Order: MD, WS, MS, WD, XD', 'One tie per round — every discipline played', 'Best of 3 games, race to 21', 'Same scoring UI as other team formats'],
    defaultName: 'Teams - Sudirman Cup',
  },
]

// team_league_ko's label/description reference "Corbillon Cup" — an ITTF
// (table tennis) trophy name. When the same 2-players-per-team knockout
// structure is used for badminton, show sport-neutral copy instead.
function displayFormat(opt: FormatOption, sport: SportType): FormatOption {
  if (opt.value === 'team_league_ko' && sport === 'badminton') {
    return {
      ...opt,
      label: 'Knockout (2 Players/Team)',
      description: 'Team knockout for 2-player badminton teams. Each tie consists of 4 singles rubbers and 1 doubles rubber. First team to win 3 rubbers wins the tie.',
      defaultName: 'Teams - Knockout (2 Players)',
    }
  }
  return opt
}

// Accent color is driven by SPORT (orange for table tennis, sky for
// badminton — see SportBadge.tsx), not by format. With 12 formats across
// 2 sports, giving each format its own hue competed with the sport color
// for attention and made "which sport am I in" harder to answer at a
// glance. Formats are still visually distinguished within a sport by
// their icon (Swords, Shield, GitBranch, …) and label — a lighter touch
// that doesn't fight the sport's identity color.

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  cid:          string
  createAction: (formData: FormData) => Promise<void>
}

export function NewEventForm({ cid, createAction }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [sport,       setSport]            = useState<SportType | null>(null)
  const [formatType,  setFormatTypeState] = useState<FormatType | null>(null)
  const [name,        setName]            = useState('')
  const [nameEdited,  setNameEdited]      = useState(false)
  const [date,        setDate]            = useState(today)
  const [activeTab,   setActiveTab]       = useState<Category>('singles')
  const [busy,        setBusy]            = useState(false)
  // Carrom-only config — organizer-configurable per event (see migration v14)
  const [isDoubles,        setIsDoubles]       = useState(false)
  const [carromPreset,     setCarromPreset]    = useState<'icf25' | 'club29' | 'custom'>('icf25')
  const [carromBoardTarget,setCarromBoardTarget] = useState(25)
  const [carromQueenValue, setCarromQueenValue]  = useState(3)
  const [carromMaxBoards,  setCarromMaxBoards]   = useState(8)

  const applyCarromPreset = (preset: 'icf25' | 'club29' | 'custom') => {
    setCarromPreset(preset)
    if (preset === 'icf25') { setCarromBoardTarget(25); setCarromQueenValue(3); setCarromMaxBoards(8) }
    else if (preset === 'club29') { setCarromBoardTarget(29); setCarromQueenValue(5); setCarromMaxBoards(4) }
  }
  const { setLoading } = useLoading()
  const formRef = useRef<HTMLFormElement>(null)

  const handleSelectFormat = (value: FormatType, forSport?: SportType | null) => {
    setFormatTypeState(value)
    if (!nameEdited) {
      const opt = FORMAT_OPTIONS.find(o => o.value === value)
      const activeSport = forSport ?? sport
      if (opt && activeSport) {
        const { defaultName } = displayFormat(opt, activeSport)
        setName(`${SPORT_LABEL[activeSport]} ${defaultName} ${getDateSuffix()}`)
      }
    }
  }

  const handleSelectSport = (value: SportType) => {
    setSport(value)
    // Carrom/Chess have no team formats yet — force back to Singles.
    const nextTab = TEAM_SPORTS.includes(value) ? activeTab : 'singles'
    setActiveTab(nextTab)
    // If the current format doesn't exist for the new sport (or no format has
    // been chosen yet, since sport starts unselected), fall back to the first
    // available format in the active category for that sport.
    const stillValid = formatType && FORMAT_OPTIONS.find(o => o.value === formatType)?.sports.includes(value)
    if (!stillValid) {
      const fallback = FORMAT_OPTIONS.find(o => o.category === nextTab && o.sports.includes(value))
        ?? FORMAT_OPTIONS.find(o => o.sports.includes(value))
      if (fallback) handleSelectFormat(fallback.value, value)
    }
  }

  const handleNameChange = (v: string) => { setName(v); setNameEdited(true) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formRef.current || !name.trim() || busy) return
    const fd = new FormData(formRef.current)
    setBusy(true); setLoading(true)
    try {
      await createAction(fd)
      setBusy(false); setLoading(false)
    } catch (err: unknown) {
      const digest = (err as { digest?: string })?.digest ?? ''
      if (digest.startsWith('NEXT_REDIRECT')) throw err
      setBusy(false); setLoading(false)
      toast({ title: 'Could not create event', description: err instanceof Error ? err.message : 'Unexpected error.', variant: 'destructive' })
    }
  }

  const selectedRaw = formatType ? FORMAT_OPTIONS.find(o => o.value === formatType) : undefined
  const selected    = selectedRaw && sport ? displayFormat(selectedRaw, sport) : undefined
  const accent      = sportUi(sport)
  const pillClass   = cn(accent.bgLight, accent.text)
  const singlesOpts = sport ? FORMAT_OPTIONS.filter(o => o.category === 'singles' && o.sports.includes(sport)) : []
  const teamsOpts   = sport ? FORMAT_OPTIONS.filter(o => o.category === 'teams' && o.sports.includes(sport)) : []
  const listOpts    = activeTab === 'singles' ? singlesOpts : teamsOpts

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <input type="hidden" name="name"        value={name} />
      <input type="hidden" name="format_type" value={formatType ?? ''} />
      <input type="hidden" name="sport_type"  value={sport ?? ''} />
      <input type="hidden" name="format"      value={sport === 'badminton' ? 'bo3' : sport === 'chess' ? 'bo1' : 'bo5'} />
      {sport === 'carrom' && (
        <>
          <input type="hidden" name="is_doubles" value={isDoubles ? 'true' : 'false'} />
          <input type="hidden" name="carrom_board_target" value={carromBoardTarget} />
          <input type="hidden" name="carrom_queen_value" value={carromQueenValue} />
          <input type="hidden" name="carrom_max_boards" value={carromMaxBoards} />
        </>
      )}

      {/* ── Sport selector ─────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-muted-foreground">
          Sport <span className="text-destructive">*</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['table_tennis', 'badminton', 'carrom', 'chess'] as SportType[]).map(s => {
            const sUi = sportUi(s)
            const emoji = SPORT_EMOJI[s]
            const sLabel = SPORT_LABEL[s]
            return (
              <button key={s} type="button"
                onClick={() => handleSelectSport(s)}
                className={cn(
                  'w-full px-4 py-2.5 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center text-center gap-2',
                  sport === s
                    ? `${sUi.border} ${sUi.bgLight} ${sUi.text}`
                    : `border-border bg-card text-muted-foreground ${sUi.hoverBorder} hover:text-foreground`,
                )}
              >
                <span className="text-base">{emoji}</span>
                {sLabel}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Choose a sport first — formats depend on it ──────────────────── */}
      {!sport ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 px-6 py-16 flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-3xl">🏓 · 🏸 · 🥌 · ♟️</span>
          <p className="font-bold text-foreground">Choose a sport to continue</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Select a sport above to see the available formats and scoring rules.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-2" asChild>
            <Link href={`/admin/championships/${cid}`}>Cancel</Link>
          </Button>
        </div>
      ) : sport && selected && (
      <div className="flex flex-col lg:flex-row gap-0 rounded-2xl border border-border overflow-hidden bg-card shadow-sm">

        {/* ── LEFT: format picker ───────────────────────────────────────── */}
        <div className="lg:w-72 xl:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col">

          {/* Category tabs — Teams only shown for sports with team formats */}
          <div className="flex border-b border-border">
            {((sport && TEAM_SPORTS.includes(sport) ? ['singles', 'teams'] : ['singles']) as Category[]).map(cat => (
              <button key={cat} type="button"
                onClick={() => {
                  setActiveTab(cat)
                  // Auto-select first in category (for the active sport) if current selection is other category
                  const currentCat = FORMAT_OPTIONS.find(o => o.value === formatType)?.category
                  if (currentCat !== cat) {
                    const first = FORMAT_OPTIONS.find(o => o.category === cat && o.sports.includes(sport))
                    if (first) handleSelectFormat(first.value, sport)
                  }
                }}
                className={cn(
                  'flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px',
                  activeTab === cat
                    ? `bg-card text-foreground ${accent.border}`
                    : 'text-muted-foreground hover:text-foreground bg-muted/30 border-transparent',
                )}
              >
                {cat === 'singles' ? '👤 Singles' : '🛡️ Teams'}
              </button>
            ))}
          </div>

          {/* Format list */}
          <div className="flex flex-col py-1 overflow-y-auto">
            {listOpts.map(rawOpt => {
              const opt        = displayFormat(rawOpt, sport)
              const isSelected = formatType === opt.value
              return (
                <button key={opt.value} type="button"
                  onClick={() => handleSelectFormat(opt.value)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 text-left transition-all border-l-2',
                    isSelected
                      ? `${accent.bgLight} ${accent.border} ${accent.text}`
                      : 'border-transparent hover:bg-muted/40 text-foreground',
                  )}
                >
                  <span className={cn('mt-0.5 shrink-0', isSelected ? accent.text : 'text-muted-foreground')}>
                    {opt.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-sm font-semibold leading-tight', isSelected ? accent.text : '')}>{opt.label}</span>
                      {opt.badge && (
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0',
                          isSelected ? pillClass : 'bg-muted text-muted-foreground'
                        )}>{opt.badge}</span>
                      )}
                    </div>
                    {/* Plain-language structure (team cup names alone don't tell you the
                        rubber order) — shown above the more marketing-y tagline. */}
                    {opt.structure && (
                      <p className="text-[11px] font-medium text-foreground/70 mt-0.5 leading-snug">{opt.structure}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.tagline}</p>
                  </div>
                  {isSelected && <CheckCircle2 className={cn('h-4 w-4 shrink-0 mt-0.5', accent.text)} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT: detail + config ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Format detail header */}
          <div className={cn('px-6 py-5 border-b border-border', accent.bgLight)}>
            <div className="flex items-start gap-3">
              <span className={cn('mt-0.5 p-2 rounded-lg bg-white/60 dark:bg-black/20 shrink-0', accent.text)}>
                {selected.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base text-foreground leading-tight">{selected.label}</h3>
                  {selected.badge && (
                    <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', pillClass)}>
                      {selected.badge}
                    </span>
                  )}
                </div>
                {selected.structure && (
                  <p className="text-xs font-semibold text-foreground/70 mt-1">{selected.structure}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{selected.description}</p>
              </div>
            </div>

            {/* Key facts */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {selected.bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ArrowRight className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', accent.text)} />
                  <span className="text-xs text-muted-foreground leading-snug">
                    {sport === 'badminton' ? b.replace('Best of 5 per match', 'Best of 3, race to 21')
                      : sport === 'chess'   ? b.replace('Best of 5 per match', 'One decisive game per match (Win / Draw / Loss)')
                      : sport === 'carrom'  ? b.replace('Best of 5 per match', 'Race to target points over capped boards')
                      : b}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Event config fields */}
          <div className="px-6 py-5 flex flex-col gap-4 flex-1">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Event Details</p>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="event-name" className="text-xs font-semibold text-muted-foreground">
                Event Name <span className="text-destructive">*</span>
              </label>
              <input
                id="event-name"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder={`e.g. Under 13 Boys · ${SPORT_LABEL[sport]} ${selected.defaultName} ${getDateSuffix()}`}
                required
                className={cn(
                  'flex h-10 w-full rounded-lg border-2 bg-background px-3 py-2 text-sm text-foreground',
                  'focus:outline-none transition-all duration-150',
                  accent.border, accent.focusRing,
                )}
              />
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1.5 sm:w-52">
              <label htmlFor="event-date" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Date
              </label>
              <input
                id="event-date"
                name="date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-orange-400/40 transition-colors"
              />
            </div>

            {/* Carrom-only: singles/doubles + board scoring config */}
            {sport === 'carrom' && (
              <div className="flex flex-col gap-4 rounded-xl border-2 border-dashed border-border p-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Entrants</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setIsDoubles(false)}
                      className={cn('flex-1 px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-all',
                        !isDoubles ? `${accent.border} ${accent.bgLight} ${accent.text}` : 'border-border text-muted-foreground hover:text-foreground')}>
                      Singles
                    </button>
                    <button type="button" onClick={() => setIsDoubles(true)}
                      className={cn('flex-1 px-3 py-2 rounded-lg border-2 text-sm font-semibold transition-all',
                        isDoubles ? `${accent.border} ${accent.bgLight} ${accent.text}` : 'border-border text-muted-foreground hover:text-foreground')}>
                      Doubles (2 per side)
                    </button>
                  </div>
                  {isDoubles && (
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Each entrant will be registered as a pair (e.g. &ldquo;Alice K. / Bob R.&rdquo;) — collect both names when adding players.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Board scoring</p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => applyCarromPreset('icf25')}
                      className={cn('flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all text-left',
                        carromPreset === 'icf25' ? `${accent.border} ${accent.bgLight} ${accent.text}` : 'border-border text-muted-foreground hover:text-foreground')}>
                      ICF Official<br /><span className="font-normal">25 pts · 8 boards · Queen 3</span>
                    </button>
                    <button type="button" onClick={() => applyCarromPreset('club29')}
                      className={cn('flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all text-left',
                        carromPreset === 'club29' ? `${accent.border} ${accent.bgLight} ${accent.text}` : 'border-border text-muted-foreground hover:text-foreground')}>
                      Club Variant<br /><span className="font-normal">29 pts · 4 boards · Queen 5</span>
                    </button>
                    <button type="button" onClick={() => applyCarromPreset('custom')}
                      className={cn('flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all text-left',
                        carromPreset === 'custom' ? `${accent.border} ${accent.bgLight} ${accent.text}` : 'border-border text-muted-foreground hover:text-foreground')}>
                      Custom<br /><span className="font-normal">Set your own values</span>
                    </button>
                  </div>
                  {carromPreset === 'custom' && (
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">Target points</span>
                        <input type="number" min={1} max={99} value={carromBoardTarget}
                          onChange={e => setCarromBoardTarget(Number(e.target.value))}
                          className="h-9 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">Queen value</span>
                        <input type="number" min={1} max={10} value={carromQueenValue}
                          onChange={e => setCarromQueenValue(Number(e.target.value))}
                          className="h-9 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">Max boards</span>
                        <input type="number" min={1} max={20} value={carromMaxBoards}
                          onChange={e => setCarromMaxBoards(Number(e.target.value))}
                          className="h-9 rounded-lg border-2 border-border bg-background px-2 text-sm" />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions pinned to bottom */}
          <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center gap-3">
            <Button type="button" variant="outline" asChild>
              <Link href={`/admin/championships/${cid}`}>Cancel</Link>
            </Button>
            <Button type="submit" className={cn('flex-1 gap-2 max-w-xs', !name.trim() || busy ? '' : `${accent.bgLight} ${accent.border} ${accent.text} border`)}
              disabled={!name.trim() || busy}
              variant="default"
            >
              {busy
                ? <><span className="tt-spinner tt-spinner-sm" /> Creating…</>
                : <><Trophy className="h-4 w-4" /> Create Event</>
              }
            </Button>
          </div>
        </div>
      </div>
      )}
    </form>
  )
}
