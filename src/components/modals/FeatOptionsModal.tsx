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
import { useSkillList, useSpellLookup } from '@/hooks/data/useGameData'
import { getFeatureTypes } from '@/lib/5etools/classData'
import {
  deriveFeatOptionSteps,
  deriveSpellStepsForClass,
  type FeatOptionStep,
} from '@/lib/5etools/parsers/featOptions'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { ABILITY_ABBREV_TO_TITLE } from '@/lib/calculations/abilityNames'
import { getSpellReferenceKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { getSchoolName } from '@/lib/calculations/spellUtils'
import { assignSavedFeatSpells, createFeatSpellMatcher } from '@/lib/character/featSpellChoices'
import { cn } from '@/lib/utils'
import type { Feat5e, Language5e, OptionalFeatureLike, Spell5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'

type StepSelections = Record<number, string | string[]>

function getStepValue(stepSels: StepSelections, idx: number): string | string[] {
  return stepSels[idx] ?? ''
}

function isStepComplete(step: FeatOptionStep, stepSels: StepSelections, idx: number): boolean {
  const val = getStepValue(stepSels, idx)
  switch (step.kind) {
    case 'spellcastingClass':
      return typeof val === 'string' && step.classOptions.some((option) => option.name === val)
    case 'abilityScore':
    case 'optionalFeature':
    case 'expertise':
      return typeof val === 'string' && val.length > 0
    case 'spells': {
      const arr = Array.isArray(val) ? val : []
      return new Set(arr.map((reference) => getSpellReferenceKey(reference))).size === step.count
    }
    case 'proficiency': {
      const arr = Array.isArray(val) ? val : []
      return arr.length >= step.count
    }
  }
}

const SpellcastingClassStep = memo(function SpellcastingClassStep({
  step,
  value,
  onChange,
  disabled,
}: {
  step: Extract<FeatOptionStep, { kind: 'spellcastingClass' }>
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{step.label}</p>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select a class…" />
        </SelectTrigger>
        <SelectContent>
          {step.classOptions.map((opt) => (
            <SelectItem
              key={opt.name}
              value={opt.name}
              className="data-[state=checked]:bg-accent/10 data-[state=checked]:text-foreground"
            >
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
  savedSpells,
  selectedElsewhere,
  spellLookup,
}: {
  step: Extract<FeatOptionStep, { kind: 'spells' }>
  selected: string[]
  onToggle: (id: string) => void
  spells: Spell5e[]
  savedSpells: Readonly<Record<string, Spell5e | undefined>>
  selectedElsewhere: ReadonlySet<string>
  spellLookup: Readonly<Record<string, Spell5e>>
}) {
  const matches = useMemo(() => createFeatSpellMatcher(step.chooseFilter), [step.chooseFilter])
  const options = useMemo(() => {
    const priorReferences = new Set(Object.keys(savedSpells))
    const savedReferences = new Map<string, string>()
    for (const reference of [...priorReferences, ...selected]) {
      const key = getSpellReferenceKey(reference)
      if (!savedReferences.has(key)) savedReferences.set(key, reference)
    }
    const available = spells.filter(matches).map((spell) => ({
      spell: spell as Spell5e | undefined,
      id:
        savedReferences.get(getSpellReferenceKey(spell.name, spell.source)) ??
        `${spell.name}|${spell.source ?? ''}`,
      saved: false,
    }))
    const keys = new Set(available.map(({ id }) => getSpellReferenceKey(id)))
    for (const id of savedReferences.values()) {
      const spell =
        savedSpells[id] ??
        (parseSpellReference(id).source ? resolveSpellReference(id, spellLookup) : undefined)
      if (
        !keys.has(getSpellReferenceKey(id)) &&
        (selected.includes(id) || (spell && matches(spell)))
      ) {
        available.push({ spell, id, saved: priorReferences.has(id) })
      }
    }
    return available
  }, [spells, matches, savedSpells, selected, spellLookup])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {step.label}
        {selected.length > 0 && (
          <span className="ml-2 text-xs text-primary">
            ({selected.length}/{step.count} chosen)
          </span>
        )}
      </p>
      <div className="border rounded-md max-h-64 overflow-y-auto divide-y divide-border/50">
        {options.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground italic">No matching spells found.</p>
        ) : (
          options.map(({ spell, id, saved }) => {
            const reference = parseSpellReference(id)
            const checkboxId = `spell-cb-${id.replace(/[^a-zA-Z0-9]/g, '-')}`
            const isSelected = selected.includes(id)
            const atLimit =
              !isSelected &&
              (selected.length >= step.count || selectedElsewhere.has(getSpellReferenceKey(id)))
            return (
              <label
                key={id}
                htmlFor={checkboxId}
                className={cn(
                  'flex w-full items-center gap-3 border-l-2 px-3 py-2 transition-colors',
                  isSelected
                    ? 'border-l-accent bg-accent/10 text-foreground'
                    : 'border-l-transparent hover:bg-muted/40',
                  atLimit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                )}
              >
                <Checkbox
                  id={checkboxId}
                  checked={isSelected}
                  onCheckedChange={() => !atLimit && onToggle(id)}
                  disabled={atLimit}
                  tabIndex={atLimit ? -1 : 0}
                  className="data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">
                    {spell
                      ? spell.name
                      : `Spell data unavailable: ${reference.name}${reference.source ? ` (${reference.source})` : ''}`}
                  </span>
                  {spell && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} ·{' '}
                      {getSchoolName(spell.school)}
                    </span>
                  )}
                  {saved && <Badge variant="outline">Saved choice</Badge>}
                  {!isSelected && selectedElsewhere.has(getSpellReferenceKey(id)) && (
                    <span className="block text-xs text-muted-foreground">
                      Chosen in another step
                    </span>
                  )}
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
  languages,
  skillNames,
}: {
  step: Extract<FeatOptionStep, { kind: 'proficiency' }>
  selected: string[]
  onToggle: (name: string) => void
  languages: Language5e[]
  skillNames: readonly string[]
}) {
  const pool = useMemo(() => {
    if (step.optionPool && step.optionPool.length > 0) return step.optionPool
    if (step.domain === 'skills') return [...skillNames]
    if (step.domain === 'languages') {
      return [...new Set(languages.map((l) => l.name))].sort()
    }
    return []
  }, [step.domain, step.optionPool, languages, skillNames])

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {step.label}
        {selected.length > 0 && (
          <span className="ml-2 text-xs text-primary">
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
                'flex w-full items-center gap-3 border-l-2 px-3 py-2 transition-colors',
                isSelected
                  ? 'border-l-accent bg-accent/10 text-foreground'
                  : 'border-l-transparent hover:bg-muted/40',
                atLimit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <Checkbox
                id={checkboxId}
                checked={isSelected}
                onCheckedChange={() => !atLimit && onToggle(name)}
                disabled={atLimit}
                tabIndex={atLimit ? -1 : 0}
                className="data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
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
          const label = ABILITY_ABBREV_TO_TITLE[abilityKey] ?? abilityKey
          const isSelected = value === abilityKey
          return (
            <button
              key={abilityKey}
              type="button"
              onClick={() => onChange(abilityKey)}
              className={cn(
                'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                isSelected
                  ? 'border-accent bg-accent/10 text-foreground'
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
          filtered.map((f) => {
            const isSelected = value === f.name
            return (
              <label
                key={`${f.name}|${f.source ?? ''}`}
                className={cn(
                  'flex cursor-pointer items-center gap-3 border-l-2 px-3 py-2 transition-colors',
                  isSelected
                    ? 'border-l-accent bg-accent/10 text-foreground'
                    : 'border-l-transparent hover:bg-muted/40',
                )}
              >
                <input
                  type="radio"
                  name="optFeature"
                  checked={isSelected}
                  onChange={() => onChange(f.name)}
                  className="size-4 shrink-0 accent-[var(--color-accent-9)]"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{f.name}</span>
                </div>
                {f.source && (
                  <Badge
                    variant="outline"
                    className="h-4 shrink-0 px-1 py-0 text-xs text-muted-foreground"
                  >
                    {f.source}
                  </Badge>
                )}
              </label>
            )
          })
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
  skillNames,
}: {
  step: Extract<FeatOptionStep, { kind: 'expertise' }>
  value: string
  onChange: (v: string) => void
  proficientSkillNames: string[]
  skillNames: readonly string[]
}) {
  const pool = proficientSkillNames.length > 0 ? proficientSkillNames : skillNames
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{step.label}</p>
      {proficientSkillNames.length === 0 && (
        <p className="text-xs text-warning-foreground">
          No proficient skills found — showing all skills.
        </p>
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
                ? 'border-accent bg-accent/10 text-foreground'
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

function seedStepSelections(
  steps: FeatOptionStep[],
  init: FeatOptionSelections,
  spellLookup: Readonly<Record<string, Spell5e>>,
): { stepSels: StepSelections; unassignedSpells: string[] } {
  const assigned = assignSavedFeatSpells(steps, init.spells ?? [], spellLookup)
  const result: StepSelections = { ...assigned.selections }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    switch (step.kind) {
      case 'spellcastingClass':
        if (init.spellcastingClass) result[i] = init.spellcastingClass
        break
      case 'spells':
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
  return { stepSels: result, unassignedSpells: assigned.unassigned }
}

function validateFixedSpellcastingClass(
  feat: Feat5e,
  fixedSpellcastingClass?: string,
): string | undefined {
  if (!fixedSpellcastingClass) return undefined
  const classStep = deriveFeatOptionSteps(feat).find((step) => step.kind === 'spellcastingClass')
  return classStep?.kind === 'spellcastingClass' &&
    classStep.classOptions.some((option) => option.name === fixedSpellcastingClass)
    ? fixedSpellcastingClass
    : undefined
}

function initWizardState(
  feat: Feat5e,
  initialSelections?: FeatOptionSelections,
  fixedSpellcastingClass?: string,
  spellLookup: Readonly<Record<string, Spell5e>> = {},
): { steps: FeatOptionStep[]; stepSels: StepSelections; unassignedSpells: string[] } {
  let steps = deriveFeatOptionSteps(feat)
  const validatedFixedClass = validateFixedSpellcastingClass(feat, fixedSpellcastingClass)
  const seededSelections = validatedFixedClass
    ? {
        ...initialSelections,
        spellcastingClass: validatedFixedClass,
        spells:
          initialSelections?.spellcastingClass === validatedFixedClass
            ? initialSelections.spells
            : undefined,
      }
    : initialSelections

  if (seededSelections?.spellcastingClass) {
    const classIdx = steps.findIndex((s) => s.kind === 'spellcastingClass')
    if (classIdx >= 0) {
      const spellSteps = deriveSpellStepsForClass(feat, seededSelections.spellcastingClass).map(
        ({ count, chooseFilter, label }): FeatOptionStep => ({
          kind: 'spells',
          label,
          count,
          chooseFilter,
        }),
      )
      steps = validatedFixedClass
        ? [
            ...steps.slice(0, classIdx),
            ...spellSteps,
            ...steps.slice(classIdx + 1).filter((s) => s.kind !== 'spells'),
          ]
        : [
            ...steps.slice(0, classIdx + 1),
            ...spellSteps,
            ...steps.slice(classIdx + 1).filter((s) => s.kind !== 'spells'),
          ]
    }
  }

  return {
    steps,
    ...seedStepSelections(steps, seededSelections ?? {}, spellLookup),
  }
}

export interface FeatOptionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feat: Feat5e
  proficientSkillNames?: string[]
  initialSelections?: FeatOptionSelections
  fixedSpellcastingClass?: string
  onFinish: (selections: FeatOptionSelections) => void
  onDismiss?: () => void
}

export const FeatOptionsModal = memo(function FeatOptionsModal({
  open,
  onOpenChange,
  feat,
  proficientSkillNames = [],
  initialSelections,
  fixedSpellcastingClass,
  onFinish,
  onDismiss,
}: FeatOptionsModalProps) {
  const { spells, optionalfeatures, languages } = useFilteredGameData()
  const rawSpellLookup = useSpellLookup()
  const savedSpells = useMemo(
    () =>
      Object.fromEntries(
        (initialSelections?.spells ?? []).map((reference) => [
          reference,
          parseSpellReference(reference).source
            ? resolveSpellReference(reference, rawSpellLookup)
            : undefined,
        ]),
      ),
    [initialSelections?.spells, rawSpellLookup],
  )
  const skillNames = useSkillList()
  const validatedFixedSpellcastingClass = validateFixedSpellcastingClass(
    feat,
    fixedSpellcastingClass,
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [wizard, setWizard] = useState(() =>
    initWizardState(feat, initialSelections, validatedFixedSpellcastingClass, rawSpellLookup),
  )
  const { steps: allSteps, stepSels, unassignedSpells } = wizard

  const currentStep = allSteps[stepIndex]
  const selectedElsewhere = useMemo(() => {
    const keys = new Set<string>()
    allSteps.forEach((step, index) => {
      const selected = stepSels[index]
      if (index !== stepIndex && step.kind === 'spells' && Array.isArray(selected)) {
        for (const reference of selected) keys.add(getSpellReferenceKey(reference))
      }
    })
    return keys
  }, [allSteps, stepSels, stepIndex])

  const setSingle = useCallback((idx: number, val: string) => {
    setWizard((prev) => ({ ...prev, stepSels: { ...prev.stepSels, [idx]: val } }))
  }, [])

  const toggleMulti = useCallback((idx: number, val: string, limit: number) => {
    setWizard((prev) => {
      const current = Array.isArray(prev.stepSels[idx]) ? (prev.stepSels[idx] as string[]) : []
      if (current.includes(val))
        return { ...prev, stepSels: { ...prev.stepSels, [idx]: current.filter((v) => v !== val) } }
      if (current.length >= limit) return prev
      const isSpell = prev.steps[idx]?.kind === 'spells'
      const key = getSpellReferenceKey(val)
      if (
        isSpell &&
        prev.steps.some((step, index) => {
          const selected = prev.stepSels[index]
          return (
            step.kind === 'spells' &&
            Array.isArray(selected) &&
            selected.some((reference) => getSpellReferenceKey(reference) === key)
          )
        })
      )
        return prev
      return {
        ...prev,
        stepSels: { ...prev.stepSels, [idx]: [...current, val] },
        unassignedSpells: isSpell
          ? prev.unassignedSpells.filter((reference) => getSpellReferenceKey(reference) !== key)
          : prev.unassignedSpells,
      }
    })
  }, [])

  const handleClassChosen = useCallback(
    (className: string, stepIdx: number) => {
      const spellSteps = deriveSpellStepsForClass(feat, className).map(
        ({ count, chooseFilter, label }): FeatOptionStep => ({
          kind: 'spells',
          label,
          count,
          chooseFilter,
        }),
      )
      setWizard((prev) => {
        if (prev.stepSels[stepIdx] === className) return prev
        const before = prev.steps.slice(0, stepIdx + 1)
        const after = prev.steps.slice(stepIdx + 1).filter((s) => s.kind !== 'spells')
        const steps = [...before, ...spellSteps, ...after]
        const stepSels: StepSelections = { [stepIdx]: className }
        for (let index = 0; index < steps.length; index++) {
          if (index === stepIdx || steps[index].kind === 'spells') continue
          const oldIndex = prev.steps.indexOf(steps[index])
          if (oldIndex >= 0 && prev.stepSels[oldIndex] !== undefined) {
            stepSels[index] = prev.stepSels[oldIndex]
          }
        }
        return { steps, stepSels, unassignedSpells: [] }
      })
    },
    [feat],
  )

  const buildSelections = useCallback((): FeatOptionSelections => {
    const result: FeatOptionSelections = validatedFixedSpellcastingClass
      ? { spellcastingClass: validatedFixedSpellcastingClass }
      : {}
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

    if (spellKeys.length > 0) {
      const remaining = new Map(
        spellKeys.map((reference) => [getSpellReferenceKey(reference), reference]),
      )
      result.spells = []
      for (const reference of initialSelections?.spells ?? []) {
        const key = getSpellReferenceKey(reference)
        const selected = remaining.get(key)
        if (selected !== undefined) {
          result.spells.push(selected)
          remaining.delete(key)
        }
      }
      result.spells.push(...remaining.values())
    }
    if (skills.length > 0) result.skills = skills
    if (languages.length > 0) result.languages = languages
    if (tools.length > 0) result.tools = tools
    return result
  }, [allSteps, stepSels, validatedFixedSpellcastingClass, initialSelections?.spells])

  const isLast = stepIndex === allSteps.length - 1
  const stepValue = getStepValue(stepSels, stepIndex)
  const spellReferencesToCheck = isLast
    ? (buildSelections().spells ?? [])
    : currentStep?.kind === 'spells' && Array.isArray(stepValue)
      ? stepValue
      : []
  const hasMissingSpell = spellReferencesToCheck.some(
    (reference) =>
      !parseSpellReference(reference).source || !resolveSpellReference(reference, rawSpellLookup),
  )
  const canAdvance =
    !!currentStep &&
    isStepComplete(currentStep, stepSels, stepIndex) &&
    !hasMissingSpell &&
    (!isLast ||
      (unassignedSpells.length === 0 &&
        allSteps.every((step, index) => isStepComplete(step, stepSels, index))))

  const handleNext = useCallback(() => {
    if (!canAdvance) return
    if (!isLast) {
      setStepIndex((i) => i + 1)
    } else {
      onFinish(buildSelections())
    }
  }, [canAdvance, isLast, buildSelections, onFinish])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) onDismiss?.()
      onOpenChange(isOpen)
    },
    [onOpenChange, onDismiss],
  )

  if (!currentStep) {
    const savedChoices = [
      ['Spellcasting class', initialSelections?.spellcastingClass],
      [
        'Spells',
        initialSelections?.spells
          ?.map((reference) => {
            const { name, source } = parseSpellReference(reference)
            return `${name}${source ? ` (${source})` : ''}`
          })
          .join(', '),
      ],
      ['Skills', initialSelections?.skills?.join(', ')],
      ['Languages', initialSelections?.languages?.join(', ')],
      ['Tools', initialSelections?.tools?.join(', ')],
      [
        'Ability score',
        initialSelections?.abilityScore
          ? (ABILITY_ABBREV_TO_TITLE[initialSelections.abilityScore] ??
            initialSelections.abilityScore)
          : undefined,
      ],
      ['Optional feature', initialSelections?.optionalFeature],
      ['Expertise', initialSelections?.expertiseSkill],
    ].filter(([, value]) => value)

    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure: {feat.name}</DialogTitle>
            <DialogDescription>
              Current rules for {feat.name} ({feat.source}) have no setup choices.
            </DialogDescription>
          </DialogHeader>
          {savedChoices.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground">
                Your saved setup and its benefits are unchanged. Cancel to keep them, then reopen
                setup after restoring the rules to edit your choices. Clearing removes all choices
                below and only the benefits owned by this setup; the feat remains on your character.
              </p>
              <dl className="max-h-64 space-y-2 overflow-y-auto text-sm">
                {savedChoices.map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-medium">{label}</dt>
                    <dd className="text-muted-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            {savedChoices.length > 0 && (
              <Button variant="destructive" onClick={() => onFinish({})}>
                Clear saved setup
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const currentValue = getStepValue(stepSels, stepIndex)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <MagicWand className="h-5 w-5 text-primary" weight="duotone" />
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
                    ? 'h-2 w-4 bg-primary'
                    : i < stepIndex
                      ? 'h-2 w-2 bg-primary/50'
                      : 'h-2 w-2 bg-border',
                )}
              />
            ))}
          </div>
        )}

        <div className="py-2">
          {unassignedSpells.length > 0 && (
            <div className="mb-4 space-y-2 rounded-md border p-3" role="status">
              <p className="text-sm font-medium">Saved spells need attention</p>
              <p className="text-sm text-muted-foreground">
                These saved choices could not be placed in the current spell steps. Restore their
                rules and select them in a matching step, or remove them before finishing.
              </p>
              {unassignedSpells.map((reference) => {
                const parsed = parseSpellReference(reference)
                const label = `${parsed.name}${parsed.source ? ` (${parsed.source})` : ''}`
                return (
                  <div key={reference} className="flex items-center justify-between gap-2 text-sm">
                    <span>{label}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove saved choice: ${label}`}
                      onClick={() =>
                        setWizard((prev) => ({
                          ...prev,
                          unassignedSpells: prev.unassignedSpells.filter(
                            (value) => value !== reference,
                          ),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
          {currentStep.kind === 'spellcastingClass' && (
            <SpellcastingClassStep
              step={currentStep}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChange={(v) => handleClassChosen(v, stepIndex)}
              disabled={!!validatedFixedSpellcastingClass}
            />
          )}
          {currentStep.kind === 'spells' && (
            <SpellPickStep
              step={currentStep}
              selected={Array.isArray(currentValue) ? currentValue : []}
              onToggle={(id) => toggleMulti(stepIndex, id, currentStep.count)}
              spells={spells as Spell5e[]}
              savedSpells={savedSpells}
              selectedElsewhere={selectedElsewhere}
              spellLookup={rawSpellLookup}
            />
          )}
          {currentStep.kind === 'proficiency' && (
            <ProficiencyPickStep
              step={currentStep}
              selected={Array.isArray(currentValue) ? currentValue : []}
              onToggle={(name) => toggleMulti(stepIndex, name, currentStep.count)}
              languages={languages}
              skillNames={skillNames}
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
              skillNames={skillNames}
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
