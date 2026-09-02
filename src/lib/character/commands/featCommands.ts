import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { mergeSkillState } from '@/lib/calculations/skills'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { getFixedFeatOptionKey } from '@/lib/featGrants'
import {
  addAbilityBonus,
  addGrant,
  addSpellGrant,
  applyFeatGrant,
  applyOptionalFeatureGrant,
  makeSourceTag,
  removeGrantsBySource,
  resolveChoice,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ChoiceDomain, ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export type FeatOptionTarget = { name: string; source?: string; grantVariant?: string }

export interface SelectedFeat {
  name: string
  source?: string
  className?: string
  classSource?: string
  classLevel?: number
}

function getFeatOptionSourceName(feat: FeatOptionTarget): string {
  return feat.grantVariant ? `${feat.name}; ${feat.grantVariant}` : feat.name
}

function applyResult(character: Character, result: CharacterCommandResult): Character {
  return {
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }
}

function removeChoiceGrant(
  ledger: ProvenanceLedger,
  domain: ChoiceDomain,
  itemName: string,
  sourceName: string,
): ProvenanceLedger {
  const normalized = normalizeKey(itemName)
  const map = ledger.proficiencies[domain as keyof typeof ledger.proficiencies] as
    | Record<string, SourceTag[]>
    | undefined
  if (!map) return ledger
  const retained = (map[normalized] ?? []).filter(
    (tag) => !(tag.grantType === 'choice' && tag.sourceName === sourceName),
  )
  const nextMap =
    retained.length > 0
      ? { ...map, [normalized]: retained }
      : Object.fromEntries(Object.entries(map).filter(([key]) => key !== normalized))
  return {
    ...ledger,
    proficiencies: { ...ledger.proficiencies, [domain]: nextMap },
  }
}

export function applyFeatSelectionCommand(
  ledger: ProvenanceLedger,
  featName: string,
  featSource: string | undefined,
): CharacterCommandResult {
  return {
    characterPatch: {},
    provenanceUpdate: applyFeatGrant(ledger, featName, featSource, true),
  }
}

export function removeFeatProvenanceCommand(
  ledger: ProvenanceLedger,
  featName: string,
): CharacterCommandResult {
  const feats = { ...ledger.feats }
  delete feats[normalizeKey(featName)]
  return { characterPatch: {}, provenanceUpdate: { ...ledger, feats } }
}

export function applyOptionalFeatureSelectionCommand(
  ledger: ProvenanceLedger,
  featureName: string,
  featureSource: string | undefined,
  grantingSourceName: string,
  grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
): CharacterCommandResult {
  return {
    characterPatch: {},
    provenanceUpdate: applyOptionalFeatureGrant(
      ledger,
      featureName,
      featureSource,
      grantingSourceName,
      grantingSourceType,
    ),
  }
}

interface OptionalFeatureSelection {
  name: string
  source?: string
}

export function replaceOptionalFeatureSelectionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  replacedFeatures: OptionalFeatureSelection[],
  selectedFeatures: OptionalFeatureSelection[],
  grantingSourceName: string,
  grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
): CharacterCommandResult {
  const replacedKeys = new Set(
    replacedFeatures.map((feature) => `${normalizeKey(feature.name)}|${feature.source ?? ''}`),
  )
  const retainedFeatures = character.features.filter(
    (feature) => !replacedKeys.has(`${normalizeKey(feature.name)}|${feature.source ?? ''}`),
  )
  let provenanceUpdate = ledger
  for (const feature of replacedFeatures) {
    const key = normalizeKey(feature.name)
    const retainedTags = (provenanceUpdate.features[key] ?? []).filter(
      (tag) =>
        !(
          tag.sourceType === grantingSourceType &&
          tag.sourceName === grantingSourceName &&
          tag.grantType === 'choice'
        ),
    )
    const features = { ...provenanceUpdate.features }
    if (retainedTags.length > 0) features[key] = retainedTags
    else delete features[key]
    provenanceUpdate = { ...provenanceUpdate, features }
  }

  for (const feature of selectedFeatures) {
    provenanceUpdate = applyOptionalFeatureGrant(
      provenanceUpdate,
      feature.name,
      feature.source,
      grantingSourceName,
      grantingSourceType,
    )
  }

  return {
    characterPatch: {
      features: [
        ...retainedFeatures,
        ...selectedFeatures.map((feature) => ({
          id: `${feature.name}-opt`,
          name: feature.name,
          source: feature.source ?? '',
          description: '',
        })),
      ],
    },
    provenanceUpdate,
  }
}

