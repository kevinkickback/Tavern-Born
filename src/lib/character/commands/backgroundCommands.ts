import { extractProficiencyBlockNames } from '@/lib/5etools/proficiencyBlockNames'
import {
  assertStartingEquipmentSelections,
  getBackgroundEquipmentBlocks,
  hasInvalidStartingEquipmentPackage,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import {
  createStartingEquipmentPolicy,
  type StartingEquipmentPolicy,
} from '@/lib/5etools/startingEquipmentPolicy'
import { buildBackgroundBonuses, getBackgroundAbilityData } from '@/lib/calculations/abilityScores'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  ensureOriginSystemInvariants,
  normalizeBackgroundForOriginSystem,
} from '@/lib/calculations/originSystem'
import { reconcileSkillExpertise } from '@/lib/calculations/skills'
import {
  removeFeatChoiceCommand,
  retractFeatChoiceOptionsForSources,
} from '@/lib/character/commands/featCommands'
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
  emptyProvenance,
  iterateProficiencyBlocks,
  makeSourceTag,
  reconcileBackgroundChange,
  removeGrantsBySourceRef,
  toProficiencyBlocks,
} from '@/lib/provenance'
import { normalizeKey, normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Background5e, Item5e } from '@/types/5etools'
import type { Character, StartingEquipmentItemChoices } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import { applyCharacterCommandResult, getFeatChoiceSelectedRefs } from './featCommandSupport'

const proficiencyDomains = ['skills', 'languages', 'tools'] as const
const fixedBackgroundDomains = new Set<string>([...proficiencyDomains, 'feats'])

function isBackgroundOwner(tag: SourceTag, background: Background5e) {
  return (
    tag.sourceType === 'background' &&
    normalizeOwnerIdentity(tag.sourceName) === normalizeOwnerIdentity(background.name) &&
    normalizeOwnerIdentity(tag.sourceRef) === normalizeOwnerIdentity(background.source)
  )
}

function retractChangedBackgroundFeats(
  character: Character,
  ledger: ProvenanceLedger,
  background: Background5e,
): CharacterCommandResult {
  const saved = ledger.choices.filter(
    (choice) => choice.domain === 'feats' && isBackgroundOwner(choice.sourceTag, background),
  )
  if (!saved.length) return { characterPatch: {}, provenanceUpdate: ledger }
  const current = applyBackgroundGrants(background, emptyProvenance()).choices
  const retired = saved.filter(
    (choice) =>
      !current.some(
        (option) =>
          option.domain === 'feats' &&
          option.id === choice.id &&
          option.chooseCount === choice.chooseCount &&
          JSON.stringify([...option.optionPool].sort()) ===
            JSON.stringify([...choice.optionPool].sort()),
      ),
  )
  let working = { ...character, provenance: ledger }
  for (const choice of retired)
    for (const feat of getFeatChoiceSelectedRefs(choice))
      working = applyCharacterCommandResult(
        working,
        removeFeatChoiceCommand(working, working.provenance, choice.id, feat.name, feat.source),
      )
  const retiredChoices = new Set(retired.map(({ id }) => id))
  return {
    characterPatch: { spells: working.spells, proficiencies: working.proficiencies },
    provenanceUpdate: {
      ...working.provenance,
      choices: working.provenance.choices.filter((choice) => !retiredChoices.has(choice.id)),
    },
  }
}

function projectBackgroundAbilityGrants(
  ledger: ProvenanceLedger,
  background: Background5e,
  blockIndex: number,
  choices: string[],
) {
  let result = {
    ...ledger,
    abilityBonuses: ledger.abilityBonuses.filter(
      ({ sourceTag }) => !isBackgroundOwner(sourceTag, background),
    ),
  }
  const sourceTag = makeSourceTag('background', background.name, 'choice', background.source)
  const bonuses = buildBackgroundBonuses(getBackgroundAbilityData(background), blockIndex, choices)
  for (const [ability, value] of Object.entries(bonuses))
    result = addAbilityBonus(result, { ability, value, sourceTag })
  return result
}

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
    normalizeOwnerIdentity(oldBackgroundName) !== normalizeOwnerIdentity(background.name) ||
    normalizeOwnerIdentity(character.backgroundSource) !== normalizeOwnerIdentity(background.source)
  const retracted = isBackgroundChanged
    ? retractFeatChoiceOptionsForSources(character, ledger, [
        { sourceType: 'background', sourceName: oldBackgroundName },
      ])
    : retractChangedBackgroundFeats(character, ledger, normalizedBackground)
  const workingCharacter = { ...character, ...retracted.characterPatch }
  let provenanceUpdate = isBackgroundChanged
    ? reconcileBackgroundChange(retracted.provenanceUpdate, oldBackgroundName)
    : removeGrantsBySourceRef(
        retracted.provenanceUpdate,
        'background',
        background.name,
        background.source,
        undefined,
        {
          normalizeIdentity: true,
          preserve: (tag, domain) =>
            tag.grantType !== 'fixed' || !domain || !fixedBackgroundDomains.has(domain),
        },
      )
  provenanceUpdate = applyBackgroundGrants(normalizedBackground, provenanceUpdate, {
    suppressLanguageGrants: character.originSystem === '2024',
  })
  provenanceUpdate = ensureOriginLanguageBaseline(provenanceUpdate, character.originSystem)
  ensureOriginSystemInvariants(provenanceUpdate, character.originSystem)
  if (!isBackgroundChanged && character.originSystem === '2024')
    provenanceUpdate = projectBackgroundAbilityGrants(
      provenanceUpdate,
      normalizedBackground,
      character.backgroundAsiBlockIndex ?? 0,
      character.backgroundAsiChoices ?? [],
    )

  let proficiencies = { ...workingCharacter.proficiencies }
  if (oldBackgroundName) {
    for (const domain of proficiencyDomains) {
      const toRemove = isBackgroundChanged
        ? diffProficiencyGrants(retracted.provenanceUpdate, domain, 'background', oldBackgroundName)
            .toRemove
        : Object.keys(ledger.proficiencies[domain]).filter(
            (key) =>
              ledger.proficiencies[domain][key].some(
                (tag) => tag.grantType === 'fixed' && isBackgroundOwner(tag, background),
              ) && !provenanceUpdate.proficiencies[domain][key]?.length,
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
  if (hasInvalidStartingEquipmentPackage(blocks, blockChoices))
    throw new RangeError('Choose a current Background starting equipment package.')
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
  const abilityData = getBackgroundAbilityData(normalizedBackground)
  if (!abilityData.blocks[blockIndex]) return { characterPatch: {}, provenanceUpdate: ledger }

  return {
    characterPatch: {
      backgroundAsiBlockIndex: blockIndex,
      backgroundAsiChoices: choices,
    },
    provenanceUpdate: projectBackgroundAbilityGrants(
      ledger,
      normalizedBackground,
      blockIndex,
      choices,
    ),
  }
}
