import {
  Flame,
  Heart,
  HeartBreak,
  Lightning,
  Minus,
  Plus,
  SmileyXEyes,
  Sparkle,
  Wind,
} from '@phosphor-icons/react'
import { useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useClassResources } from '@/hooks/character/useClassResources'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useRitualCasting } from '@/hooks/character/useRitualCasting'
import { useConditionNames } from '@/hooks/data/useGameData'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * FALLBACK: used only while conditionsdiseases.json has not yet loaded.
 * The live list comes from useConditionNames() → GameDataLookups.conditionNames.
 */
const CONDITION_NAMES_FALLBACK: readonly string[] = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const

/**
 * FALLBACK: 5etools embeds exhaustion level text in conditionsdiseases.json
 * entries as prose, not as a structured field. These labels are retained here
 * until a structured parser is available.
 */
const EXHAUSTION_LABELS = [
  'Normal',
  'Disadvantage on ability checks',
  'Speed halved',
  'Disadvantage on attacks and saves',
  'Hit point maximum halved',
  'Speed reduced to 0',
  'Death',
] as const

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="bg-gradient-to-r from-accent/20 via-accent/10 to-transparent border-b border-border px-4 py-3 flex items-center gap-2">
      <span className="h-4 w-4 text-primary [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
  )
}