export function resolveFeatChoiceCommand(
  ledger: ProvenanceLedger,
  choiceId: string,
  feat: { name: string; source?: string },
): CharacterCommandResult {
  const choice = ledger.choices.find((entry) => entry.id === choiceId && entry.domain === 'feats')
  if (!choice) return { characterPatch: {}, provenanceUpdate: ledger }

  let provenanceUpdate = ledger
  if (choice.selected.length > 0) {
    for (const previousName of choice.selected) {
      const normalized = normalizeKey(previousName)
      const retained = (provenanceUpdate.feats[normalized] ?? []).filter(
        (tag) => !(tag.grantType === 'choice' && tag.sourceName === choice.sourceTag.sourceName),
      )
      provenanceUpdate = {
        ...provenanceUpdate,
        feats:
          retained.length > 0
            ? { ...provenanceUpdate.feats, [normalized]: retained }
            : Object.fromEntries(
                Object.entries(provenanceUpdate.feats).filter(([key]) => key !== normalized),
              ),
      }
    }
    provenanceUpdate = resolveChoice(provenanceUpdate, choiceId, [feat.name])
  } else if (choice.selected.length < choice.chooseCount) {
    provenanceUpdate = resolveChoice(provenanceUpdate, choiceId, [...choice.selected, feat.name])
  } else {
    return { characterPatch: {}, provenanceUpdate: ledger }
  }

  const tag = makeSourceTag(
    choice.sourceTag.sourceType,
    choice.sourceTag.sourceName,
    'choice',
    choice.sourceTag.sourceRef,
  )
  return {
    characterPatch: {},
    provenanceUpdate: addGrant(provenanceUpdate, 'feats', feat.name, tag),
  }
}

export function removeFeatChoiceCommand(
  ledger: ProvenanceLedger,
  choiceId: string,
  featName: string,
): CharacterCommandResult {
  const choice = ledger.choices.find((entry) => entry.id === choiceId && entry.domain === 'feats')
  if (!choice) return { characterPatch: {}, provenanceUpdate: ledger }
  const selected = choice.selected.filter((entry) => normalizeKey(entry) !== normalizeKey(featName))
  let provenanceUpdate = resolveChoice(ledger, choiceId, selected)
  const normalized = normalizeKey(featName)
  const retained = (provenanceUpdate.feats[normalized] ?? []).filter(
    (tag) => !(tag.grantType === 'choice' && tag.sourceName === choice.sourceTag.sourceName),
  )
  provenanceUpdate = {
    ...provenanceUpdate,
    feats:
      retained.length > 0
        ? { ...provenanceUpdate.feats, [normalized]: retained }
        : Object.fromEntries(
            Object.entries(provenanceUpdate.feats).filter(([key]) => key !== normalized),
          ),
  }
  return { characterPatch: {}, provenanceUpdate }
}

