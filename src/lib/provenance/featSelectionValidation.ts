import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import {
  getSpellNameKey,
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
} from '@/lib/calculations/spellIdentity'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import type { Character, FeatOptionSelections } from '@/types/character'
import { getFeatSelectionKey, getSelectedFeatOwnerKey } from './featSelectionIdentity'
import { normalizeKey } from './normalization'
import type { SourceTag } from './types'

type Path = Array<string | number>
type Owner = { expected: Set<string>; seen: Set<string>; markers: number; path: Path }

/** Each saved choice within a domain must identify a distinct benefit. */
export function getRepeatedFeatOptionDomains(options: FeatOptionSelections | undefined) {
  return (['skills', 'languages', 'tools', 'spells'] as const).filter((domain) => {
    const values = options?.[domain] ?? []
    const keys = values.map((value) =>
      domain === 'spells' ? getSpellReferenceKey(value) : normalizeKey(value),
    )
    return new Set(keys).size !== keys.length
  })
}

/** Catalog-independent admission of selected-copy setup and its reversible benefits. */
export function getInvalidFeatSelectionPaths(character: Character): Path[] {
  const invalid: Path[] = []
  const owners = new Map<string, Owner>()
  const ownerKey = (kind: string, feat: { name: string; source?: string }) =>
    JSON.stringify([kind, getFeatSelectionKey(feat)])
  const benefitKey = (domain: string, key: string) => JSON.stringify([domain, key])
  const profileIndex = character.spells.spellProfiles.findIndex(
    (entry) => entry.id === SPECIAL_SPELL_PROFILE_ID,
  )
  const profile = character.spells.spellProfiles[profileIndex]
  const hasProficiency = (domain: 'skills' | 'languages' | 'tools' | 'expertise', key: string) =>
    character.proficiencies[domain].some((entry) => normalizeKey(entry) === key)

  character.provenance.choices.forEach((choice, index) => {
    if (choice.domain !== 'feats') return
    choice.selectedRefs?.forEach((ref, refIndex) => {
      if (ref.options !== undefined && (!ref.name.trim() || !ref.source?.trim()))
        invalid.push(['provenance', 'choices', index, 'selectedRefs', refIndex])
    })
  })

  for (const [field, kind] of [
    ['feats', 'ordinary'],
    ['specialFeats', 'bonus'],
  ] as const) {
    const ids = new Set<string>()
    for (const [index, feat] of (character[field] ?? []).entries()) {
      const key = ownerKey(getSelectedFeatOwnerKey(kind), feat)
      const path: Path = [field, index]
      if (owners.has(key) || ids.has(feat.id) || !feat.name.trim() || !feat.source.trim())
        invalid.push(path)
      ids.add(feat.id)
      const owner: Owner = { expected: new Set(), seen: new Set(), markers: 0, path }
      owners.set(key, owner)
      for (const domain of getRepeatedFeatOptionDomains(feat.options))
        invalid.push([...path, 'options', domain])
      const add = (domain: string, value: string) => owner.expected.add(benefitKey(domain, value))
      for (const domain of ['skills', 'languages', 'tools'] as const) {
        for (const name of feat.options?.[domain] ?? []) {
          const normalized = normalizeKey(name)
          add(domain, normalized)
          if (!hasProficiency(domain, normalized)) invalid.push([...path, 'options', domain])
        }
      }
      if (feat.options?.expertiseSkill) {
        const skill = normalizeKey(feat.options.expertiseSkill)
        for (const domain of ['skills', 'expertise'] as const) {
          add(domain, skill)
          if (!hasProficiency(domain, skill)) invalid.push([...path, 'options', 'expertiseSkill'])
        }
      }
      if (feat.options?.abilityScore) {
        const ability = normalizeAbilityName(feat.options.abilityScore)
        if (!ability) invalid.push([...path, 'options', 'abilityScore'])
        else add('abilityBonuses', `${ability}:1`)
      }
      if (feat.options?.optionalFeature) add('features', normalizeKey(feat.options.optionalFeature))
      for (const reference of feat.options?.spells ?? []) {
        const target = getSpellReferenceKey(reference)
        if (!isSourceQualifiedSpellReference(reference))
          invalid.push([...path, 'options', 'spells'])
        add('spells', target)
        const count = (field: 'cantrips' | 'spellsKnown' | 'fixedSpells') => {
          const matches = (profile?.[field] ?? []).filter(
            (value) => getSpellReferenceKey(value) === target,
          )
          if (matches.some((value) => !isSourceQualifiedSpellReference(value)))
            invalid.push(['spells', 'spellProfiles', profileIndex, field])
          return matches.length
        }
        const cantrips = count('cantrips')
        const known = count('spellsKnown')
        if (
          !((cantrips === 1 && known === 0) || (cantrips === 0 && known === 1)) ||
          count('fixedSpells') !== 1
        ) {
          invalid.push([...path, 'options', 'spells'])
        }
      }
    }
  }

  const inspect = (tag: SourceTag, domain: string, key: string, path: Path) => {
    const kind = tag.grantVariant
    const selected = kind?.startsWith('selection:')
    if (selected && (tag.sourceType !== 'feat' || tag.grantType !== 'choice')) {
      const owner = owners.get(
        ownerKey(kind ?? '', { name: tag.sourceName, source: tag.sourceRef }),
      )
      if (
        domain !== 'feats' ||
        tag.sourceType !== 'manual' ||
        tag.grantType !== 'choice' ||
        !owner ||
        key !== normalizeKey(tag.sourceName)
      )
        invalid.push(path)
      else if (++owner.markers !== 1) invalid.push(path)
      return
    }
    if (tag.sourceType !== 'feat' || tag.grantType !== 'choice') return
    // Old unqualified setup tags have no reversible selected-copy owner.
    if (!kind) {
      invalid.push(path)
      return
    }
    if (kind.startsWith('choice:')) {
      const choices = character.provenance.choices.filter(
        (choice) => choice.domain === 'feats' && choice.id === kind.slice('choice:'.length),
      )
      const refs = choices.length === 1 ? (choices[0].selectedRefs ?? []) : []
      const matches = refs.filter(
        (ref) =>
          getFeatSelectionKey(ref) ===
          getFeatSelectionKey({ name: tag.sourceName, source: tag.sourceRef }),
      )
      if (
        !tag.sourceName.trim() ||
        !tag.sourceRef?.trim() ||
        matches.length !== 1 ||
        matches[0].options === undefined
      )
        invalid.push(path)
      return
    }
    if (!selected) return
    const owner = owners.get(ownerKey(kind, { name: tag.sourceName, source: tag.sourceRef }))
    const benefit = benefitKey(domain, key)
    if (!owner?.expected.has(benefit) || owner.seen.has(benefit)) {
      invalid.push(path)
      return
    }
    owner.seen.add(benefit)
  }
  const inspectMapEntry = (tag: SourceTag, domain: string, key: string, path: Path) => {
    const normalized = domain === 'spells' ? getSpellNameKey(key) : normalizeKey(key)
    // Commands remove benefits by canonical map key; admission must not hide an alias there.
    if (tag.grantVariant?.startsWith('selection:') && (!normalized || key !== normalized)) {
      invalid.push(path)
      return
    }
    inspect(
      tag,
      domain,
      domain === 'spells' ? getSpellReferenceKey(key, tag.grantSource ?? '') : normalized,
      path,
    )
  }
  const ledger = character.provenance
  for (const domain of [
    'armor',
    'weapons',
    'tools',
    'languages',
    'skills',
    'expertise',
    'savingThrows',
  ] as const) {
    for (const [key, tags] of Object.entries(ledger.proficiencies[domain] ?? {})) {
      tags.forEach((tag, index) => {
        inspectMapEntry(tag, domain, key, ['provenance', 'proficiencies', domain, key, index])
      })
    }
  }
  for (const domain of ['features', 'feats', 'spells', 'equipment'] as const) {
    for (const [key, tags] of Object.entries(ledger[domain])) {
      tags.forEach((tag, index) => {
        inspectMapEntry(tag, domain, key, ['provenance', domain, key, index])
      })
    }
  }
  ledger.abilityBonuses.forEach((record, index) => {
    inspect(record.sourceTag, 'abilityBonuses', `${record.ability}:${record.value}`, [
      'provenance',
      'abilityBonuses',
      index,
    ])
  })
  ledger.choices.forEach((record, index) => {
    inspect(record.sourceTag, 'choices', record.id, ['provenance', 'choices', index])
  })
  for (const owner of owners.values()) {
    if (owner.markers !== 1) invalid.push(owner.path)
    if (owner.expected.size !== owner.seen.size) invalid.push([...owner.path, 'options'])
  }
  return invalid
}
