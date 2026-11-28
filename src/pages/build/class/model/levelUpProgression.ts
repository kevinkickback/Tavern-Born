import {
  CLASSIC_WILD_SHAPE_RESOURCE_ID,
  getClassicArchdruidWildShapeRule,
  isClassicDruid,
} from '@/lib/5etools/archdruidSource'
import { resolveClassReference } from '@/lib/5etools/entityResolvers'
import { splitInlineTagSegments } from '@/lib/5etools/inlineTagSegments'
import { optionalDeclarationObject } from '@/lib/5etools/optionalClassDeclarationStructure'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassResources } from '@/lib/calculations/classResources'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeKey, normalizeOwnerIdentity } from '@/lib/provenance/normalization'

function tableText(value: unknown, descriptive = false) {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    const text = descriptive
      ? splitInlineTagSegments(value)
          .map(({ tag, text }) => (tag?.name === 'tip' ? (tag.fields[1] ?? tag.fields[0]) : text))
          .join('')
      : value
    return renderEntriesToText([text]) || undefined
  }

  const cell = optionalDeclarationObject(value)
  if (typeof cell.value === 'number') {
    if (cell.type === 'bonus') return `+${cell.value}`
    if (cell.type === 'bonusSpeed') return `${cell.value} ft.`
  }
  if (cell.type === 'dice' && Array.isArray(cell.toRoll)) {
    const dice = cell.toRoll.map((part: unknown) => {
      const { number, faces } = optionalDeclarationObject(part)
      return typeof number === 'number' && typeof faces === 'number' ? `${number}d${faces}` : ''
    })
    if (dice.length && dice.every(Boolean)) return dice.join(' + ')
  }
  return undefined
}

function classResources(context: CharacterCalculationContext) {
  const { character, classes, classChoices, abilityScores, effects, lookups } = context
  const unlimitedWildShape = !!getClassicArchdruidWildShapeRule(
    character.classProgression,
    classes,
    classChoices.catalogs,
  )
  const resources = getCharacterClassResources(
    character,
    (entry) => resolveClassReference(entry, lookups.primary, lookups.raw),
    {
      catalogs: classChoices.catalogs,
      charismaModifier: abilityScores.modifiers.charisma,
      abilityModifiers: abilityScores.modifiers,
      effects: effects.declarations,
      effectContext: effects.resolutionContext,
      unlimitedWildShape,
    },
  )
  return { resources, unlimitedWildShape }
}

export function getLevelUpProgressionChanges(
  before: CharacterCalculationContext,
  after: CharacterCalculationContext,
  owner: { name: string; source: string },
  tables: readonly unknown[],
  classLevel: number,
) {
  const resourceKey = ({
    id,
    className,
    classSource,
  }: ReturnType<typeof classResources>['resources'][number]) =>
    JSON.stringify([id, className, classSource])
  const previousState = classResources(before)
  const { resources, unlimitedWildShape } = classResources(after)
  const previousResources = new Map(
    previousState.resources.map((resource) => [resourceKey(resource), resource]),
  )
  const trackedLabels = new Set([
    'spell slots',
    'slot level',
    'proficiency bonus',
    ...resources
      .filter(
        (resource) =>
          normalizeOwnerIdentity(resource.className) === normalizeOwnerIdentity(owner.name) &&
          normalizeOwnerIdentity(resource.classSource) === normalizeOwnerIdentity(owner.source),
      )
      .map(({ label }) => normalizeKey(label)),
  ])
  const resourceChanges = resources.flatMap((resource) => {
    const key = resourceKey(resource)
    const previous = previousResources.get(key)
    const label = resources.some(
      (row) => normalizeKey(row.label) === normalizeKey(resource.label) && resourceKey(row) !== key,
    )
      ? `${resource.label} (${resource.className} · ${resource.classSource})`
      : resource.label
    const changes: { key: string; label: string; from: string; to: string }[] = []
    if ((previous?.max ?? 0) !== resource.max) {
      changes.push({
        key,
        label,
        from: String(previous?.max ?? 0),
        to: String(resource.max),
      })
    }
    if (previous && previous.recoveryText !== resource.recoveryText) {
      changes.push({
        key: `${key}:recovery`,
        label: `${label} recovery`,
        from: previous.recoveryText,
        to: resource.recoveryText,
      })
    }
    return changes
  })
  if (unlimitedWildShape && !previousState.unlimitedWildShape) {
    const previous = previousState.resources.find(
      (resource) =>
        resource.id === CLASSIC_WILD_SHAPE_RESOURCE_ID &&
        isClassicDruid({ name: resource.className, source: resource.classSource }),
    )
    trackedLabels.add(normalizeKey(previous?.label ?? 'Wild Shape'))
    resourceChanges.push({
      key: previous ? resourceKey(previous) : CLASSIC_WILD_SHAPE_RESOURCE_ID,
      label: previous?.label ?? 'Wild Shape',
      from: previous ? String(previous.max) : '—',
      to: 'Unlimited',
    })
  }

  const columns = tables.flatMap((value, tableIndex) => {
    const { colLabels, rows } = optionalDeclarationObject(value)
    if (!Array.isArray(colLabels) || !Array.isArray(rows)) return []
    const current = rows[classLevel - 1]
    const previous = rows[classLevel - 2]
    if (!Array.isArray(current) || (classLevel > 1 && !Array.isArray(previous))) return []
    return colLabels.flatMap((rawLabel: unknown, index: number) => {
      const label = typeof rawLabel === 'string' ? tableText(rawLabel, true) : undefined
      const labelKey = normalizeKey(label)
      const resourceLabel = ['psionic energy die number', 'soulknife energy die number'].includes(
        labelKey,
      )
        ? 'psionic energy dice'
        : labelKey
      if (!label || trackedLabels.has(resourceLabel)) return []
      const to = tableText(current[index])
      const priorCell = previous ? tableText(previous[index]) : '—'
      const from = priorCell && /^[-–—]$/.test(priorCell.trim()) ? '—' : priorCell
      if (to === undefined || from === undefined || from === to) return []
      if (from === '—' && /^[-–—]$/.test(to.trim())) return []
      if (classLevel === 1 && ['0', '0 ft.', '+0'].includes(to)) return []
      return [{ key: `table:${tableIndex}:${index}`, label, from, to }]
    })
  })
  return [...resourceChanges, ...columns]
}
