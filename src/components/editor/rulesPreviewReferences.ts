import { formatSpellLevel, getSchoolName } from '@/lib/calculations/spellUtils'
import {
  getRecursiveTooltipData,
  normalizeKind,
  parseRecursiveReference,
  type RecursiveLookup,
  resolveRecursiveEntity,
} from '@/lib/renderer/recursiveTooltip'
import type { Spell5e } from '@/types/5etools'
import type { RulesPreviewDescriptor } from './rulesPreviewState'

export function findRulesReferenceTrigger(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>('[data-recursive-title]')
    : null
}

export function getRulesPreviewDescriptor(
  trigger: HTMLElement,
  recursiveLookup: RecursiveLookup,
): RulesPreviewDescriptor | null {
  const rawTitle = trigger.getAttribute('data-recursive-title')
  if (!rawTitle) return null

  const reference = parseRecursiveReference(
    rawTitle,
    trigger.textContent?.trim() ?? '',
    trigger.getAttribute('data-hover-type') ?? undefined,
    trigger.getAttribute('data-hover-name') ?? undefined,
    trigger.getAttribute('data-hover-source') ?? undefined,
    trigger.getAttribute('data-hover-class-name') ?? undefined,
    trigger.getAttribute('data-hover-class-source') ?? undefined,
    trigger.getAttribute('data-hover-subclass-name') ?? undefined,
    trigger.getAttribute('data-hover-subclass-source') ?? undefined,
  )

  if (normalizeKind(reference.kind) === 'spell') {
    const spell = resolveRecursiveEntity(recursiveLookup.spells, reference.name, reference.source)
    if (spell) return getSpellPreviewDescriptor(spell, recursiveLookup)
  }

  const resolved = getRecursiveTooltipData(
    reference,
    recursiveLookup,
    rawTitle,
    formatSpellLevel,
    getSchoolName,
  )
  return {
    key: `${reference.kind}|${reference.name}|${reference.source ?? ''}|${reference.className ?? ''}|${reference.subclassName ?? ''}`.toLowerCase(),
    kind: 'generic',
    ...resolved,
    recursiveLookup,
  }
}

export function getSpellPreviewDescriptor(
  spell: Spell5e,
  recursiveLookup: RecursiveLookup,
  sourceContext?: string,
): RulesPreviewDescriptor {
  return {
    key: `spell|${spell.name}|${spell.source ?? ''}`.toLowerCase(),
    kind: 'spell',
    title: spell.name,
    spell,
    sourceContext,
    recursiveLookup,
  }
}