function SavePip({
  filled,
  variant,
  onClick,
}: {
  filled: boolean
  variant: 'success' | 'failure'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 w-7 rounded-full border-2 transition-all flex items-center justify-center',
        variant === 'success'
          ? filled
            ? 'bg-success border-success text-success-foreground'
            : 'border-success/40 hover:border-success/80'
          : filled
            ? 'bg-destructive border-destructive text-destructive-foreground'
            : 'border-destructive/40 hover:border-destructive/80',
      )}
    >
      {filled && <span className="block h-2.5 w-2.5 rounded-full bg-current opacity-80" />}
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function ConditionsPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { hitDie } = useHitPoints()
  const ritualCasting = useRitualCasting()
  const { resources, updateCurrent, resetResource, resetAll } = useClassResources()
  const parsedConditionNames = useConditionNames()
  const conditionNames =
    parsedConditionNames.length > 0 ? parsedConditionNames : CONDITION_NAMES_FALLBACK

  const update = useCallback(
    <K extends keyof NonNullable<typeof character>>(
      key: K,
      value: NonNullable<typeof character>[K],
    ) => {
      if (!character) return
      updateCharacter(character.id, { [key]: value })
    },
    [character, updateCharacter],
  )

  if (!character)
    return <NoCharCard icon={<SmileyXEyes weight="duotone" />} noun="track conditions" />

  const inspiration = character.inspiration ?? false
  const deathSaves = character.deathSaves ?? { successes: 0, failures: 0 }
  const conditions = character.conditions ?? []
  const exhaustion = character.exhaustion ?? 0
  const hitDiceUsed = character.hitDiceUsed ?? 0
  const totalLevel = getTotalCharacterLevel(character) ?? 1
  const hitDiceRemaining = Math.max(0, totalLevel - hitDiceUsed)
  const toggleCondition = (name: string) => {
    const next = conditions.includes(name)
      ? conditions.filter((c) => c !== name)
      : [...conditions, name]
    update('conditions', next)
  }

  const setDeathSave = (type: 'successes' | 'failures', index: number) => {
    const current = deathSaves[type]
    // clicking same last pip toggles off, otherwise set to index+1
    const next = current === index + 1 ? index : index + 1
    update('deathSaves', { ...deathSaves, [type]: next })
  }

  const setExhaustion = (level: number) => {
    update('exhaustion', Math.max(0, Math.min(6, level)))
  }

  return (
    <div>
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Lightning className="h-6 w-6 text-primary" weight="duotone" />
          <div>
            <h1 className="text-2xl font-display font-bold">Conditions</h1>
            <p className="text-sm text-muted-foreground">
              Track active conditions and session state
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          {/* ── Combat State ───────────────────────────────────────── */}
          <Card className="w-full overflow-hidden">
            <SectionHeader icon={<Heart weight="duotone" />} title="Combat State" />
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Inspiration */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Inspiration
                </span>
                <button
                  type="button"
                  onClick={() => update('inspiration', !inspiration)}
                  className={cn(
                    'h-12 w-full rounded-lg border-2 flex items-center justify-center gap-2 transition-all text-sm font-semibold',
                    inspiration
                      ? 'bg-accent border-accent text-accent-foreground'
                      : 'border-border hover:border-accent/50 text-muted-foreground',
                  )}
                >
                  <Sparkle className="h-4 w-4" weight={inspiration ? 'fill' : 'regular'} />
                  {inspiration ? 'Inspired' : 'No Inspiration'}
                </button>
              </div>

              {/* Death Saves */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Death Saves
                </span>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-success w-16">Successes</span>
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <SavePip
                          key={i}
                          filled={deathSaves.successes > i}
                          variant="success"
                          onClick={() => setDeathSave('successes', i)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive w-16">Failures</span>
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <SavePip
                          key={i}
                          filled={deathSaves.failures > i}
                          variant="failure"
                          onClick={() => setDeathSave('failures', i)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hit Dice */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Hit Dice
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={hitDiceUsed >= totalLevel}
                    onClick={() => update('hitDiceUsed', hitDiceUsed + 1)}
                  >
                    <Minus size={14} />
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-lg font-bold tabular-nums">{hitDiceRemaining}</span>
                    <span className="text-muted-foreground text-sm">/{totalLevel}</span>
                    <div className="text-xs text-muted-foreground">d{hitDie} remaining</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={hitDiceUsed === 0}
                    onClick={() => update('hitDiceUsed', hitDiceUsed - 1)}
                  >
                    <Plus size={14} />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  disabled={hitDiceUsed === 0}
                  onClick={() => update('hitDiceUsed', 0)}
                >
                  Reset (Long Rest)
                </Button>
              </div>
            </div>
          </Card>

          {/* ── Exhaustion ─────────────────────────────────────────── */}
          <Card className="w-full overflow-hidden">
            <SectionHeader icon={<Wind weight="duotone" />} title="Exhaustion" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setExhaustion(level === exhaustion ? level - 1 : level)}
                    className={cn(
                      'h-9 w-9 rounded-lg border-2 text-sm font-bold transition-all flex items-center justify-center',
                      exhaustion >= level && level > 0
                        ? level >= 6
                          ? 'bg-destructive border-destructive text-destructive-foreground'
                          : 'bg-accent border-accent text-accent-foreground'
                        : level === 0
                          ? exhaustion === 0
                            ? 'bg-success/20 border-success text-success'
                            : 'border-border text-muted-foreground'
                          : 'border-border text-muted-foreground hover:border-accent/50',
                    )}
                  >
                    {level}
                  </button>
                ))}
                {exhaustion > 0 && (
                  <Badge
                    variant={exhaustion >= 6 ? 'destructive' : 'secondary'}
                    className="ml-2 text-xs"
                  >
                    {EXHAUSTION_LABELS[exhaustion]}
                  </Badge>
                )}
              </div>
              {exhaustion === 0 && (
                <p className="text-xs text-muted-foreground">{EXHAUSTION_LABELS[0]}</p>
              )}
            </div>
          </Card>

          {/* ── Active Conditions ──────────────────────────────────── */}
          <Card className="w-full overflow-hidden">
            <SectionHeader icon={<HeartBreak weight="duotone" />} title="Active Conditions" />
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {conditionNames.map((name) => {
                  const active = conditions.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleCondition(name)}
                      className={cn(
                        'h-9 px-3 rounded-lg border-2 text-xs font-semibold transition-all text-left',
                        active
                          ? 'bg-destructive/10 border-destructive text-destructive'
                          : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground',
                      )}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
              {conditions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {conditions.map((c) => (
                    <Badge
                      key={c}
                      variant="destructive"
                      className="text-xs gap-1 cursor-pointer"
                      onClick={() => toggleCondition(c)}
                    >
                      {c} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* ── Class Resources ────────────────────────────────────── */}
          <Card className="w-full overflow-hidden">
            <div className="bg-gradient-to-r from-accent/20 via-accent/10 to-transparent border-b border-border px-4 py-3 flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Class Resources
              </span>
              {ritualCasting && (
                <Badge variant="outline" className="ml-auto text-xs gap-1">
                  <Sparkle className="h-3 w-3" />
                  Ritual Casting
                </Badge>
              )}
              {resources.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-6 text-xs text-muted-foreground px-2',
                    ritualCasting ? 'ml-2' : 'ml-auto',
                  )}
                  onClick={resetAll}
                >
                  Reset All
                </Button>
              )}
            </div>
            <div className="p-4 space-y-1">
              {resources.length === 0 && (
                <p className="text-sm text-muted-foreground py-1">
                  No limited resources for this class at this level.
                </p>
              )}
              {resources.map((res) => (
                <div
                  key={res.id}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{res.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {res.className} · {res.restType === 'short' ? 'short rest' : 'long rest'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={res.current <= 0}
                      onClick={() => updateCurrent(res.id, res.current - 1)}
                    >
                      <Minus size={12} />
                    </Button>
                    <span className="tabular-nums text-sm font-bold w-14 text-center">
                      {res.current}
                      <span className="text-muted-foreground font-normal">
                        /{res.max >= 999 ? '∞' : res.max}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={res.current >= res.max}
                      onClick={() => updateCurrent(res.id, res.current + 1)}
                    >
                      <Plus size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground px-2"
                      onClick={() => resetResource(res.id)}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
