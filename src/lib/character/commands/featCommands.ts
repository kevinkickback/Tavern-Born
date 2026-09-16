import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { mergeSkillState } from '@/lib/calculations/skills'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { type ClassFeatChoiceOwner, getClassFeatChoiceId } from '@/lib/character/classFeatChoices'
import { getFixedFeatOptionKey } from '@/lib/featGrants'
import {
  addAbilityBonus,
  addGrant,
  addSpellGrant,
  applyFeatGrant,
  makeSourceTag,
  removeGrantsBySourceRef,
  resolveChoice,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ChoiceDomain, ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Spell5e } from '@/types/5etools'
import type { Character, Feat, FeatOptionSelections } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import {
  type FeatOptionTarget,
  getFeatOptionOwnerKey,
  getFeatOptionSourceName,
  getFeatOptionSourceTag,
  getFeatSelectionKey,
  isSameGrantSource,
  type SelectedFeat,
} from './featCommandIdentity'
import {
  applyCharacterCommandResult as applyResult,
  getFeatChoiceSelectedRefs,
  removeChoiceGrant,
} from './featCommandSupport'
import { assignProgressionSlotLevels } from './progressionSlotOwnership'

export type { FeatOptionTarget, SelectedFeat } from './featCommandIdentity'

export function retractFeatChoiceOptionsForSources(
  character: Character,
  ledger: ProvenanceLedger,
  sources: Array<{ sourceType: SourceTag['sourceType']; sourceName?: string }>,
): CharacterCommandResult {
  let workingCharacter = character
  let provenanceUpdate = ledger
  for (const choice of ledger.choices) {
    const matches =
      choice.domain === 'feats' &&
      sources.some(
        (source) =>
          source.sourceName != null &&
          choice.sourceTag.sourceType === source.sourceType &&
          choice.sourceTag.sourceName === source.sourceName,
      )
    if (!matches) continue
    const selectedRefs = getFeatChoiceSelectedRefs(choice)
    for (const selection of selectedRefs) {
      if (!selection.options) continue
      const result = retractFeatOptionsCommand(
        workingCharacter,
        provenanceUpdate,
        {
          name: selection.name,
          source: selection.source,
          provenanceChoiceId: choice.id,
        },
        selection.options,
      )
      workingCharacter = applyResult(workingCharacter, result)
      provenanceUpdate = result.provenanceUpdate
    }
  }
  return {
    characterPatch: {
      spells: workingCharacter.spells,
      proficiencies: workingCharacter.proficiencies,
      skills: workingCharacter.skills,
      abilityScores: workingCharacter.abilityScores,
    },
    provenanceUpdate,
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

export function resolveFeatChoiceCommand(
  character: Character,
  ledger: ProvenanceLedger,
  choiceId: string,
  feat: { name: string; source?: string },
): CharacterCommandResult {
  const choice = ledger.choices.find((entry) => entry.id === choiceId && entry.domain === 'feats')
  if (!choice) return { characterPatch: {}, provenanceUpdate: ledger }

  let workingCharacter = character
  let provenanceUpdate = ledger
  const previousRefs = getFeatChoiceSelectedRefs(choice)
  if (choice.selected.length > 0) {
    for (const previous of previousRefs) {
      if (previous.options) {
        const retracted = retractFeatOptionsCommand(
          workingCharacter,
          provenanceUpdate,
          {
            name: previous.name,
            source: previous.source,
            provenanceChoiceId: choiceId,
          },
          previous.options,
        )
        workingCharacter = applyResult(workingCharacter, retracted)
        provenanceUpdate = retracted.provenanceUpdate
      }
      const normalized = normalizeKey(previous.name)
      const retained = (provenanceUpdate.feats[normalized] ?? []).filter(
        (tag) => !(tag.grantType === 'choice' && isSameGrantSource(tag, choice.sourceTag)),
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

  const nextRefs = choice.selected.length > 0 ? [feat] : [...previousRefs, feat]
  provenanceUpdate = {
    ...provenanceUpdate,
    choices: provenanceUpdate.choices.map((entry) =>
      entry.id === choiceId ? { ...entry, selectedRefs: nextRefs } : entry,
    ),
  }

  const tag = makeSourceTag(
    choice.sourceTag.sourceType,
    choice.sourceTag.sourceName,
    'choice',
    choice.sourceTag.sourceRef,
  )
  return {
    characterPatch: {
      spells: workingCharacter.spells,
      proficiencies: workingCharacter.proficiencies,
      skills: workingCharacter.skills,
      abilityScores: workingCharacter.abilityScores,
    },
    provenanceUpdate: addGrant(provenanceUpdate, 'feats', feat.name, tag),
  }
}

export function removeFeatChoiceCommand(
  character: Character,
  ledger: ProvenanceLedger,
  choiceId: string,
  featName: string,
  featSource?: string,
): CharacterCommandResult {
  const choice = ledger.choices.find((entry) => entry.id === choiceId && entry.domain === 'feats')
  if (!choice) return { characterPatch: {}, provenanceUpdate: ledger }
  const refs = getFeatChoiceSelectedRefs(choice)
  const removed = refs.find(
    (entry) =>
      normalizeKey(entry.name) === normalizeKey(featName) &&
      (featSource == null || (entry.source ?? '') === featSource),
  )
  let workingCharacter = character
  let provenanceUpdate = ledger
  if (removed?.options) {
    const retracted = retractFeatOptionsCommand(
      workingCharacter,
      provenanceUpdate,
      { name: removed.name, source: removed.source, provenanceChoiceId: choiceId },
      removed.options,
    )
    workingCharacter = applyResult(workingCharacter, retracted)
    provenanceUpdate = retracted.provenanceUpdate
  }
  const remainingRefs = refs.filter(
    (entry) =>
      !(
        normalizeKey(entry.name) === normalizeKey(featName) &&
        (featSource == null || (entry.source ?? '') === featSource)
      ),
  )
  const selected = remainingRefs.map((entry) => entry.name)
  provenanceUpdate = resolveChoice(provenanceUpdate, choiceId, selected)
  provenanceUpdate = {
    ...provenanceUpdate,
    choices: provenanceUpdate.choices.map((entry) =>
      entry.id === choiceId ? { ...entry, selectedRefs: remainingRefs } : entry,
    ),
  }
  const normalized = normalizeKey(featName)
  const retained = (provenanceUpdate.feats[normalized] ?? []).filter(
    (tag) => !(tag.grantType === 'choice' && isSameGrantSource(tag, choice.sourceTag)),
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
  return {
    characterPatch: {
      spells: workingCharacter.spells,
      proficiencies: workingCharacter.proficiencies,
      skills: workingCharacter.skills,
      abilityScores: workingCharacter.abilityScores,
    },
    provenanceUpdate,
  }
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
    matchingChoice.sourceTag,
  )
  const hasRemainingGrant = Boolean(provenanceUpdate.proficiencies[domain][normalized]?.length)
  if (domain === 'skills') {
    const skills = hasRemainingGrant
      ? character.proficiencies.skills
      : character.proficiencies.skills.filter((entry) => normalizeKey(entry) !== normalized)
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
        [domain]: hasRemainingGrant
          ? character.proficiencies[domain]
          : character.proficiencies[domain].filter((entry) => normalizeKey(entry) !== normalized),
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
  const provenanceUpdate = removeGrantsBySourceRef(
    ledger,
    'feat',
    getFeatOptionSourceName(feat),
    feat.source,
    getFeatOptionOwnerKey(feat),
  )
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
      fixedSpells: profile.fixedSpells?.filter(
        (name) =>
          !removedSpells.has(normalizeKey(name)) ||
          (provenanceUpdate.spells[normalizeKey(name)] ?? []).some(
            (tag) => tag.sourceType !== 'manual',
          ),
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
  const sourceTag = getFeatOptionSourceTag(feat)
  let provenanceUpdate = ledger
  const existingSpecial = character.spells.spellProfiles.find(
    (profile) => profile.id === SPECIAL_SPELL_PROFILE_ID,
  )
  const cantrips = [...(existingSpecial?.cantrips ?? [])]
  const spellsKnown = [...(existingSpecial?.spellsKnown ?? [])]
  const fixedSpells = [...(existingSpecial?.fixedSpells ?? [])]
  for (const compositeKey of selections.spells ?? []) {
    const spellName = compositeKey.split('|')[0]
    provenanceUpdate = addSpellGrant(provenanceUpdate, spellName, sourceTag)
    const spell = allSpells?.find(
      (entry) => `${entry.name}|${entry.source ?? ''}` === compositeKey || entry.name === spellName,
    )
    const target = spell?.level === 0 ? cantrips : spellsKnown
    if (!target.includes(spellName)) target.push(spellName)
    if (!fixedSpells.some((name) => normalizeKey(name) === normalizeKey(spellName))) {
      fixedSpells.push(spellName)
    }
  }
  const spellProfiles = existingSpecial
    ? character.spells.spellProfiles.map((profile) =>
        profile.id === SPECIAL_SPELL_PROFILE_ID
          ? { ...profile, cantrips, spellsKnown, fixedSpells }
          : profile,
      )
    : [
        ...character.spells.spellProfiles,
        {
          id: SPECIAL_SPELL_PROFILE_ID,
          type: 'special' as const,
          label: 'Special',
          cantrips,
          spellsKnown,
          fixedSpells,
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
    choices: provenanceUpdate.choices
      .filter(
        (choice) =>
          !(
            choice.domain === 'featOptions' &&
            choice.sourceTag.sourceType === 'feat' &&
            choice.sourceTag.sourceName === sourceName &&
            (choice.sourceTag.sourceRef ?? '') === (feat.source ?? '')
          ),
      )
      .map((choice) => {
        if (choice.id !== feat.provenanceChoiceId) return choice
        const selectedRefs = getFeatChoiceSelectedRefs(choice).map((selected) =>
          normalizeKey(selected.name) === normalizeKey(feat.name) &&
          (selected.source ?? '') === (feat.source ?? '')
            ? { ...selected, source: feat.source, options: selections }
            : selected,
        )
        return { ...choice, selectedRefs }
      }),
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
  const classFeatChoices = character.classFeatChoices?.map((choice) =>
    choice.id === feat.classFeatChoiceId
      ? {
          ...choice,
          feats: choice.feats.map((entry) =>
            entry.name === feat.name && entry.source === (feat.source ?? '')
              ? { ...entry, options: selections }
              : entry,
          ),
        }
      : choice,
  )
  const fixedFeatOptions =
    feat.fixedGrant || feat.grantVariant !== undefined
      ? {
          ...(character.fixedFeatOptions ?? {}),
          [getFixedFeatOptionKey(feat.name, feat.source ?? '', feat.grantVariant)]: selections,
        }
      : character.fixedFeatOptions

  return {
    characterPatch: {
      feats,
      specialFeats,
      classFeatChoices,
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
  const selectedKeys = new Set(selectedFeats.map(getFeatSelectionKey))
  let workingCharacter = character
  let provenanceUpdate = ledger
  for (const feat of character.feats.filter(
    (entry) => !selectedKeys.has(getFeatSelectionKey(entry)) && entry.options != null,
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

  const feats = { ...provenanceUpdate.feats }
  for (const previousFeat of character.feats) {
    if (selectedKeys.has(getFeatSelectionKey(previousFeat))) continue
    const normalizedName = normalizeKey(previousFeat.name)
    const retainedTags = (feats[normalizedName] ?? []).filter(
      (tag) =>
        !(
          tag.sourceType === 'manual' &&
          tag.sourceName === 'User Choice' &&
          tag.grantType === 'choice' &&
          (tag.sourceRef ?? '') === (previousFeat.source ?? '')
        ),
    )
    if (retainedTags.length > 0) feats[normalizedName] = retainedTags
    else delete feats[normalizedName]
  }
  provenanceUpdate = { ...provenanceUpdate, feats }
  for (const feat of selectedFeats) {
    if (
      !character.feats.some((entry) => getFeatSelectionKey(entry) === getFeatSelectionKey(feat))
    ) {
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
        const existing = character.feats.find(
          (entry) => getFeatSelectionKey(entry) === getFeatSelectionKey(feat),
        )
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

export function replaceClassFeatSelectionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  owner: ClassFeatChoiceOwner & { slotLevels: number[] },
  selectedFeats: Array<{ name: string; source?: string }>,
): CharacterCommandResult {
  const choiceId = getClassFeatChoiceId(owner)
  const existingChoice = character.classFeatChoices?.find((choice) => choice.id === choiceId)
  const selectedKeys = new Set(selectedFeats.map(getFeatSelectionKey))
  let workingCharacter = character
  let provenanceUpdate = ledger

  for (const feat of (existingChoice?.feats ?? []).filter(
    (entry) => entry.options != null && !selectedKeys.has(getFeatSelectionKey(entry)),
  )) {
    const result = retractFeatOptionsCommand(
      workingCharacter,
      provenanceUpdate,
      { name: feat.name, source: feat.source, classFeatChoiceId: choiceId },
      feat.options as FeatOptionSelections,
    )
    workingCharacter = applyResult(workingCharacter, result)
    provenanceUpdate = result.provenanceUpdate
  }

  const ownerTag: SourceTag = {
    ...makeSourceTag('class', owner.className, 'choice', owner.classSource),
    grantVariant: choiceId,
  }
  for (const previous of existingChoice?.feats ?? []) {
    const key = normalizeKey(previous.name)
    const retained = (provenanceUpdate.feats[key] ?? []).filter(
      (tag) =>
        !(
          tag.sourceType === ownerTag.sourceType &&
          tag.sourceName === ownerTag.sourceName &&
          tag.sourceRef === ownerTag.sourceRef &&
          tag.grantVariant === ownerTag.grantVariant
        ),
    )
    const feats = { ...provenanceUpdate.feats }
    if (retained.length > 0) feats[key] = retained
    else delete feats[key]
    provenanceUpdate = { ...provenanceUpdate, feats }
  }

  const assignedSlotLevels = assignProgressionSlotLevels(
    (existingChoice?.feats ?? []).map((feat) => ({
      key: getFeatSelectionKey(feat),
      slotLevel: feat.classLevel ?? 1,
    })),
    selectedFeats.map(getFeatSelectionKey),
    owner.slotLevels,
    owner.slotLevels[owner.slotLevels.length - 1] ?? 1,
  )

  const feats: Feat[] = selectedFeats.map((feat, index) => {
    const existing = existingChoice?.feats.find(
      (entry) => getFeatSelectionKey(entry) === getFeatSelectionKey(feat),
    )
    provenanceUpdate = addGrant(provenanceUpdate, 'feats', feat.name, ownerTag)
    return {
      id: existing?.id ?? `class-${choiceId}-${feat.name}-${feat.source ?? ''}`,
      name: feat.name,
      source: feat.source ?? '',
      description: existing?.description ?? '',
      options: existing?.options,
      className: owner.className,
      classSource: owner.classSource,
      classLevel: assignedSlotLevels[index],
    }
  })

  const retainedChoices = (character.classFeatChoices ?? []).filter(
    (choice) => choice.id !== choiceId,
  )
  return {
    characterPatch: {
      spells: workingCharacter.spells,
      proficiencies: workingCharacter.proficiencies,
      skills: workingCharacter.skills,
      abilityScores: workingCharacter.abilityScores,
      classFeatChoices:
        feats.length > 0
          ? [
              ...retainedChoices,
              {
                id: choiceId,
                className: owner.className,
                classSource: owner.classSource,
                progressionName: owner.progressionName,
                categories: owner.categories,
                feats,
              },
            ]
          : retainedChoices,
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
