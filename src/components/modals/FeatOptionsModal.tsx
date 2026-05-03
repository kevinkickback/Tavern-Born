import { ArrowLeft, ArrowRight, Check, MagicWand } from '@phosphor-icons/react'
import { memo, useCallback, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { getFeatureTypes } from '@/lib/5etools/classData'
import {
  deriveFeatOptionSteps,
  deriveSpellStepsForClass,
  type FeatOptionStep,
  parseFeatSpellFilter,
} from '@/lib/5etools/parsers/featOptions'
import { ALL_SKILLS } from '@/lib/calculations/skills'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import { getSchoolName } from '@/lib/calculations/spellUtils'
import { cn } from '@/lib/utils'
import type { Feat5e, OptionalFeatureLike, Spell5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'

const ABILITY_LABELS: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

const STANDARD_LANGUAGES = [
  'Common',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
  'Abyssal',
  'Celestial',
  'Deep Speech',
  'Draconic',
  'Infernal',
  'Primordial',
  'Sylvan',
  'Undercommon',
]

// ── Per-step selection state ──────────────────────────────────────────────────

/** Selections accumulated per wizard step (keyed by step index). */
type StepSelections = Record<number, string | string[]>

/** Tracks single-value steps (string) vs multi-value steps (string[]). */
function getStepValue(stepSels: StepSelections, idx: number): string | string[] {
  return stepSels[idx] ?? ''
}

function isStepComplete(step: FeatOptionStep, stepSels: StepSelections, idx: number): boolean {
  const val = getStepValue(stepSels, idx)
  switch (step.kind) {
    case 'spellcastingClass':
    case 'abilityScore':
    case 'optionalFeature':
    case 'expertise':
      return typeof val === 'string' && val.length > 0
    case 'spells':
    case 'proficiency': {
      const arr = Array.isArray(val) ? val : []
      return arr.length >= step.count
    }
  }
}

// ── Step renderers ────────────────────────────────────────────────────────────

const SpellcastingClassStep = memo(function SpellcastingClassStep({
  step,
  value,
  onChange,
}: {
  step: Extract<FeatOptionStep, { kind: 'spellcastingClass' }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{step.label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a class…" />
        </SelectTrigger>
        <SelectContent>
          {step.classOptions.map((opt) => (
            <SelectItem key={opt.name} value={opt.name}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
})

const SpellPickStep = memo(function SpellPickStep({
  step,
  selected,
  onToggle,
  spells,
}: {
  step: Extract<FeatOptionStep, { kind: 'spells' }>
  selected: string[]
  onToggle: (id: string) => void
  spells: Spell5e[]
}) {
  const parsed = useMemo(() => parseFeatSpellFilter(step.chooseFilter), [step.chooseFilter])
  const filtered = useMemo(() => {
    return spells.filter((s) => {
      if (parsed.level && !parsed.level.includes(s.level)) return false
      if (parsed.school && !parsed.school.includes(s.school)) return false
      if (parsed.className && !isSpellOnClassList(s, parsed.className)) return false
      return true
    })
  }, [spells, parsed])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {step.label}
        {selected.length > 0 && (
          <span className="ml-2 text-xs text-accent-foreground">
            ({selected.length}/{step.count} chosen)
          </span>
        )}
      </p>
      <div className="border rounded-md max-h-64 overflow-y-auto divide-y divide-border/50">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground italic">No matching spells found.</p>
        ) : (
          filtered.map((spell) => {
            const id = `${spell.name}|${spell.source ?? ''}`
            const checkboxId = `spell-cb-${id.replace(/[^a-zA-Z0-9]/g, '-')}`
            const isSelected = selected.includes(id)
            const atLimit = selected.length >= step.count && !isSelected
            return (
              <label
                key={id}
                htmlFor={checkboxId}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors',
                  atLimit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                )}
              >
                <Checkbox
                  id={checkboxId}
                  checked={isSelected}
                  onCheckedChange={() => !atLimit && onToggle(id)}
                  disabled={atLimit}
                  tabIndex={atLimit ? -1 : 0}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{spell.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} ·{' '}
                    {getSchoolName(spell.school)}
                  </span>
                </div>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
})

const ProficiencyPickStep = memo(function ProficiencyPickStep({
  step,
  selected,
  onToggle,
}: {
  step: Extract<FeatOptionStep, { kind: 'proficiency' }>
  selected: string[]
  onToggle: (name: string) => void
}) {
  const pool = useMemo(() => {
    if (step.optionPool && step.optionPool.length > 0) return step.optionPool
    if (step.domain === 'skills') return ALL_SKILLS as string[]
    if (step.domain === 'languages') return STANDARD_LANGUAGES
    return []
  }, [step.domain, step.optionPool])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {step.label}
        {selected.length > 0 && (
          <span className="ml-2 text-xs text-accent-foreground">
            ({selected.length}/{step.count} chosen)
          </span>
        )}
      </p>
      <div className="border rounded-md max-h-64 overflow-y-auto divide-y divide-border/50">
        {pool.map((name) => {
          const isSelected = selected.includes(name)
          const atLimit = selected.length >= step.count && !isSelected
          const checkboxId = `prof-cb-${name.replace(/[^a-zA-Z0-9]/g, '-')}`
          return (
            <label
              key={name}
              htmlFor={checkboxId}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors',
                atLimit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <Checkbox
                id={checkboxId}
                checked={isSelected}
                onCheckedChange={() => !atLimit && onToggle(name)}
                disabled={atLimit}
                tabIndex={atLimit ? -1 : 0}
              />
              <span className="text-sm capitalize">{name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
})

const AbilityScoreStep = memo(function AbilityScoreStep({
  step,
  value,
  onChange,
}: {
  step: Extract<FeatOptionStep, { kind: 'abilityScore' }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{step.label}</p>
      <div className="flex flex-wrap gap-2">
        {step.from.map((abilityKey) => {
          const label = ABILITY_LABELS[abilityKey] ?? abilityKey
          const isSelected = value === abilityKey
          return (
            <button
              key={abilityKey}
              type="button"
              onClick={() => onChange(abilityKey)}
              className={cn(
                'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                isSelected
                  ? 'border-accent bg-accent/10 text-accent-foreground'
                  : 'border-border hover:border-accent/50 hover:bg-muted/40',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
})

const OptionalFeatureStep = memo(function OptionalFeatureStep({
  step,
  value,
  onChange,
  optionalFeatures,
}: {
  step: Extract<FeatOptionStep, { kind: 'optionalFeature' }>
  value: string
  onChange: (v: string) => void
  optionalFeatures: OptionalFeatureLike[]
}) {
  const filtered = useMemo(
    () => optionalFeatures.filter((f) => getFeatureTypes(f).includes(step.featureType)),
    [optionalFeatures, step.featureType],
  )

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{step.label}</p>
      <div className="border rounded-md max-h-64 overflow-y-auto divide-y divide-border/50">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground italic">No options found.</p>
        ) : (
          filtered.map((f) => (
            <label
              key={`${f.name}|${f.source ?? ''}`}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
            >
              <input
                type="radio"
                name="optFeature"
                checked={value === f.name}
                onChange={() => onChange(f.name)}
                className="accent-current"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{f.name}</span>
                {f.source && (
                  <Badge
                    variant="outline"
                    className="ml-2 text-xs h-4 px-1 py-0 text-muted-foreground"
                  >
                    {f.source}
                  </Badge>
                )}
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  )
})

const ExpertiseStep = memo(function ExpertiseStep({
  step,
  value,
  onChange,
  proficientSkillNames,
}: {
  step: Extract<FeatOptionStep, { kind: 'expertise' }>
  value: string
  onChange: (v: string) => void
  proficientSkillNames: string[]
}) {
  const pool = proficientSkillNames.length > 0 ? proficientSkillNames : (ALL_SKILLS as string[])
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{step.label}</p>
      {proficientSkillNames.length === 0 && (
        <p className="text-xs text-warning/80">No proficient skills found — showing all skills.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {pool.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-sm capitalize transition-colors',
              value === name
                ? 'border-accent bg-accent/10 text-accent-foreground'
                : 'border-border hover:border-accent/50 hover:bg-muted/40',
            )}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
})

// ── Initial selection seeding ─────────────────────────────────────────────────

function seedStepSelections(steps: FeatOptionStep[], init: FeatOptionSelections): StepSelections {
  const result: StepSelections = {}
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    switch (step.kind) {
      case 'spellcastingClass':
        if (init.spellcastingClass) result[i] = init.spellcastingClass
        break
      case 'spells':
        if (init.spells?.length) result[i] = [...init.spells]
        break
      case 'proficiency':
        if (step.domain === 'skills' && init.skills?.length) result[i] = [...init.skills]
        else if (step.domain === 'languages' && init.languages?.length)
          result[i] = [...init.languages]
        else if (step.domain === 'tools' && init.tools?.length) result[i] = [...init.tools]
        break
      case 'abilityScore':
        if (init.abilityScore) result[i] = init.abilityScore
        break
      case 'optionalFeature':
        if (init.optionalFeature) result[i] = init.optionalFeature
        break
      case 'expertise':
        if (init.expertiseSkill) result[i] = init.expertiseSkill
        break
    }
  }
  return result
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * Compute the initial wizard steps and seeded selections in one pass.
 * Called only once per mount via lazy useState initializers.
 */
function initWizardState(
  feat: Feat5e,
  initialSelections?: FeatOptionSelections,
): { steps: FeatOptionStep[]; stepSels: StepSelections } {
  let steps = deriveFeatOptionSteps(feat)

  if (initialSelections?.spellcastingClass) {
    const classIdx = steps.findIndex((s) => s.kind === 'spellcastingClass')
    if (classIdx >= 0) {
      const spellSteps = deriveSpellStepsForClass(feat, initialSelections.spellcastingClass).map(
        ({ count, chooseFilter, label }): FeatOptionStep => ({
          kind: 'spells',
          label,
          count,
          chooseFilter,
        }),
      )
      steps = [
        ...steps.slice(0, classIdx + 1),
        ...spellSteps,
        ...steps.slice(classIdx + 1).filter((s) => s.kind !== 'spells'),
      ]
    }
  }

  return {
    steps,
    stepSels: initialSelections ? seedStepSelections(steps, initialSelections) : {},
  }
}

export interface FeatOptionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feat: Feat5e
  /** Skills the character is already proficient in, for the expertise step. */
  proficientSkillNames?: string[]
  /** Pre-populate wizard with prior selections when editing an already-configured feat. */
  initialSelections?: FeatOptionSelections
  onFinish: (selections: FeatOptionSelections) => void
  /** Called when user dismisses without completing — feat is saved as pending. */
  onDismiss?: () => void
}

export const FeatOptionsModal = memo(function FeatOptionsModal({
  open,
  onOpenChange,
  feat,
  proficientSkillNames = [],
  initialSelections,
  onFinish,
  onDismiss,
}: FeatOptionsModalProps) {
  const { spells, optionalfeatures } = useFilteredGameData()

  const [stepIndex, setStepIndex] = useState(0)
  const [allSteps, setAllSteps] = useState<FeatOptionStep[]>(
    () => initWizardState(feat, initialSelections).steps,
  )
  const [stepSels, setStepSels] = useState<StepSelections>(
    () => initWizardState(feat, initialSelections).stepSels,
  )

  const currentStep = allSteps[stepIndex]

  // ── Setters per step ──────────────────────────────────────────────────────

  const setSingle = useCallback((idx: number, val: string) => {
    setStepSels((prev) => ({ ...prev, [idx]: val }))
  }, [])

  const toggleMulti = useCallback((idx: number, val: string, limit: number) => {
    setStepSels((prev) => {
      const current = Array.isArray(prev[idx]) ? (prev[idx] as string[]) : []
      if (current.includes(val)) return { ...prev, [idx]: current.filter((v) => v !== val) }
      if (current.length >= limit) return prev
      return { ...prev, [idx]: [...current, val] }
    })
  }, [])

  // When a spellcasting class is chosen, inject class-specific spell steps.
  const handleClassChosen = useCallback(
    (className: string, stepIdx: number) => {
      setSingle(stepIdx, className)
      const spellSteps = deriveSpellStepsForClass(feat, className).map(
        ({ count, chooseFilter, label }): FeatOptionStep => ({
          kind: 'spells',
          label,
          count,
          chooseFilter,
        }),
      )
      setAllSteps((prev) => {
        const before = prev.slice(0, stepIdx + 1)
        const after = prev.slice(stepIdx + 1).filter((s) => s.kind !== 'spells')
        return [...before, ...spellSteps, ...after]
      })
    },
    [feat, setSingle],
  )

  // ── Build final FeatOptionSelections on Finish ────────────────────────────

  const buildSelections = useCallback((): FeatOptionSelections => {
    const result: FeatOptionSelections = {}
    const skills: string[] = []
    const languages: string[] = []
    const tools: string[] = []
    const spellKeys: string[] = []

    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i]
      const val = getStepValue(stepSels, i)
      switch (step.kind) {
        case 'spellcastingClass':
          if (typeof val === 'string') result.spellcastingClass = val
          break
        case 'spells':
          if (Array.isArray(val)) spellKeys.push(...val)
          break
        case 'proficiency': {
          const picks = Array.isArray(val) ? val : []
          if (step.domain === 'skills') skills.push(...picks)
          else if (step.domain === 'languages') languages.push(...picks)
          else if (step.domain === 'tools') tools.push(...picks)
          break
        }
        case 'abilityScore':
          if (typeof val === 'string') result.abilityScore = val
          break
        case 'optionalFeature':
          if (typeof val === 'string') result.optionalFeature = val
          break
        case 'expertise':
          if (typeof val === 'string') result.expertiseSkill = val
          break
      }
    }

    if (spellKeys.length > 0) result.spells = spellKeys
    if (skills.length > 0) result.skills = skills
    if (languages.length > 0) result.languages = languages
    if (tools.length > 0) result.tools = tools
    return result
  }, [allSteps, stepSels])

  const isLast = stepIndex === allSteps.length - 1
  const canAdvance = currentStep ? isStepComplete(currentStep, stepSels, stepIndex) : false

  const handleNext = useCallback(() => {
    if (!isLast) {
      setStepIndex((i) => i + 1)
    } else {
      onFinish(buildSelections())
    }
  }, [isLast, buildSelections, onFinish])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) onDismiss?.()
      onOpenChange(isOpen)
    },
    [onOpenChange, onDismiss],
  )

  if (!currentStep) return null

  const currentValue = getStepValue(stepSels, stepIndex)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <MagicWand className="h-5 w-5 text-accent-foreground" weight="duotone" />
            <DialogTitle>Configure: {feat.name}</DialogTitle>
          </div>
          <DialogDescription>
            Step {stepIndex + 1} of {allSteps.length} — complete the choices granted by this feat.
          </DialogDescription>
        </DialogHeader>

        {allSteps.length > 1 && (
          <div className="flex items-center gap-1.5 pt-1">
            {allSteps.map((step, i) => (
              <div
                key={step.label}
                className={cn(
                  'rounded-full transition-all',
                  i === stepIndex
                    ? 'h-2 w-4 bg-accent-foreground'
                    : i < stepIndex
                      ? 'h-2 w-2 bg-accent-foreground/50'
                      : 'h-2 w-2 bg-border',
                )}
              />
            ))}
          </div>
        )}

        <div className="py-2">
          {currentStep.kind === 'spellcastingClass' && (
            <SpellcastingClassStep
              step={currentStep}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(v) => handleClassChosen(v, stepIndex)}
            />
          )}
          {currentStep.kind === 'spells' && (
            <SpellPickStep
              step={currentStep}
              selected={Array.isArray(currentValue) ? currentValue : []}
              onToggle={(id) => toggleMulti(stepIndex, id, currentStep.count)}
              spells={spells as Spell5e[]}
            />
          )}
          {currentStep.kind === 'proficiency' && (
            <ProficiencyPickStep
              step={currentStep}
              selected={Array.isArray(currentValue) ? currentValue : []}
              onToggle={(name) => toggleMulti(stepIndex, name, currentStep.count)}
            />
          )}
          {currentStep.kind === 'abilityScore' && (
            <AbilityScoreStep
              step={currentStep}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(v) => setSingle(stepIndex, v)}
            />
          )}
          {currentStep.kind === 'optionalFeature' && (
            <OptionalFeatureStep
              step={currentStep}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(v) => setSingle(stepIndex, v)}
              optionalFeatures={optionalfeatures as OptionalFeatureLike[]}
            />
          )}
          {currentStep.kind === 'expertise' && (
            <ExpertiseStep
              step={currentStep}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(v) => setSingle(stepIndex, v)}
              proficientSkillNames={proficientSkillNames}
            />
          )}
        </div>

        <DialogFooter className="flex items-center gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => i - 1)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          <Button size="sm" disabled={!canAdvance} onClick={handleNext} className="gap-1.5">
            {isLast ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Finish
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
