import { buildSpellLookup } from '@/lib/5etools/lookups'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { reconcileSkillExpertise } from '@/lib/calculations/skills'
import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { isSpecialSpellGrant } from '@/lib/calculations/spellOwnership'
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
import { normalizeKey, normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { ChoiceDomain, ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Spell5e } from '@/types/5etools'
import type { Character, Feat, FeatOptionSelections } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import { reconcileExpertiseOwnership } from './expertiseCommands'
import {
  type FeatOptionTarget,
  getFeatOptionOwnerKey,
  getFeatOptionSourceName,
  getFeatOptionSourceTag,
  getFeatSelectionKey,
  hasSharedFeatOptionOwner,
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

/** A supplied sourceRef, including an empty string, limits retraction to that exact printing. */
export function retractFeatChoiceOptionsForSources(
  character: Character,
  ledger: ProvenanceLedger,
  sources: Array<{ sourceType: SourceTag['sourceType']; sourceName?: string; sourceRef?: string }>,
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
          (source.sourceRef === undefined
            ? choice.sourceTag.sourceName === source.sourceName
            : normalizeOwnerIdentity(choice.sourceTag.sourceName) ===
                normalizeOwnerIdentity(source.sourceName) &&
              normalizeOwnerIdentity(choice.sourceTag.sourceRef) ===
                normalizeOwnerIdentity(source.sourceRef)),
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

  const tag: SourceTag = {
    ...makeSourceTag(
      choice.sourceTag.sourceType,
      choice.sourceTag.sourceName,
      'choice',
      choice.sourceTag.sourceRef,
    ),
    grantVariant: choice.sourceTag.grantVariant,
  }
  return {
    characterPatch: {
      spells: workingCharacter.spells,
      proficiencies: workingCharacter.proficiencies,
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
    return reconcileExpertiseOwnership({
      characterPatch: {
        proficiencies: reconcileSkillExpertise({ ...character.proficiencies, skills }),
      },
      provenanceUpdate,
    })
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
  const ownerKey = getFeatOptionOwnerKey(feat)
  const isFixedOwner = ownerKey?.startsWith('fixed:') === true
  const provenanceUpdate = removeGrantsBySourceRef(
    ledger,
    'feat',
    getFeatOptionSourceName(feat),
    feat.source,
    ownerKey,
    {
      exactVariant: true,
      normalizeIdentity: isFixedOwner,
      normalizeFixedVariant: isFixedOwner,
    },
  )
  const removedSpells = new Set(
    Object.entries(ledger.spells).flatMap(([name, tags]) =>
      tags
        .filter((tag) => !provenanceUpdate.spells[name]?.includes(tag))
        .map((tag) => getSpellReferenceKey(name, tag.grantSource)),
    ),
  )
  const remainingSpecialGrants = (reference: string) =>
    (provenanceUpdate.spells[getSpellNameKey(reference)] ?? []).filter(
      (tag) =>
        isSpecialSpellGrant(tag) &&
        getSpellReferenceKey(reference, tag.grantSource ?? '') === getSpellReferenceKey(reference),
    )
  const retainSelection = (reference: string) =>
    !removedSpells.has(getSpellReferenceKey(reference)) ||
    remainingSpecialGrants(reference).length > 0
  const spellProfiles = character.spells.spellProfiles.map((profile) => {
    if (profile.id !== SPECIAL_SPELL_PROFILE_ID) return profile
    return {
      ...profile,
      cantrips: profile.cantrips.filter(retainSelection),
      spellsKnown: profile.spellsKnown.filter(retainSelection),
      preparedSpells: profile.preparedSpells.filter(retainSelection),
      fixedSpells: profile.fixedSpells?.filter(
        (name) =>
          !removedSpells.has(getSpellReferenceKey(name)) ||
          remainingSpecialGrants(name).some((tag) => tag.sourceType !== 'manual'),
      ),
    }
  })
  let proficiencies = { ...character.proficiencies }

  for (const skillName of selections.skills ?? []) {
    const normalized = normalizeKey(skillName)
    if (provenanceUpdate.proficiencies.skills[normalized]) continue
    proficiencies = {
      ...proficiencies,
      skills: proficiencies.skills.filter((name) => normalizeKey(name) !== normalized),
    }
    proficiencies.expertise = proficiencies.expertise.filter(
      (name) => normalizeKey(name) !== normalized,
    )
  }
  for (const language of selections.languages ?? []) {
    if (provenanceUpdate.proficiencies.languages[normalizeKey(language)]) continue
    proficiencies = {
      ...proficiencies,
      languages: proficiencies.languages.filter(
        (entry) => normalizeKey(entry) !== normalizeKey(language),
      ),
    }
  }
  for (const tool of selections.tools ?? []) {
    if (provenanceUpdate.proficiencies.tools[normalizeKey(tool)]) continue
    proficiencies = {
      ...proficiencies,
      tools: proficiencies.tools.filter((entry) => normalizeKey(entry) !== normalizeKey(tool)),
    }
  }

  if (selections.expertiseSkill) {
    const normalized = normalizeKey(selections.expertiseSkill)
    if (
      ledger.proficiencies.expertise?.[normalized]?.length &&
      !provenanceUpdate.proficiencies.expertise?.[normalized]?.length
    ) {
      proficiencies.expertise = proficiencies.expertise.filter(
        (name) => normalizeKey(name) !== normalized,
      )
    }
    if (
      ledger.proficiencies.skills[normalized]?.length &&
      !provenanceUpdate.proficiencies.skills[normalized]?.length
    ) {
      proficiencies.skills = proficiencies.skills.filter(
        (name) => normalizeKey(name) !== normalized,
      )
    }
  }

  return reconcileExpertiseOwnership({
    characterPatch: {
      spells: { ...character.spells, spellProfiles },
      proficiencies: reconcileSkillExpertise(proficiencies),
    },
    provenanceUpdate,
  })
}

export function commitFeatOptionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  selections: FeatOptionSelections,
  allSpells?: Spell5e[],
): CharacterCommandResult {
  const resolved = resolveFeatOptionSpells(character, ledger, feat, selections, allSpells)
  if (!resolved) return { characterPatch: {}, provenanceUpdate: ledger }
  return commitResolvedFeatOptions(character, ledger, feat, selections, resolved)
}

type FeatSpellSelection = { reference: string; kind: 'cantrips' | 'spellsKnown' }

/** Resolve before retraction so an established offline choice retains its saved kind. */
function resolveFeatOptionSpells(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  selections: FeatOptionSelections,
  allSpells: Spell5e[] = [],
): FeatSpellSelection[] | undefined {
  const lookup = buildSpellLookup(allSpells)
  const profile = character.spells.spellProfiles.find(
    (entry) => entry.id === SPECIAL_SPELL_PROFILE_ID,
  )
  const owner = getFeatOptionSourceTag(feat)
  const normalize = getFeatOptionOwnerKey(feat)?.startsWith('fixed:') === true
  const sameOwner = (tag: SourceTag) =>
    normalize
      ? tag.sourceType === owner.sourceType &&
        tag.grantType === owner.grantType &&
        normalizeOwnerIdentity(tag.sourceName) === normalizeOwnerIdentity(owner.sourceName) &&
        normalizeOwnerIdentity(tag.sourceRef) === normalizeOwnerIdentity(owner.sourceRef) &&
        normalizeOwnerIdentity(tag.grantVariant) === normalizeOwnerIdentity(owner.grantVariant)
      : isSameGrantSource(tag, owner)
  const resolved: FeatSpellSelection[] = []
  for (const selected of selections.spells ?? []) {
    const parsed = parseSpellReference(selected)
    if (!parsed.name || !parsed.source) return undefined
    const reference = formatSpellReference(selected)
    const key = getSpellReferenceKey(reference)
    const spell = resolveSpellReference(reference, lookup)
    let kind: FeatSpellSelection['kind'] | undefined = spell
      ? spell.level === 0
        ? 'cantrips'
        : 'spellsKnown'
      : undefined
    if (
      !kind &&
      (ledger.spells[getSpellNameKey(reference)] ?? []).some(
        (tag) => sameOwner(tag) && getSpellReferenceKey(reference, tag.grantSource ?? '') === key,
      )
    ) {
      const cantrip = profile?.cantrips.some((value) => getSpellReferenceKey(value) === key)
      const known = profile?.spellsKnown.some((value) => getSpellReferenceKey(value) === key)
      if (cantrip !== known) kind = cantrip ? 'cantrips' : 'spellsKnown'
    }
    if (!kind) return undefined
    resolved.push({ reference, kind })
  }
  return resolved
}

function commitResolvedFeatOptions(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  selections: FeatOptionSelections,
  resolvedSpells: FeatSpellSelection[],
): CharacterCommandResult {
  const sourceTag = getFeatOptionSourceTag(feat)
  let provenanceUpdate = ledger
  const existingSpecial = character.spells.spellProfiles.find(
    (profile) => profile.id === SPECIAL_SPELL_PROFILE_ID,
  )
  const cantrips = [...(existingSpecial?.cantrips ?? [])]
  const spellsKnown = [...(existingSpecial?.spellsKnown ?? [])]
  const fixedSpells = [...(existingSpecial?.fixedSpells ?? [])]
  for (const { reference, kind } of resolvedSpells) {
    provenanceUpdate = addSpellGrant(provenanceUpdate, reference, sourceTag)
    const target = kind === 'cantrips' ? cantrips : spellsKnown
    const key = getSpellReferenceKey(reference)
    if (!target.some((name) => getSpellReferenceKey(name) === key)) target.push(reference)
    if (!fixedSpells.some((name) => getSpellReferenceKey(name) === key)) {
      fixedSpells.push(reference)
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
  const retainUntrackedProficiency = (domain: 'skills' | 'languages' | 'tools', name: string) => {
    const key = normalizeKey(name)
    if (
      proficiencies[domain].some((entry) => normalizeKey(entry) === key) &&
      !provenanceUpdate.proficiencies[domain][key]?.length
    ) {
      provenanceUpdate = addGrant(
        provenanceUpdate,
        domain,
        name,
        makeSourceTag('manual', 'User Choice', 'choice'),
      )
    }
  }
  for (const skillName of selections.skills ?? []) {
    const normalized = normalizeKey(skillName)
    retainUntrackedProficiency('skills', skillName)
    provenanceUpdate = addGrant(provenanceUpdate, 'skills', skillName, sourceTag)
    proficiencies = {
      ...proficiencies,
      skills: [...new Set([...proficiencies.skills, normalized])],
    }
  }
  for (const language of selections.languages ?? []) {
    retainUntrackedProficiency('languages', language)
    provenanceUpdate = addGrant(provenanceUpdate, 'languages', language, sourceTag)
    proficiencies = {
      ...proficiencies,
      languages: [...new Set([...proficiencies.languages, language])],
    }
  }
  for (const tool of selections.tools ?? []) {
    retainUntrackedProficiency('tools', tool)
    provenanceUpdate = addGrant(provenanceUpdate, 'tools', tool, sourceTag)
    proficiencies = { ...proficiencies, tools: [...new Set([...proficiencies.tools, tool])] }
  }

  if (selections.abilityScore) {
    const ability = normalizeAbilityName(selections.abilityScore)
    if (ability) {
      provenanceUpdate = addAbilityBonus(provenanceUpdate, {
        ability,
        value: 1,
        sourceTag,
      })
    }
  }
  if (selections.optionalFeature) {
    provenanceUpdate = addGrant(provenanceUpdate, 'features', selections.optionalFeature, sourceTag)
  }
  if (selections.expertiseSkill) {
    const normalized = normalizeKey(selections.expertiseSkill)
    // Legacy/manual selections without ownership must survive a newly configured feat.
    for (const domain of ['skills', 'expertise'] as const) {
      if (
        proficiencies[domain].some((name) => normalizeKey(name) === normalized) &&
        !provenanceUpdate.proficiencies[domain]?.[normalized]?.length
      ) {
        provenanceUpdate = addGrant(
          provenanceUpdate,
          domain,
          normalized,
          makeSourceTag('manual', 'User Choice', 'choice'),
        )
      }
      provenanceUpdate = addGrant(provenanceUpdate, domain, normalized, sourceTag)
    }
    proficiencies = {
      ...proficiencies,
      skills: [...new Set([...proficiencies.skills, normalized])],
      expertise: [...new Set([...proficiencies.expertise, normalized])],
    }
  }
  provenanceUpdate = {
    ...provenanceUpdate,
    choices: provenanceUpdate.choices
      .filter(
        (choice) =>
          !(choice.domain === 'featOptions' && isSameGrantSource(choice.sourceTag, sourceTag)),
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

  const optionOwnerKey = getFeatOptionOwnerKey(feat)
  const feats =
    optionOwnerKey === undefined
      ? character.feats.map((entry) =>
          entry.name === feat.name && entry.source === (feat.source ?? '')
            ? { ...entry, options: selections }
            : entry,
        )
      : character.feats
  const specialFeats =
    optionOwnerKey === undefined
      ? character.specialFeats?.map((entry) =>
          entry.name === feat.name && entry.source === (feat.source ?? '')
            ? { ...entry, options: selections }
            : entry,
        )
      : character.specialFeats
  const classFeatChoices = character.classFeatChoices?.map((choice) =>
    optionOwnerKey === `class:${choice.id}`
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
    optionOwnerKey?.startsWith('fixed:') === true
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
  const resolved = resolveFeatOptionSpells(character, ledger, feat, newSelections, allSpells)
  if (!resolved) return { characterPatch: {}, provenanceUpdate: ledger }
  const retracted = retractFeatOptionsCommand(character, ledger, feat, oldOptions)
  return commitResolvedFeatOptions(
    applyResult(character, retracted),
    retracted.provenanceUpdate,
    feat,
    newSelections,
    resolved,
  )
}

/** Clear only an identifiable setup; shared selected/bonus ownership needs an explicit resolution. */
export function clearFeatOptionsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  feat: FeatOptionTarget,
  oldOptions: FeatOptionSelections,
): CharacterCommandResult {
  if (hasSharedFeatOptionOwner(character, feat)) {
    return { characterPatch: {}, provenanceUpdate: ledger }
  }
  return editFeatOptionsCommand(character, ledger, feat, oldOptions, {})
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
      classFeatChoices:
        feats.length > 0
          ? [
              ...retainedChoices,
              {
                id: choiceId,
                className: owner.className,
                classSource: owner.classSource,
                ...(owner.subclassName ? { subclassName: owner.subclassName } : {}),
                ...(owner.subclassSource ? { subclassSource: owner.subclassSource } : {}),
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
