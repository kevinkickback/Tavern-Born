import { findClassReference } from '@/lib/5etools/classReference'

export { hasExpertiseChoice } from '@/lib/5etools/featExpertiseRules'

import {
  type FeatOptionTarget,
  getFeatOptionOwnerKey,
  isFeatOptionTargetActive,
} from '@/lib/character/commands/featCommandIdentity'
import { getFixedFeatOptionKey, resolveFixedFeatGrant } from '@/lib/featGrants'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import type { SourceTag } from '@/lib/provenance/types'
import type { Feat5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'

/** Read-only UI focus; this never becomes a saved feat option owner. */
export function getFeatSetupFocusKey(
  target: FeatOptionTarget,
  provider?: SourceTag,
): string | undefined {
  const owner = getFeatOptionOwnerKey(target)
  if (!owner || !target.name.trim() || !target.source?.trim()) return undefined
  return JSON.stringify([
    getFeatSelectionKey(target),
    owner,
    provider
      ? [
          provider.sourceType,
          provider.sourceName,
          provider.sourceRef ?? '',
          provider.grantSource ?? '',
          provider.grantVariant ?? '',
        ]
      : null,
  ])
}

interface FeatSetupOwner {
  target: FeatOptionTarget & { source: string }
  focusKey: string
  label: string
  view: 'character' | 'bonus'
  options?: FeatOptionSelections
  data?: Feat5e
}

/** Current selected owners, including retained source-unavailable setup; no name-only borrowing. */
export function getFeatSetupOwners(
  character: Character,
  feats: readonly Feat5e[],
): FeatSetupOwner[] {
  const rows: FeatSetupOwner[] = []
  const add = (
    target: FeatOptionTarget,
    options: FeatOptionSelections | undefined,
    label: string,
    provider?: SourceTag,
  ) => {
    const focusKey = getFeatSetupFocusKey(target, provider)
    if (!focusKey || !target.source || !isFeatOptionTargetActive(character, target)) return
    const matches = feats.filter(
      (feat) => getFeatSelectionKey(feat) === getFeatSelectionKey(target),
    )
    rows.push({
      target: { ...target, source: target.source },
      focusKey,
      label,
      options,
      data: matches.length === 1 ? matches[0] : undefined,
      view: target.selectionKind === 'bonus' ? 'bonus' : 'character',
    })
  }
  for (const feat of character.feats)
    add({ ...feat, selectionKind: 'ordinary' }, feat.options, 'Character feat')
  for (const feat of character.specialFeats ?? [])
    add({ ...feat, selectionKind: 'bonus' }, feat.options, 'Bonus feat')
  for (const choice of character.classFeatChoices ?? []) {
    const entry = findClassReference(
      { name: choice.className, source: choice.classSource },
      character.classProgression,
    )
    if (
      !entry ||
      (choice.subclassName &&
        (entry.subclass !== choice.subclassName || entry.subclassSource !== choice.subclassSource))
    )
      continue
    for (const feat of choice.feats) {
      if (feat.classLevel && feat.classLevel > entry.levels) continue
      add(
        { ...feat, classFeatChoiceId: choice.id },
        feat.options,
        `${choice.className}: ${choice.progressionName}`,
      )
    }
  }
  for (const choice of character.provenance?.choices ?? []) {
    if (
      choice.domain !== 'feats' ||
      !['race', 'subrace', 'background'].includes(choice.sourceTag.sourceType)
    )
      continue
    for (const feat of choice.selectedRefs ??
      choice.selected.map((name) => ({ name, source: undefined, options: undefined })))
      add({ ...feat, provenanceChoiceId: choice.id }, feat.options, choice.sourceTag.sourceName)
  }
  for (const [name, tags] of Object.entries(character.provenance?.feats ?? {})) {
    for (const tag of tags) {
      if (tag.grantType !== 'fixed') continue
      const resolved = resolveFixedFeatGrant(feats, name, tag)
      add(
        {
          name: resolved.name,
          source: resolved.source,
          fixedGrant: true,
          grantVariant: resolved.variant,
        },
        character.fixedFeatOptions?.[
          getFixedFeatOptionKey(resolved.name, resolved.source, resolved.variant)
        ],
        `${tag.sourceType}: ${tag.sourceName}`,
        tag,
      )
    }
  }
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.focusKey, (counts.get(row.focusKey) ?? 0) + 1)
  return rows.filter((row) => counts.get(row.focusKey) === 1)
}

export function featSetupOwnerTarget(owner: FeatSetupOwner): string {
  return `/feats?${new URLSearchParams({ feat: owner.target.name, source: owner.target.source, view: owner.view, focus: 'feat', featOwner: owner.focusKey }).toString()}`
}