export function resolveProficiencyChoiceCommand(
  character: Character,
  ledger: ProvenanceLedger,
  domain: Extract<ChoiceDomain, 'skills' | 'languages' | 'tools' | 'armor' | 'weapons'>,
  itemName: string,
  adding: boolean,
  choiceId?: string,
): CharacterCommandResult {
  const normalized = normalizeKey(itemName)
  const matchingChoice = choiceId
    ? ledger.choices.find(
        (choice) =>
          choice.id === choiceId &&
          choice.domain === domain &&
          (adding
            ? choice.selected.length < choice.chooseCount
            : choice.selected.some((selected) => normalizeKey(selected) === normalized)),
      )
    : adding
      ? (() => {
          const candidates = ledger.choices.filter(
            (choice) =>
              choice.domain === domain &&
              choice.selected.length < choice.chooseCount &&
              (choice.optionPool.length === 0 ||
                choice.optionPool.some((entry) => normalizeKey(entry) === normalized)),
          )
          return candidates.find((choice) => choice.optionPool.length > 0) ?? candidates[0]
        })()
      : ledger.choices.find(
          (choice) =>
            choice.domain === domain &&
            choice.selected.some((selected) => normalizeKey(selected) === normalized),
        )
  if (!matchingChoice) return { characterPatch: {}, provenanceUpdate: ledger }

  if (adding) {
    let provenanceUpdate = resolveChoice(ledger, matchingChoice.id, [
      ...matchingChoice.selected,
      itemName,
    ])
    provenanceUpdate = addGrant(
      provenanceUpdate,
      domain,
      itemName,
      makeSourceTag(
        matchingChoice.sourceTag.sourceType,
        matchingChoice.sourceTag.sourceName,
        'choice',
        matchingChoice.sourceTag.sourceRef,
      ),
    )
    if (domain === 'skills') {
      const skills = [...new Set([...character.proficiencies.skills, normalized])]
      return {
        characterPatch: {
          proficiencies: { ...character.proficiencies, skills },
          skills: mergeSkillState(character.skills ?? {}, skills),
        },
        provenanceUpdate,
      }
    }
    return {
      characterPatch: {
        proficiencies: {
          ...character.proficiencies,
          [domain]: [...new Set([...character.proficiencies[domain], itemName])],
        },
      },
      provenanceUpdate,
    }
  }

  const selected = matchingChoice.selected.filter((entry) => normalizeKey(entry) !== normalized)
  const provenanceUpdate = removeChoiceGrant(
    resolveChoice(ledger, matchingChoice.id, selected),
    domain,
    itemName,
    matchingChoice.sourceTag.sourceName,
  )
  if (domain === 'skills') {
    const skills = character.proficiencies.skills.filter(
      (entry) => normalizeKey(entry) !== normalized,
    )
    return {
      characterPatch: {
        proficiencies: { ...character.proficiencies, skills },
        skills: mergeSkillState(character.skills ?? {}, skills),
      },
      provenanceUpdate,
    }
  }
  return {
    characterPatch: {
      proficiencies: {
        ...character.proficiencies,
        [domain]: character.proficiencies[domain].filter(
          (entry) => normalizeKey(entry) !== normalized,
        ),
      },
    },
    provenanceUpdate,
  }
}

export function retractFeatOptionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  selections: FeatOptionSelections,
): CharacterCommandResult {
  const provenanceUpdate = removeGrantsBySource(ledger, 'feat', getFeatOptionSourceName(feat))
  const removedSpells = new Set(
    (selections.spells ?? []).map((key) => normalizeKey(key.split('|')[0])),
  )
  const spellProfiles = character.spells.spellProfiles.map((profile) => {
    if (profile.id !== SPECIAL_SPELL_PROFILE_ID) return profile
    return {
      ...profile,
      cantrips: profile.cantrips.filter(
        (name) =>
          !removedSpells.has(normalizeKey(name)) || !!provenanceUpdate.spells[normalizeKey(name)],
      ),
      spellsKnown: profile.spellsKnown.filter(
        (name) =>
          !removedSpells.has(normalizeKey(name)) || !!provenanceUpdate.spells[normalizeKey(name)],
      ),
    }
  })
  let proficiencies = { ...character.proficiencies }
  const skills = { ...(character.skills ?? {}) }

  for (const skillName of selections.skills ?? []) {
    const normalized = normalizeKey(skillName)
    if (provenanceUpdate.proficiencies.skills[normalized]) continue
    proficiencies = {
      ...proficiencies,
      skills: proficiencies.skills.filter((name) => normalizeKey(name) !== normalized),
    }
    const existing = skills[normalized]
    skills[normalized] = { proficient: false, expertise: false, bonus: existing?.bonus ?? 0 }
  }
  for (const language of selections.languages ?? []) {
    if (provenanceUpdate.proficiencies.languages[normalizeKey(language)]) continue
    proficiencies = {
      ...proficiencies,
      languages: proficiencies.languages.filter((entry) => entry !== language),
    }
  }
  for (const tool of selections.tools ?? []) {
    if (provenanceUpdate.proficiencies.tools[normalizeKey(tool)]) continue
    proficiencies = {
      ...proficiencies,
      tools: proficiencies.tools.filter((entry) => entry !== tool),
    }
  }

  const abilityScores = { ...character.abilityScores }
  if (selections.abilityScore) {
    const ability = normalizeAbilityName(selections.abilityScore)
    if (ability) abilityScores[ability] = Math.max(1, (abilityScores[ability] ?? 10) - 1)
  }
  if (selections.expertiseSkill) {
    const normalized = normalizeKey(selections.expertiseSkill)
    const existing = skills[normalized]
    skills[normalized] = {
      proficient: existing?.proficient ?? false,
      expertise: false,
      bonus: existing?.bonus ?? 0,
    }
  }

  return {
    characterPatch: {
      spells: { ...character.spells, spellProfiles },
      proficiencies,
      skills,
      abilityScores,
    },
    provenanceUpdate,
  }
}

