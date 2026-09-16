const READINESS_FOCUS_PARAM = 'attention'

export function provenanceChoiceReadinessId(choiceId: string): string {
  return `choice:${choiceId}`
}

export function findFocusedProvenanceChoice<T extends { id: string }>(
  readinessFocus: string | null | undefined,
  choices: readonly T[],
): T | undefined {
  return choices.find((choice) => readinessFocus === provenanceChoiceReadinessId(choice.id))
}

export function classChoiceReadinessId(choiceId: string): string {
  return `class-choice:${choiceId}`
}

export function classChoiceDiagnosticReadinessId(
  classKey: string,
  featureName: string,
  code: string,
): string {
  return `class-choice-diagnostic:${classKey}:${featureName}:${code}`
}

export function classSubclassReadinessId(classKey: string): string {
  return `class:subclass:${classKey}`
}

export function classAsiReadinessId(classKey: string, level: number): string {
  return `class:asi:${classKey}:${level}`
}

export type SpellProfileReadinessKind =
  | 'profile'
  | 'cantrips'
  | 'known'
  | 'prepared-over-limit'
  | 'prepared-empty'

export function spellProfileReadinessId(
  kind: SpellProfileReadinessKind,
  profileId: string,
): string {
  return `spells:${kind}:${profileId}`
}

export function spellChoiceReadinessId(profileId: string, choiceId: string): string {
  return `spells:choice:${profileId}:${choiceId}`
}

export function isSpellProfileReadinessFocus(
  readinessFocus: string | null | undefined,
  profileId: string,
  choiceIds: readonly string[] = [],
): boolean {
  const profileKinds: readonly SpellProfileReadinessKind[] = [
    'profile',
    'cantrips',
    'known',
    'prepared-over-limit',
    'prepared-empty',
  ]
  return (
    profileKinds.some((kind) => readinessFocus === spellProfileReadinessId(kind, profileId)) ||
    choiceIds.some((choiceId) => readinessFocus === spellChoiceReadinessId(profileId, choiceId))
  )
}

export function featSetupReadinessId(
  featKey: string,
  className?: string,
  classLevel?: number,
): string {
  return `feat:setup:${featKey}:${className ?? ''}:${classLevel ?? ''}`
}

export function equipmentUnresolvedReadinessId(itemId: string): string {
  return `equipment:unresolved:${itemId}`
}

export function raceAbilityChoiceReadinessId(index: number): string {
  return `race:ability-choice:${index}`
}

export function isRaceAbilityChoiceReadinessFocus(
  readinessFocus: string | null | undefined,
): boolean {
  return /^race:ability-choice:\d+$/.test(readinessFocus ?? '')
}

export function isBaseAbilityScoreReadinessFocus(
  readinessFocus: string | null | undefined,
): boolean {
  return (
    readinessFocus === 'ability-scores:invalid-base' ||
    readinessFocus === 'ability-scores:standard-array' ||
    readinessFocus === 'ability-scores:point-buy'
  )
}

export function isSourceReadinessFocus(readinessFocus: string | null | undefined): boolean {
  return readinessFocus?.startsWith('source:') ?? false
}

/** Adds a Review issue target without disturbing page-specific deep-link parameters. */
export function addReadinessFocus(target: string, issueId: string): string {
  const [pathname, search = ''] = target.split('?')
  const params = new URLSearchParams(search)
  params.set(READINESS_FOCUS_PARAM, issueId)
  const nextSearch = params.toString()
  return nextSearch ? `${pathname}?${nextSearch}` : pathname
}

export function getReadinessFocus(searchParams: URLSearchParams): string | null {
  return searchParams.get(READINESS_FOCUS_PARAM)
}
