import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  deriveEffectiveRaceLanguageBlocks,
  deriveEffectiveSubraceLanguageBlocks,
  ensureOriginLanguageBaseline,
} from '@/lib/calculations/languageOrigin'
import { normalizeRaceMovement } from '@/lib/calculations/movement'
import {
  ensureRaceOriginInvariants,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { getRaceSelectionParent } from '@/lib/calculations/raceSelection'
import type { RaceSpellSelectionOptions } from '@/lib/calculations/raceSpellSelection'
import { reconcileSkillExpertise } from '@/lib/calculations/skills'
import { retractFeatChoiceOptionsForSources } from '@/lib/character/commands/featCommands'
import { reconcileFixedFeatOptionsCommand } from '@/lib/character/commands/fixedFeatCommands'
import { extractFixedGrantNames } from '@/lib/character/equipmentHelpers'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import {
  applyRaceGrants,
  reconcileRaceChange,
  reconcileSubraceChange,
  resolveRaceAsiChoicesInLedger,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'
import { reconcileRaceSpellProfileCommand } from './raceSpellProfileCommand'

export type ResolveRaceChoiceOptions = (domain: 'armor' | 'weapons', fromFilter: string) => string[]
export type RaceSelectionCommandOptions = Pick<RaceSpellSelectionOptions, 'subraceIsNested'> & {
  previousSubrace?: Race5e
}

function dedupeValues(values: string[]): string[] | undefined {
  const deduped = Array.from(new Set(values.map(normalizeKey))).filter(Boolean)
  return deduped.length > 0 ? deduped : undefined
}

function removeSourceProficiencies(
  character: Character,
  ledger: ProvenanceLedger,
  retainedLedger: ProvenanceLedger,
): Character['proficiencies'] {
  const proficiencies = { ...character.proficiencies }
  for (const domain of ['skills', 'languages', 'tools', 'armor', 'weapons'] as const) {
    const toRemove = new Set(
      Object.entries(ledger.proficiencies[domain])
        .filter(
          ([key, tags]) => tags.length > 0 && !retainedLedger.proficiencies[domain][key]?.length,
        )
        .map(([key]) => normalizeKey(key)),
    )
    if (toRemove.size > 0) {
      proficiencies[domain] = proficiencies[domain].filter(
        (name) => !toRemove.has(normalizeKey(name)),
      )
    }
  }
  return proficiencies
}

function buildRaceMaterializedPatch(
  character: Character,
  ledger: ProvenanceLedger,
  retainedLedger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
): Pick<
  Character,
  'proficiencies' | 'visions' | 'damageResistances' | 'damageImmunities' | 'conditionImmunities'
> {
  race = getRaceSelectionParent(race, subrace)
  let proficiencies = removeSourceProficiencies(character, ledger, retainedLedger)
  const raceSkills = extractProficiencyBlockNames(race.skillProficiencies ?? [], {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const raceLanguages = extractProficiencyBlockNames(deriveEffectiveRaceLanguageBlocks(race), {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const subraceSkills = extractProficiencyBlockNames(subrace?.skillProficiencies ?? [], {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const subraceLanguages = extractProficiencyBlockNames(
    deriveEffectiveSubraceLanguageBlocks(subrace),
    {
      includeAnyStandard: false,
    },
  ).filter((name) => !name.toLowerCase().startsWith('choose '))
  const languages = character.originSystem === '2024' ? [] : [...raceLanguages, ...subraceLanguages]

  proficiencies = {
    ...proficiencies,
    skills: [
      ...new Set([
        ...proficiencies.skills,
        ...raceSkills.map(normalizeKey),
        ...subraceSkills.map(normalizeKey),
      ]),
    ],
    languages: [...new Set([...proficiencies.languages, ...languages])],
    tools: [
      ...new Set([
        ...proficiencies.tools,
        ...extractFixedGrantNames(race.toolProficiencies),
        ...extractFixedGrantNames(subrace?.toolProficiencies),
      ]),
    ],
    weapons: [
      ...new Set([
        ...proficiencies.weapons,
        ...extractFixedGrantNames(race.weaponProficiencies),
        ...extractFixedGrantNames(subrace?.weaponProficiencies),
      ]),
    ],
    armor: [
      ...new Set([
        ...proficiencies.armor,
        ...extractFixedGrantNames(race.armorProficiencies),
        ...extractFixedGrantNames(subrace?.armorProficiencies),
      ]),
    ],
  }

  const visions = (character.visions ?? []).filter((vision) => vision.type !== 'darkvision')
  const darkvisionRange = subrace?.darkvision ?? race.darkvision
  if (typeof darkvisionRange === 'number' && darkvisionRange > 0) {
    visions.push({ type: 'darkvision', range: darkvisionRange })
  }

  return {
    proficiencies: reconcileSkillExpertise(proficiencies),
    visions: visions.length > 0 ? visions : undefined,
    damageResistances: dedupeValues([...(race.resist ?? []), ...(subrace?.resist ?? [])]),
    damageImmunities: dedupeValues([...(race.immune ?? []), ...(subrace?.immune ?? [])]),
    conditionImmunities: dedupeValues([
      ...(race.conditionImmune ?? []),
      ...(subrace?.conditionImmune ?? []),
    ]),
  }
}

export function applyRaceSelectionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
  raceAsiBlockIndex: 0 | 1,
  resolveRaceChoiceOptions: ResolveRaceChoiceOptions,
  options?: RaceSelectionCommandOptions,
): CharacterCommandResult {
  const normalized = normalizeRaceSelectionForOriginSystem(race, subrace, character.originSystem)
  if (!normalized.race) return { characterPatch: {}, provenanceUpdate: ledger }

  const oldRaceName = character.race || undefined
  const oldSubraceName = character.subrace || undefined
  const retracted = retractFeatChoiceOptionsForSources(character, ledger, [
    { sourceType: 'race', sourceName: oldRaceName },
    { sourceType: 'subrace', sourceName: oldSubraceName },
  ])
  const workingCharacter = { ...character, ...retracted.characterPatch }
  const retainedProvenance = reconcileRaceChange(
    retracted.provenanceUpdate,
    oldRaceName,
    oldSubraceName,
  )
  let provenanceUpdate = applyRaceGrants(
    normalized.race,
    normalized.subrace,
    retainedProvenance,
    resolveRaceChoiceOptions,
    raceAsiBlockIndex,
    getTotalCharacterLevel(character),
    { suppressLanguageGrants: character.originSystem === '2024', suppressSpellGrants: true },
  )
  provenanceUpdate = ensureOriginLanguageBaseline(provenanceUpdate, character.originSystem)
  ensureRaceOriginInvariants(provenanceUpdate, character.originSystem)
  const movement = normalizeRaceMovement(normalized.race, normalized.subrace)
  const racialSpells = reconcileRaceSpellProfileCommand(
    workingCharacter,
    provenanceUpdate,
    race,
    subrace,
    options,
  )
  provenanceUpdate = racialSpells.provenanceUpdate

  return reconcileFixedFeatOptionsCommand(character, ledger, {
    characterPatch: {
      race: race.name,
      raceSource: race.source || undefined,
      subrace: subrace?.name,
      subraceSource: subrace?.source || undefined,
      raceAsiBlockIndex,
      raceAsiChoices: [],
      movement,
      spells: racialSpells.spells,
      abilityScores: workingCharacter.abilityScores,
      ...buildRaceMaterializedPatch(
        workingCharacter,
        retracted.provenanceUpdate,
        retainedProvenance,
        normalized.race,
        normalized.subrace,
      ),
    },
    provenanceUpdate,
  })
}

export function applySubraceSelectionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
  resolveRaceChoiceOptions: ResolveRaceChoiceOptions,
  options?: RaceSelectionCommandOptions,
): CharacterCommandResult {
  const previousCandidates = [
    ...(options?.previousSubrace ? [options.previousSubrace] : []),
    ...(race.subraces ?? []),
  ]
  const previous = previousCandidates.find(
    (candidate) =>
      candidate.name === character.subrace &&
      (!character.subraceSource || candidate.source === character.subraceSource),
  )
  // An unavailable previous child may have replaced all parent mechanics. Rebuild the
  // complete selection rather than assume that parent ownership can be retained.
  if (
    subrace?._isVersion === true ||
    previous?._isVersion === true ||
    (character.subrace && !previous)
  ) {
    return applyRaceSelectionCommand(
      character,
      ledger,
      race,
      subrace,
      (character.raceAsiBlockIndex ?? 0) as 0 | 1,
      resolveRaceChoiceOptions,
      options,
    )
  }
  const normalized = normalizeRaceSelectionForOriginSystem(race, subrace, character.originSystem)
  if (!normalized.race) return { characterPatch: {}, provenanceUpdate: ledger }
  const oldSubraceName = character.subrace || undefined
  const retracted = retractFeatChoiceOptionsForSources(character, ledger, [
    { sourceType: 'subrace', sourceName: oldSubraceName },
  ])
  const workingCharacter = { ...character, ...retracted.characterPatch }
  const retainedProvenance = reconcileSubraceChange(retracted.provenanceUpdate, oldSubraceName)
  let provenanceUpdate = retainedProvenance
  if (normalized.subrace) {
    provenanceUpdate = applyRaceGrants(
      {
        name: race.name,
        source: race.source,
        skillProficiencies: [],
        languageProficiencies: [],
        toolProficiencies: [],
        weaponProficiencies: [],
        armorProficiencies: [],
        ability: [],
      },
      normalized.subrace,
      provenanceUpdate,
      resolveRaceChoiceOptions,
      (character.raceAsiBlockIndex ?? 0) as 0 | 1,
      getTotalCharacterLevel(character),
      { suppressLanguageGrants: character.originSystem === '2024', suppressSpellGrants: true },
    )
  }
  provenanceUpdate = ensureOriginLanguageBaseline(provenanceUpdate, character.originSystem)
  ensureRaceOriginInvariants(provenanceUpdate, character.originSystem)
  const movement = normalizeRaceMovement(normalized.race, normalized.subrace)
  const racialSpells = reconcileRaceSpellProfileCommand(
    workingCharacter,
    provenanceUpdate,
    race,
    subrace,
    options,
  )
  provenanceUpdate = racialSpells.provenanceUpdate

  return reconcileFixedFeatOptionsCommand(character, ledger, {
    characterPatch: {
      subrace: subrace?.name,
      subraceSource: subrace?.source || undefined,
      raceAsiChoices: [],
      movement,
      spells: racialSpells.spells,
      abilityScores: workingCharacter.abilityScores,
      ...buildRaceMaterializedPatch(
        workingCharacter,
        retracted.provenanceUpdate,
        retainedProvenance,
        normalized.race,
        normalized.subrace,
      ),
    },
    provenanceUpdate,
  })
}

export function applyRaceAsiChoicesCommand(
  ledger: ProvenanceLedger,
  choices: string[][],
): CharacterCommandResult {
  return {
    characterPatch: { raceAsiChoices: choices },
    provenanceUpdate: resolveRaceAsiChoicesInLedger(ledger, choices),
  }
}
