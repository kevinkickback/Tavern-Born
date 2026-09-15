import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { formatModifier } from '@/lib/calculations/abilityScores'
import { isActionSizedCharacterAction } from '@/lib/calculations/actions'
import { type EffectResolutionContext, isCharacterEffectActive } from '@/lib/calculations/effects'
import type { CharacterAction } from '@/types/actions'
import type { CharacterEffect } from '@/types/effects'

const ACTION_KIND_LABELS: Record<CharacterAction['kind'], string> = {
  action: 'Action',
  attack: 'Attack',
  'bonus-action': 'Bonus action',
  passive: 'Passive',
  reaction: 'Reaction',
  special: 'Special',
}

const EFFECT_TARGET_LABELS: Record<CharacterEffect['target']['kind'], string> = {
  'ability-check': 'Ability check',
  'ability-check-modifier': 'Ability checks',
  'ability-score': 'Ability score',
  'armor-class': 'Armor Class',
  'attack-roll': 'Attack rolls',
  'carrying-capacity': 'Carrying capacity',
  'condition-immunity': 'Condition immunity',
  damage: 'Damage',
  'damage-immunity': 'Damage immunity',
  'damage-resistance': 'Damage resistance',
  initiative: 'Initiative',
  'initiative-roll': 'Initiative rolls',
  'hit-point-maximum': 'Maximum HP',
  'resource-maximum': 'Resource maximum',
  sense: 'Sense',
  'skill-check': 'Skill check',
  'skill-modifier': 'Skill modifier',
  'saving-throw': 'Saving throw',
  'saving-throw-modifier': 'Saving throws',
  speed: 'Speed',
  'spell-attack': 'Spell attacks',
  'spell-save-dc': 'Spell save DC',
}

function actionDetails(action: CharacterAction): string[] {
  const details: string[] = []
  if (action.attackBonus !== undefined) details.push(`${formatModifier(action.attackBonus)} to hit`)
  if (action.save) {
    details.push(`DC ${action.save.dc}${action.save.ability ? ` ${action.save.ability}` : ''}`)
  }
  if (action.range) details.push(action.range)
  for (const damage of action.damage ?? []) {
    const amount = [damage.dice, damage.bonus ? formatModifier(damage.bonus) : '']
      .filter(Boolean)
      .join(' ')
    details.push([amount, damage.damageType].filter(Boolean).join(' '))
  }
  if ((action.properties?.length ?? 0) > 0) details.push(action.properties?.join(', ') ?? '')
  if ((action.mastery?.length ?? 0) > 0) {
    details.push(`Mastery: ${action.mastery?.map((entry) => entry.name).join(', ')}`)
  }
  return details.filter(Boolean)
}

function sourceLabel(source: CharacterAction['source'] | CharacterEffect['source']): string {
  return [source.name, source.source].filter(Boolean).join(' · ')
}

function titleCase(value: string): string {
  return value.replace(/(^|[-\s])\p{L}/gu, (letter) => letter.toUpperCase())
}

function effectTargetLabel(effect: CharacterEffect): string {
  const qualifier = Object.entries(effect.target).find(([key]) => key !== 'kind')?.[1]
  return [EFFECT_TARGET_LABELS[effect.target.kind], qualifier ? titleCase(String(qualifier)) : '']
    .filter(Boolean)
    .join(' · ')
}

function effectOperationLabel(effect: CharacterEffect): string {
  const operation = effect.operation
  if ('value' in operation) {
    const value = operation.kind === 'add' ? formatModifier(operation.value) : operation.value
    return `${titleCase(operation.kind)} ${value}`
  }
  if (operation.kind === 'conditional-note') return operation.note
  return titleCase(operation.kind)
}

export function SourceDerivedActions({ actions }: { actions: readonly CharacterAction[] }) {
  const derivedActions = actions.filter(
    (action) => action.source.kind !== 'manual' && isActionSizedCharacterAction(action),
  )

  return (
    <Accordion type="single" collapsible defaultValue="source-derived-actions">
      <AccordionItem value="source-derived-actions" className="border-0">
        <AccordionTrigger className="py-1">
          <span className="min-w-0">
            <span className="block font-semibold">Source-derived actions</span>
            <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
              Limited to attacks and rules that explicitly grant an action, bonus action, or
              reaction. Manage each entry at its source.
            </span>
          </span>
          <Badge variant="outline" className="ml-auto">
            {derivedActions.length}
          </Badge>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-0">
          {derivedActions.length === 0 ? (
            <p className="border-y border-border py-4 text-sm text-muted-foreground">
              No source-derived actions are currently available.
            </p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {derivedActions.map((action) => {
                const details = actionDetails(action)
                return (
                  <div key={action.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{action.name}</span>
                      <Badge variant="secondary">{ACTION_KIND_LABELS[action.kind]}</Badge>
                      {!action.active && <Badge variant="outline">Inactive</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {sourceLabel(action.source)}
                      </span>
                    </div>
                    {details.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">{details.join(' · ')}</p>
                    )}
                    {action.inactiveReason && (
                      <p className="mt-1 text-xs text-muted-foreground">{action.inactiveReason}</p>
                    )}
                    {action.description && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {action.description}
                      </p>
                    )}
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

export function SourceDerivedEffects({
  effects,
  resolutionContext,
}: {
  effects: readonly CharacterEffect[]
  resolutionContext: EffectResolutionContext
}) {
  const derivedEffects = effects.filter((effect) => effect.source.kind !== 'manual')

  return (
    <Accordion type="single" collapsible defaultValue="source-derived-effects">
      <AccordionItem value="source-derived-effects" className="border-0">
        <AccordionTrigger className="py-1">
          <span className="min-w-0">
            <span className="block font-semibold">Source-derived effects</span>
            <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
              Derived from ancestry, feats, equipment, and other configured sources. Manage each
              entry at its source.
            </span>
          </span>
          <Badge variant="outline" className="ml-auto">
            {derivedEffects.length}
          </Badge>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-0">
          {derivedEffects.length === 0 ? (
            <p className="border-y border-border py-4 text-sm text-muted-foreground">
              No source-derived effects are currently available.
            </p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {derivedEffects.map((effect) => {
                const active = isCharacterEffectActive(effect, resolutionContext)
                return (
                  <div key={effect.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{effect.label}</span>
                      <Badge variant={active ? 'secondary' : 'outline'}>
                        {active ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {sourceLabel(effect.source)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {effectTargetLabel(effect)} · {effectOperationLabel(effect)}
                    </p>
                    {effect.condition && (
                      <p className="mt-1 text-xs text-muted-foreground">{effect.condition}</p>
                    )}
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
