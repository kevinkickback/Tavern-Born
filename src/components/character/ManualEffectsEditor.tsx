import { Plus, SlidersHorizontal, Trash } from '@phosphor-icons/react'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSkillList } from '@/hooks/data/useGameData'
import { ABILITY_NAMES, type AbilityName } from '@/lib/calculations/abilityScores'
import {
  removeManualEffectCommand,
  setEffectSuppressedCommand,
  upsertManualEffectCommand,
} from '@/lib/character/commands/effectCommands'
import { useCharacterStore } from '@/store/characterStore'
import type { CharacterEffect, NumericEffectOperation, NumericEffectTarget } from '@/types/effects'

type ManualTargetKind = NumericEffectTarget['kind']
type NumericOperationKind = NumericEffectOperation['kind']

const TARGET_OPTIONS: ReadonlyArray<{ kind: ManualTargetKind; label: string }> = [
  { kind: 'ability-score', label: 'Ability score' },
  { kind: 'ability-check-modifier', label: 'Ability checks' },
  { kind: 'skill-modifier', label: 'Skill modifier' },
  { kind: 'saving-throw-modifier', label: 'Saving throw' },
  { kind: 'initiative', label: 'Initiative' },
  { kind: 'armor-class', label: 'Armor Class' },
  { kind: 'hit-point-maximum', label: 'Maximum HP' },
  { kind: 'speed', label: 'Speed' },
  { kind: 'carrying-capacity', label: 'Carrying capacity' },
  { kind: 'attack-roll', label: 'All attack rolls' },
  { kind: 'damage', label: 'All damage rolls' },
  { kind: 'spell-attack', label: 'All spell attacks' },
  { kind: 'spell-save-dc', label: 'All spell save DCs' },
  { kind: 'sense', label: 'Sense range' },
  { kind: 'resource-maximum', label: 'Resource maximum' },
]

const OPERATION_OPTIONS: ReadonlyArray<{ kind: NumericOperationKind; label: string }> = [
  { kind: 'add', label: 'Add or subtract' },
  { kind: 'multiply', label: 'Multiply' },
  { kind: 'minimum', label: 'Minimum' },
  { kind: 'maximum', label: 'Maximum' },
  { kind: 'set', label: 'Set before modifiers' },
  { kind: 'base', label: 'Minimum base' },
  { kind: 'override', label: 'Exact override' },
]

function titleCase(value: string): string {
  return value.replace(/(^|[-\s])\p{L}/gu, (letter) => letter.toUpperCase())
}

function buildTarget(
  kind: ManualTargetKind,
  ability: AbilityName,
  qualifier: string,
): NumericEffectTarget | null {
  if (kind === 'ability-score' || kind === 'ability-check-modifier') return { kind, ability }
  if (kind === 'saving-throw-modifier') return { kind, ability }
  const normalizedQualifier = qualifier.trim().toLowerCase()
  if (kind === 'skill-modifier') {
    return normalizedQualifier ? { kind, skill: normalizedQualifier } : null
  }
  if (kind === 'speed') return normalizedQualifier ? { kind, mode: normalizedQualifier } : null
  if (kind === 'sense') return normalizedQualifier ? { kind, sense: normalizedQualifier } : null
  if (kind === 'resource-maximum') {
    return normalizedQualifier ? { kind, resourceId: normalizedQualifier } : null
  }
  return { kind }
}

function formatTarget(target: CharacterEffect['target']): string {
  const option = TARGET_OPTIONS.find((entry) => entry.kind === target.kind)
  const scope = Object.entries(target).find(([key]) => key !== 'kind')?.[1]
  return `${option?.label ?? titleCase(target.kind)}${scope ? ` · ${titleCase(String(scope))}` : ''}`
}

function formatOperation(operation: CharacterEffect['operation']): string {
  if ('value' in operation) {
    const prefix = operation.kind === 'add' && operation.value >= 0 ? '+' : ''
    return `${operation.kind}: ${prefix}${operation.value}`
  }
  return operation.kind
}

