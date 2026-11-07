import { extractProficiencyBlockNames } from '@/lib/5etools/proficiencyBlockNames'
import {
  assertStartingEquipmentSelections,
  getBackgroundEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import {
  createStartingEquipmentPolicy,
  type StartingEquipmentPolicy,
} from '@/lib/5etools/startingEquipmentPolicy'
import { getBackgroundAbilityData, normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  ensureOriginSystemInvariants,
  normalizeBackgroundForOriginSystem,
} from '@/lib/calculations/originSystem'
import { reconcileSkillExpertise } from '@/lib/calculations/skills'
import { retractFeatChoiceOptionsForSources } from '@/lib/character/commands/featCommands'
import { reconcileFixedFeatOptionsCommand } from '@/lib/character/commands/fixedFeatCommands'
import {
  reconcileStartingEquipmentGrant,
  sameStartingReference,
} from '@/lib/character/startingEquipmentGrants'
import {
  addAbilityBonus,
  addGrant,
  applyBackgroundGrants,
  diffProficiencyGrants,
  iterateProficiencyBlocks,
  makeSourceTag,
  reconcileBackgroundChange,
  toProficiencyBlocks,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Background5e, Item5e } from '@/types/5etools'
import type { Character, StartingEquipmentItemChoices } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export function applyBackgroundSelectionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  background: Background5e,
  blockChoices: string[],
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<StartingEquipmentItemChoices> = character.backgroundEquipmentItemChoices ??
    {},
  policyOverride?: StartingEquipmentPolicy,
  validateSelections = true,
): CharacterCommandResult {
  const normalizedBackground = normalizeBackgroundForOriginSystem(
    background,
    character.originSystem,
  )
  if (!normalizedBackground) return { characterPatch: {}, provenanceUpdate: ledger }

  const oldBackgroundName = character.background || undefined
  const isBackgroundChanged =
    oldBackgroundName !== background.name ||
    (character.backgroundSource ?? '') !== (background.source ?? '')
  const retracted = isBackgroundChanged
    ? retractFeatChoiceOptionsForSources(character, ledger, [
        { sourceType: 'background', sourceName: oldBackgroundName },
      ])
    : { characterPatch: {}, provenanceUpdate: ledger }
  const workingCharacter = { ...character, ...retracted.characterPatch }
  let provenanceUpdate = isBackgroundChanged
    ? reconcileBackgroundChange(retracted.provenanceUpdate, oldBackgroundName)
    : retracted.provenanceUpdate
  provenanceUpdate = applyBackgroundGrants(normalizedBackground, provenanceUpdate, {
    suppressLanguageGrants: character.originSystem === '2024',
  })
  provenanceUpdate = ensureOriginLanguageBaseline(provenanceUpdate, character.originSystem)
  ensureOriginSystemInvariants(provenanceUpdate, character.originSystem)

  let proficiencies = { ...workingCharacter.proficiencies }
  if (oldBackgroundName && isBackgroundChanged) {
    for (const domain of ['skills', 'languages', 'tools'] as const) {
      const { toRemove } = diffProficiencyGrants(
        retracted.provenanceUpdate,
        domain,
        'background',
        oldBackgroundName,
      )
      if (toRemove.length === 0) continue
      proficiencies = {
        ...proficiencies,
        [domain]: proficiencies[domain].filter((name) => !toRemove.includes(normalizeKey(name))),
      }
    }
  }

  const skills = extractProficiencyBlockNames(normalizedBackground.skillProficiencies ?? [], {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const languages = extractProficiencyBlockNames(normalizedBackground.languageProficiencies ?? [], {
    includeAnyStandard: false,
  })
  const tools = [
    ...iterateProficiencyBlocks(
      toProficiencyBlocks(normalizedBackground.toolProficiencies),
      'tools',
    ),
  ].flatMap((entry) => (entry.kind === 'fixed' || entry.kind === 'numeric' ? [entry.key] : []))
  proficiencies = {
    ...proficiencies,
    skills: [...new Set([...proficiencies.skills, ...skills])],
    languages: [
      ...new Set([
        ...proficiencies.languages,
        ...(character.originSystem === '2024' ? [] : languages),
      ]),
    ],
    tools: [...new Set([...proficiencies.tools, ...tools])],
  }

  const blocks = getBackgroundEquipmentBlocks(background.startingEquipment)
  const policy =
    policyOverride ??
    createStartingEquipmentPolicy(
      { ...workingCharacter, proficiencies, provenance: provenanceUpdate },
      { ...background, source: background.source ?? '', kind: 'background' },
      background.startingEquipment,
      [...itemLookup.values()],
    )
  if (
    !policy.ownerAvailable ||
    !sameStartingReference(policy.owner, background) ||
    JSON.stringify(policy.startingEquipment) !== JSON.stringify(background.startingEquipment)
  )
    throw new RangeError('Restore the current Background rules first.')
  const resolvedPackage = resolveEquipmentWithBlockChoices(
    blocks,
    itemLookup,
    blockChoices,
    genericSelections,
    policy,
  )
  if (validateSelections) {
    assertStartingEquipmentSelections(
      resolvedPackage,
      genericSelections,
      isBackgroundChanged ? {} : character.backgroundEquipmentItemChoices,
    )
    const activeKeys = new Set(resolvedPackage.genericChoices?.map((slot) => slot.key))
    for (const [key, refs] of Object.entries(genericSelections))
      if (
        !activeKeys.has(key) &&
        JSON.stringify(refs) !== JSON.stringify(character.backgroundEquipmentItemChoices?.[key])
      )
        throw new RangeError('This starting item slot is no longer active.')
  }
  const equipmentTags = Object.fromEntries(
    Object.entries(provenanceUpdate.equipment).flatMap(([name, tags]) => {
      const retained = tags.filter(
        (tag) =>
          !(
            tag.sourceType === 'background' &&
            sameStartingReference({ name: tag.sourceName, source: tag.sourceRef ?? '' }, background)
          ),
      )
      return retained.length ? [[name, retained]] : []
    }),
  )
  provenanceUpdate = { ...provenanceUpdate, equipment: equipmentTags }
  const equipmentPatch = reconcileStartingEquipmentGrant(
    character,
    'background',
    { name: background.name, source: background.source },
    resolvedPackage.lots ?? [],
    resolvedPackage.currency,
  )
  for (const lot of equipmentPatch.startingEquipmentGrants?.background?.items ?? [])
    provenanceUpdate = addGrant(
      provenanceUpdate,
      'equipment',
      lot.reference.name,
      makeSourceTag('background', background.name, 'fixed', background.source),
    )

  return reconcileFixedFeatOptionsCommand(character, ledger, {
    characterPatch: {
      background: background.name,
      backgroundSource: background.source || undefined,
      spells: workingCharacter.spells,
      abilityScores: workingCharacter.abilityScores,
      proficiencies: reconcileSkillExpertise(proficiencies),
      ...equipmentPatch,
      backgroundEquipmentChoices: blockChoices,
      backgroundEquipmentItemChoices: { ...genericSelections },
      backgroundAsiBlockIndex:
        character.originSystem === '2024'
          ? isBackgroundChanged
            ? 0
            : character.backgroundAsiBlockIndex
          : undefined,
      backgroundAsiChoices:
        character.originSystem === '2024'
          ? isBackgroundChanged
            ? []
            : character.backgroundAsiChoices
          : undefined,
    },
    provenanceUpdate,
  })
}

export function applyBackgroundAbilityChoicesCommand(
  character: Character,
  ledger: ProvenanceLedger,
  background: Background5e,
  blockIndex: number,
  choices: string[],
): CharacterCommandResult {
  if (character.originSystem !== '2024') {
    return { characterPatch: {}, provenanceUpdate: ledger }
  }
  const normalizedBackground = normalizeBackgroundForOriginSystem(
    background,
    character.originSystem,
  )
  if (!normalizedBackground) return { characterPatch: {}, provenanceUpdate: ledger }
  const block = getBackgroundAbilityData(normalizedBackground).blocks[blockIndex]
  if (!block) return { characterPatch: {}, provenanceUpdate: ledger }

  let provenanceUpdate: ProvenanceLedger = {
    ...ledger,
    abilityBonuses: ledger.abilityBonuses.filter(
      (bonus) =>
        !(
          bonus.sourceTag.sourceType === 'background' &&
          bonus.sourceTag.sourceName === background.name
        ),
    ),
  }
  const sourceTag = makeSourceTag(
    'background',
    normalizedBackground.name,
    'choice',
    normalizedBackground.source,
  )
  const seen = new Set<string>()
  for (let index = 0; index < block.weights.length; index++) {
    const ability = normalizeAbilityName(choices[index] ?? '')
    if (!ability || seen.has(ability)) continue
    seen.add(ability)
    provenanceUpdate = addAbilityBonus(provenanceUpdate, {
      ability,
      value: block.weights[index],
      sourceTag,
    })
  }

  return {
    characterPatch: {
      backgroundAsiBlockIndex: blockIndex,
      backgroundAsiChoices: choices,
    },
    provenanceUpdate,
  }
}
