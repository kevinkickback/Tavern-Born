import { BookOpen, Eye, EyeSlash, Sparkle, Warning } from '@phosphor-icons/react'
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type AbilityName,
  formatModifier,
  getRaceAbilityData,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import type { CharacterWizardData } from '../types'

interface ReviewStepProps {
  data: CharacterWizardData
}

type RaceWithOverwrite = Race5e & {
  overwrite?: {
    ability?: boolean
  }
}

function mergeRaceWithSubrace(parent: Race5e, subrace: Race5e): Race5e {
  const replacesAbility = (subrace as RaceWithOverwrite).overwrite?.ability === true

  return {
    ...parent,
    ...subrace,
    ability: replacesAbility
      ? (subrace.ability ?? [])
      : [...(parent.ability ?? []), ...(subrace.ability ?? [])],
    entries: [...(parent.entries ?? []), ...(subrace.entries ?? [])],
    size: subrace.size ?? parent.size,
    speed: subrace.speed ?? parent.speed,
    darkvision: subrace.darkvision ?? parent.darkvision,
    languageProficiencies: subrace.languageProficiencies ?? parent.languageProficiencies,
    skillProficiencies: subrace.skillProficiencies ?? parent.skillProficiencies,
    traitTags: [...new Set([...(parent.traitTags ?? []), ...(subrace.traitTags ?? [])])],
    resist: [...new Set([...(parent.resist ?? []), ...(subrace.resist ?? [])])],
    immune: [...new Set([...(parent.immune ?? []), ...(subrace.immune ?? [])])],
    conditionImmune: [
      ...new Set([...(parent.conditionImmune ?? []), ...(subrace.conditionImmune ?? [])]),
    ],
  } as Race5e
}

function InfoRow({ label, value, warn }: { label: string; value?: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className={cn('text-xs text-muted-foreground shrink-0', warn && 'text-destructive')}>
        {label}
        {warn && <Warning className="inline ml-1 h-3 w-3" />}
      </span>
      <span
        className={cn(
          'text-sm font-semibold text-right truncate',
          !value && 'text-muted-foreground italic font-normal',
        )}
      >
        {value || 'Not set'}
      </span>
    </div>
  )
}