export function commitFeatOptionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  selections: FeatOptionSelections,
  allSpells?: Spell5e[],
): CharacterCommandResult {
  const sourceName = getFeatOptionSourceName(feat)
  const sourceTag = makeSourceTag('feat', sourceName, 'choice', feat.source)
  let provenanceUpdate = ledger
  const existingSpecial = character.spells.spellProfiles.find(
    (profile) => profile.id === SPECIAL_SPELL_PROFILE_ID,
  )
  const cantrips = [...(existingSpecial?.cantrips ?? [])]
  const spellsKnown = [...(existingSpecial?.spellsKnown ?? [])]
  for (const compositeKey of selections.spells ?? []) {
    const spellName = compositeKey.split('|')[0]
    provenanceUpdate = addSpellGrant(provenanceUpdate, spellName, sourceTag)
    const spell = allSpells?.find(
      (entry) => `${entry.name}|${entry.source ?? ''}` === compositeKey || entry.name === spellName,
    )
    const target = spell?.level === 0 ? cantrips : spellsKnown
    if (!target.includes(spellName)) target.push(spellName)
  }
  const spellProfiles = existingSpecial
    ? character.spells.spellProfiles.map((profile) =>
        profile.id === SPECIAL_SPELL_PROFILE_ID ? { ...profile, cantrips, spellsKnown } : profile,
      )
    : [
        ...character.spells.spellProfiles,
        {
          id: SPECIAL_SPELL_PROFILE_ID,
          type: 'special' as const,
          label: 'Special',
          cantrips,
          spellsKnown,
          preparedSpells: [],
          alwaysPrepared: true,
        },
      ]

  let proficiencies = { ...character.proficiencies }
  const skills = { ...(character.skills ?? {}) }
  for (const skillName of selections.skills ?? []) {
    const normalized = normalizeKey(skillName)
    provenanceUpdate = addGrant(provenanceUpdate, 'skills', skillName, sourceTag)
    proficiencies = {
      ...proficiencies,
      skills: [...new Set([...proficiencies.skills, normalized])],
    }
    skills[normalized] = {
      proficient: true,
      expertise: skills[normalized]?.expertise ?? false,
      bonus: skills[normalized]?.bonus ?? 0,
    }
  }
  for (const language of selections.languages ?? []) {
    provenanceUpdate = addGrant(provenanceUpdate, 'languages', language, sourceTag)
    proficiencies = {
      ...proficiencies,
      languages: [...new Set([...proficiencies.languages, language])],
    }
  }
  for (const tool of selections.tools ?? []) {
    provenanceUpdate = addGrant(provenanceUpdate, 'tools', tool, sourceTag)
    proficiencies = { ...proficiencies, tools: [...new Set([...proficiencies.tools, tool])] }
  }

  const abilityScores = { ...character.abilityScores }
  if (selections.abilityScore) {
    const ability = normalizeAbilityName(selections.abilityScore)
    if (ability) {
      provenanceUpdate = addAbilityBonus(provenanceUpdate, {
        ability,
        value: 1,
        sourceTag,
      })
      abilityScores[ability] = (abilityScores[ability] ?? 10) + 1
    }
  }
  if (selections.optionalFeature) {
    provenanceUpdate = addGrant(provenanceUpdate, 'features', selections.optionalFeature, sourceTag)
  }
  if (selections.expertiseSkill) {
    const normalized = normalizeKey(selections.expertiseSkill)
    skills[normalized] = {
      proficient: skills[normalized]?.proficient ?? true,
      expertise: true,
      bonus: skills[normalized]?.bonus ?? 0,
    }
  }
  provenanceUpdate = {
    ...provenanceUpdate,
    choices: provenanceUpdate.choices.filter(
      (choice) => !(choice.domain === 'featOptions' && choice.sourceTag.sourceName === sourceName),
    ),
  }

  const feats = character.feats.map((entry) =>
    entry.name === feat.name && entry.source === (feat.source ?? '')
      ? { ...entry, options: selections }
      : entry,
  )
  const specialFeats = character.specialFeats?.map((entry) =>
    entry.name === feat.name && entry.source === (feat.source ?? '')
      ? { ...entry, options: selections }
      : entry,
  )
  const fixedFeatOptions = feat.grantVariant
    ? {
        ...(character.fixedFeatOptions ?? {}),
        [getFixedFeatOptionKey(feat.name, feat.source ?? '', feat.grantVariant)]: selections,
      }
    : character.fixedFeatOptions

  return {
    characterPatch: {
      feats,
      specialFeats,
      fixedFeatOptions,
      spells: { ...character.spells, spellProfiles },
      proficiencies,
      skills,
      abilityScores,
    },
    provenanceUpdate,
  }
}