export function ManualEffectsForm({ showHeader = true }: { showHeader?: boolean }) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const parsedSkills = useSkillList()
  const [label, setLabel] = useState('')
  const [targetKind, setTargetKind] = useState<ManualTargetKind>('ability-score')
  const [ability, setAbility] = useState<AbilityName>('strength')
  const [qualifier, setQualifier] = useState('')
  const [operationKind, setOperationKind] = useState<NumericOperationKind>('add')
  const [value, setValue] = useState('')
  const [condition, setCondition] = useState('')
  const labelId = useId()
  const qualifierId = useId()
  const valueId = useId()
  const conditionId = useId()
  const needsAbility =
    targetKind === 'ability-score' ||
    targetKind === 'ability-check-modifier' ||
    targetKind === 'saving-throw-modifier'
  const needsSkill = targetKind === 'skill-modifier'
  const qualifierLabel =
    targetKind === 'speed'
      ? 'Movement mode'
      : targetKind === 'sense'
        ? 'Sense name'
        : targetKind === 'resource-maximum'
          ? 'Resource ID'
          : null

  if (!character) return null

  const update = (patch: Parameters<typeof updateCharacter>[1]) =>
    updateCharacter(character.id, patch)

  const addEffect = () => {
    const normalizedLabel = label.trim()
    const numericValue = Number(value)
    const target = buildTarget(targetKind, ability, qualifier)
    if (!normalizedLabel) {
      toast.error('Describe where this adjustment came from.')
      return
    }
    if (!target) {
      toast.error('Choose the specific ability, skill, movement mode, sense, or resource.')
      return
    }
    if (!value.trim() || !Number.isFinite(numericValue)) {
      toast.error('Enter a valid number.')
      return
    }
    const effect: CharacterEffect = {
      id: crypto.randomUUID(),
      label: normalizedLabel,
      target,
      operation: { kind: operationKind, value: numericValue },
      source: { kind: 'manual', name: normalizedLabel },
      condition: condition.trim() || undefined,
    }
    update(upsertManualEffectCommand(character, effect))
    setLabel('')
    setValue('')
    setCondition('')
    toast.success('Manual adjustment added.')
  }

  return (
    <div className="space-y-5">
      {showHeader && (
        <header>
          <h2 className="flex items-center gap-2 font-semibold">
            <SlidersHorizontal className="size-5 text-primary" />
            Manual Effects
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a labeled adjustment when source data cannot represent a rule reliably. Exact
            overrides are applied last and should be used sparingly.
          </p>
        </header>
      )}

      <section className="grid gap-3 border-y border-border py-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={labelId}>What caused it?</Label>
          <Input
            id={labelId}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Describe the rule or table ruling"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Target</Label>
          <Select
            value={targetKind}
            onValueChange={(next) => {
              setTargetKind(next as ManualTargetKind)
              setQualifier('')
            }}
          >
            <SelectTrigger className="w-full" aria-label="Adjustment target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_OPTIONS.map((option) => (
                <SelectItem key={option.kind} value={option.kind}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsAbility && (
          <div className="space-y-1.5">
            <Label>Ability</Label>
            <Select value={ability} onValueChange={(next) => setAbility(next as AbilityName)}>
              <SelectTrigger className="w-full" aria-label="Target ability">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABILITY_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {titleCase(name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {needsSkill && (
          <div className="space-y-1.5">
            <Label>Skill</Label>
            {parsedSkills.length > 0 ? (
              <Select value={qualifier} onValueChange={setQualifier}>
                <SelectTrigger className="w-full" aria-label="Target skill">
                  <SelectValue placeholder="Choose a skill" />
                </SelectTrigger>
                <SelectContent>
                  {parsedSkills.map((skill) => (
                    <SelectItem key={skill} value={skill}>
                      {titleCase(skill)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={qualifierId}
                value={qualifier}
                onChange={(event) => setQualifier(event.target.value)}
                placeholder="Skill name"
              />
            )}
          </div>
        )}
        {qualifierLabel && (
          <div className="space-y-1.5">
            <Label htmlFor={qualifierId}>{qualifierLabel}</Label>
            <Input
              id={qualifierId}
              value={qualifier}
              onChange={(event) => setQualifier(event.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Operation</Label>
          <Select
            value={operationKind}
            onValueChange={(next) => setOperationKind(next as NumericOperationKind)}
          >
            <SelectTrigger className="w-full" aria-label="Adjustment operation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATION_OPTIONS.map((option) => (
                <SelectItem key={option.kind} value={option.kind}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={valueId}>Value</Label>
          <Input
            id={valueId}
            type="number"
            step="any"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={conditionId}>Condition or note (optional)</Label>
          <Input
            id={conditionId}
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            placeholder="Shown as text; it is not evaluated automatically"
          />
        </div>
        <Button type="button" className="sm:col-span-2" onClick={addEffect}>
          <Plus />
          Add adjustment
        </Button>
      </section>
    </div>
  )
}

export function ManualEffectsList() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const manualEffects = useMemo(
    () => (character?.manualEffects ?? []).filter((effect) => effect.source.kind === 'manual'),
    [character?.manualEffects],
  )
  const suppressed = new Set(character?.suppressedEffectIds ?? [])
  if (!character) return null

  const update = (patch: Parameters<typeof updateCharacter>[1]) =>
    updateCharacter(character.id, patch)

  return (
    <Accordion type="single" collapsible defaultValue="manual-effects">
      <AccordionItem value="manual-effects" className="border-0">
        <AccordionTrigger className="py-1">
          <span className="font-semibold">Manual effects</span>
          <span className="ml-auto rounded-md border border-border px-2 py-0.5 text-xs font-medium">
            {manualEffects.length}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-0">
          {manualEffects.length === 0 ? (
            <p className="border-y border-border py-4 text-sm text-muted-foreground">
              No manual effects have been added.
            </p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {manualEffects.map((effect) => {
                const enabled = !suppressed.has(effect.id)
                return (
                  <div key={effect.id} className="flex items-center gap-3 py-3">
                    <Switch
                      checked={enabled}
                      aria-label={`${enabled ? 'Disable' : 'Enable'} ${effect.label}`}
                      onCheckedChange={(checked) =>
                        update(setEffectSuppressedCommand(character, effect.id, !checked))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{effect.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTarget(effect.target)} · {formatOperation(effect.operation)}
                      </p>
                      {effect.condition && (
                        <p className="mt-1 text-xs text-muted-foreground">{effect.condition}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${effect.label}`}
                      onClick={() => update(removeManualEffectCommand(character, effect.id))}
                    >
                      <Trash />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export function ManualEffectsEditor() {
  return (
    <div className="space-y-5">
      <ManualEffectsForm />
      <ManualEffectsList />
    </div>
  )
}
