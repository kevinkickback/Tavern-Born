import type { NormalizedCharacterChoice } from '@/types/classRules'

export function normalizedChoiceIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Existing normalized class-choice identity, shared by its producer and scoped consumers. */
export function getNormalizedClassChoiceId(
  owner: NormalizedCharacterChoice['owner'],
  label: string,
  level: number,
): string {
  const subclassPart = owner.subclassName
    ? `|subclass:${normalizedChoiceIdPart(owner.subclassName)}|${normalizedChoiceIdPart(owner.subclassSource ?? '')}`
    : ''
  return `class:${normalizedChoiceIdPart(owner.name)}|${normalizedChoiceIdPart(owner.source)}${subclassPart}|choice:${normalizedChoiceIdPart(label)}|${level}`
}