export function editFeatOptionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  oldOptions: FeatOptionSelections,
  newSelections: FeatOptionSelections,
  allSpells?: Spell5e[],
): CharacterCommandResult {
  const retracted = retractFeatOptionsCommand(character, ledger, feat, oldOptions)
  return commitFeatOptionsCommand(
    applyResult(character, retracted),
    retracted.provenanceUpdate,
    feat,
    newSelections,
    allSpells,
  )
}

export function replaceFeatSelectionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  selectedFeats: SelectedFeat[],
): CharacterCommandResult {
  const selectedNames = new Set(selectedFeats.map((feat) => feat.name))
  let workingCharacter = character
  let provenanceUpdate = ledger
  for (const feat of character.feats.filter(
    (entry) => !selectedNames.has(entry.name) && entry.options != null,
  )) {
    const result = retractFeatOptionsCommand(
      workingCharacter,
      provenanceUpdate,
      feat,
      feat.options as FeatOptionSelections,
    )
    workingCharacter = applyResult(workingCharacter, result)
    provenanceUpdate = result.provenanceUpdate
  }

  const previousNames = new Set(character.feats.map((feat) => feat.name))
  const feats = { ...provenanceUpdate.feats }
  for (const previousName of previousNames) {
    if (!selectedNames.has(previousName)) delete feats[normalizeKey(previousName)]
  }
  provenanceUpdate = { ...provenanceUpdate, feats }
  for (const feat of selectedFeats) {
    if (!previousNames.has(feat.name)) {
      provenanceUpdate = applyFeatGrant(provenanceUpdate, feat.name, feat.source, true)
    }
  }

  return {
    characterPatch: {
      spells: workingCharacter.spells,
      proficiencies: workingCharacter.proficiencies,
      skills: workingCharacter.skills,
      abilityScores: workingCharacter.abilityScores,
      feats: selectedFeats.map((feat) => {
        const existing = character.feats.find((entry) => entry.name === feat.name)
        return {
          id: existing?.id ?? `${feat.name}-${feat.source ?? ''}`,
          name: feat.name,
          source: feat.source ?? '',
          description: existing?.description ?? '',
          options: existing?.options,
          className: feat.className ?? existing?.className,
          classSource: feat.classSource ?? existing?.classSource,
          classLevel: feat.classLevel ?? existing?.classLevel,
        }
      }),
    },
    provenanceUpdate,
  }
}

export function replaceBonusFeatSelectionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  selectedFeats: Array<{ name: string; source?: string }>,
): CharacterCommandResult {
  const selectedKeys = new Set(selectedFeats.map((feat) => `${feat.name}|${feat.source ?? ''}`))
  let workingCharacter = character
  let provenanceUpdate = ledger
  for (const feat of (character.specialFeats ?? []).filter(
    (entry) => entry.options != null && !selectedKeys.has(`${entry.name}|${entry.source ?? ''}`),
  )) {
    const result = retractFeatOptionsCommand(
      workingCharacter,
      provenanceUpdate,
      feat,
      feat.options as FeatOptionSelections,
    )
    workingCharacter = applyResult(workingCharacter, result)
    provenanceUpdate = result.provenanceUpdate
  }

  return {
    characterPatch: {
      spells: workingCharacter.spells,
      proficiencies: workingCharacter.proficiencies,
      skills: workingCharacter.skills,
      abilityScores: workingCharacter.abilityScores,
      specialFeats: selectedFeats.map((feat) => {
        const existing = character.specialFeats?.find(
          (entry) => entry.name === feat.name && entry.source === (feat.source ?? ''),
        )
        return (
          existing ?? {
            id: `bonus-${feat.name}-${feat.source ?? ''}`,
            name: feat.name,
            source: feat.source ?? '',
            description: '',
          }
        )
      }),
    },
    provenanceUpdate,
  }
}