export function ReviewStep({ data }: ReviewStepProps) {
  const gameData = useGameDataStore((s) => s.gameData)

  const missingFields: string[] = []
  if (!data.name) missingFields.push('Name')
  if (!data.race) missingFields.push('Race')
  if (!data.class) missingFields.push('Class')
  if (!data.background) missingFields.push('Background')

  const raceObj = (gameData?.races ?? []).find(
    (r) => r.name === data.race && (!data.raceSource || r.source === data.raceSource),
  )
  const subraceObj = raceObj?.subraces?.find(
    (sr) =>
      sr.name === data.subrace && (sr.source ?? '') === (data.subraceSource ?? sr.source ?? ''),
  )
  const displayRace = raceObj && subraceObj ? mergeRaceWithSubrace(raceObj, subraceObj) : raceObj

  const raceAsiData = getRaceAbilityData(raceObj, subraceObj, data.raceAsiBlockIndex ?? 0)
  const racialBonuses: Partial<Record<AbilityName, number>> = {}
  for (const fb of raceAsiData.fixed) {
    racialBonuses[fb.ability] = (racialBonuses[fb.ability] ?? 0) + fb.value
  }
  for (const [blockIdx, block] of raceAsiData.choices.entries()) {
    for (const raw of data.raceAsiChoices?.[blockIdx] ?? []) {
      const ab = normalizeAbilityName(raw)
      if (ab) racialBonuses[ab] = (racialBonuses[ab] ?? 0) + block.amount
    }
  }

  const sourceLabelByAbbreviation = new Map(
    (gameData?.sources ?? []).map((source) => [source.abbreviation, source.name]),
  )
  const allowedSources = data.allowedSources ?? []
  const hasRestrictedSources = allowedSources.length > 0
  const allowedSourceDisplay = hasRestrictedSources
    ? allowedSources.map(
        (abbreviation) =>
          `${abbreviation}${sourceLabelByAbbreviation.has(abbreviation) ? ` - ${sourceLabelByAbbreviation.get(abbreviation)}` : ''}`,
      )
    : []

  const hasDarkvision = displayRace?.darkvision !== undefined && displayRace.darkvision > 0

  const speedValue =
    typeof displayRace?.speed === 'number'
      ? `${displayRace.speed} ft`
      : displayRace?.speed?.walk
        ? `${displayRace.speed.walk} ft`
        : 'Not specified'
  const sizeValue = displayRace?.size?.join(', ') || 'Not specified'

  const variantRuleRows = [
    {
      label: 'Optional Class Features',
      enabled: data.variantRules?.optionalClassFeatures,
    },
    {
      label: 'Average Hit Points',
      enabled: data.variantRules?.averageHitPoints,
    },
    {
      label: 'Bladesinger Any Race',
      enabled: data.variantRules?.bladesingerAnyRace,
    },
    {
      label: 'Battlerager Any Race',
      enabled: data.variantRules?.battleragerAnyRace,
    },
    {
      label: 'Prefer Newer Printings',
      enabled: data.variantRules?.preferNewerPrintings,
    },
  ]

  return (
    <div className="h-full flex flex-col gap-4">
      {missingFields.length > 0 && (
        <Alert variant="destructive" className="shrink-0 py-2">
          <Warning className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Missing: {missingFields.join(', ')}. You can configure these after creation.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
              <div className="w-full lg:w-[420px] shrink-0">
                <PortraitCardPreview
                  image={data.portrait}
                  name={data.name}
                  level={1}
                  race={[data.race, data.subrace].filter(Boolean).join(' • ')}
                  characterClass={data.class}
                  gender={data.gender}
                  transform={data.portraitTransform}
                />
              </div>

              <div className="flex-1 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-card/60 p-3 min-w-xs">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Character Snapshot
                  </div>
                  <InfoRow label="Background" value={data.background} warn={!data.background} />
                  <InfoRow label="Size" value={sizeValue} />
                  <InfoRow label="Speed" value={speedValue} />
                  <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">Darkvision</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-semibold',
                        hasDarkvision ? 'text-success' : 'text-muted-foreground',
                      )}
                    >
                      {hasDarkvision ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeSlash className="h-3.5 w-3.5" />
                      )}
                      {hasDarkvision ? `${displayRace?.darkvision} ft` : 'None'}
                    </span>
                  </div>
                  <InfoRow label="Race Source" value={data.raceSource} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkle className="h-4 w-4 text-accent" weight="fill" />
                  <h4 className="text-sm font-semibold">Ability Scores</h4>
                </div>
                <Badge variant="secondary" className="font-mono">
                  Method: {data.abilityScoreMethod?.replace(/-/g, ' ') || 'unset'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 xl:grid-cols-3 gap-2">
                {ABILITY_NAMES.map((ability) => {
                  const base = (data.abilityScores?.[ability] as number | undefined) ?? 8
                  const bonus = racialBonuses[ability] ?? 0
                  const total = base + bonus
                  const mod = getAbilityModifier(total)
                  return (
                    <div
                      key={ability}
                      className="border rounded-lg bg-card/60 border-border flex flex-col items-center justify-center gap-0.5 p-2"
                    >
                      <div className="text-[10px] font-bold text-accent uppercase tracking-wider">
                        {ABILITY_ABBREVIATIONS[ability]}
                      </div>
                      <div className="text-2xl font-bold font-mono leading-none">{total}</div>
                      {bonus !== 0 && (
                        <div className="text-[10px] text-emerald-500 font-semibold leading-none">
                          {base}+{bonus}
                        </div>
                      )}
                      <div
                        className={cn(
                          'text-sm font-semibold',
                          mod >= 0 ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {formatModifier(mod)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkle className="h-4 w-4 text-accent" weight="fill" />
                <h4 className="text-sm font-semibold">Variant Rules</h4>
              </div>
              <div className="space-y-1">
                {variantRuleRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <Badge
                      variant={row.enabled ? 'default' : 'outline'}
                      className={cn(
                        'text-[11px]',
                        row.enabled && 'bg-accent text-accent-foreground',
                      )}
                    >
                      {row.enabled ? 'On' : 'Off'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-accent" weight="fill" />
              <h4 className="text-sm font-semibold">Allowed Sources</h4>
              {hasRestrictedSources && (
                <Badge variant="secondary" className="font-mono">
                  {allowedSources.length}
                </Badge>
              )}
            </div>

            {hasRestrictedSources ? (
              <div className="flex flex-wrap gap-2">
                {allowedSourceDisplay.map((sourceLine) => {
                  const [abbr, ...rest] = sourceLine.split(' - ')
                  return (
                    <div
                      key={sourceLine}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1"
                    >
                      <span className="text-[11px] font-semibold font-mono">{abbr}</span>
                      {rest.length > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {rest.join(' - ')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                No source filter selected. All loaded sources are currently allowed.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
