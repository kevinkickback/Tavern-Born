import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  ensureOriginSystemInvariants,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { mergeSkillState } from '@/lib/calculations/skills'
import { extractFixedGrantNames } from '@/lib/character/equipmentHelpers'
import {
  applyRaceGrants,
  diffProficiencyGrants,
  reconcileRaceChange,
  reconcileSubraceChange,
  resolveRaceAsiChoicesInLedger,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export type ResolveRaceChoiceOptions = (domain: 'armor' | 'weapons', fromFilter: string) => string[]

function getEffectiveRaceLanguageBlocks(race: Race5e): unknown[] {
  if (Array.isArray(race.languageProficiencies) && race.languageProficiencies.length > 0) {
    return race.languageProficiencies
  }
  if (typeof race.lineage === 'string') return [{ common: true, anyStandard: 1 }]
  return []
}

function dedupeValues(values: string[]): string[] | undefined {
  const deduped = Array.from(new Set(values.map(normalizeKey))).filter(Boolean)
  return deduped.length > 0 ? deduped : undefined
}

function removeSourceProficiencies(
  character: Character,
  ledger: ProvenanceLedger,
  sources: Array<readonly ['race' | 'subrace', string | undefined]>,
): Character['proficiencies'] {
  let proficiencies = { ...character.proficiencies }
  for (const [sourceType, sourceName] of sources) {
    if (!sourceName) continue
    for (const domain of ['skills', 'languages', 'tools', 'armor', 'weapons'] as const) {
      const { toRemove } = diffProficiencyGrants(ledger, domain, sourceType, sourceName)
      if (toRemove.length === 0) continue
      proficiencies = {
        ...proficiencies,
        [domain]: proficiencies[domain].filter((name) => !toRemove.includes(normalizeKey(name))),
      }
    }
  }
  return proficiencies
}

function buildRaceMaterializedPatch(
  character: Character,
  ledger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
  sourcesToRemove: Array<readonly ['race' | 'subrace', string | undefined]>,
): Pick<
  Character,
  | 'proficiencies'
  | 'skills'
  | 'visions'
  | 'damageResistances'
  | 'damageImmunities'
  | 'conditionImmunities'
> {
  let proficiencies = removeSourceProficiencies(character, ledger, sourcesToRemove)
  const raceSkills = extractProficiencyBlockNames(race.skillProficiencies ?? [], {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const raceLanguages = extractProficiencyBlockNames(getEffectiveRaceLanguageBlocks(race), {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const subraceSkills = extractProficiencyBlockNames(subrace?.skillProficiencies ?? [], {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
  const subraceLanguages = extractProficiencyBlockNames(subrace?.languageProficiencies ?? [], {
    includeAnyStandard: false,
  }).filter((name) => !name.toLowerCase().startsWith('choose '))
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
    proficiencies,
    skills: mergeSkillState(character.skills ?? {}, proficiencies.skills),
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
): CharacterCommandResult {
  const normalized = normalizeRaceSelectionForOriginSystem(race, subrace, character.originSystem)
  if (!normalized.race) return { characterPatch: {}, provenanceUpdate: ledger }

  const oldRaceName = character.race || undefined
  const oldSubraceName = character.subrace || undefined
  let provenanceUpdate = reconcileRaceChange(ledger, oldRaceName, oldSubraceName)
  provenanceUpdate = applyRaceGrants(
    normalized.race,
    normalized.subrace,
    provenanceUpdate,
    resolveRaceChoiceOptions,
    raceAsiBlockIndex,
    1,
    { suppressLanguageGrants: character.originSystem === '2024' },
  )
  provenanceUpdate = ensureOriginLanguageBaseline(provenanceUpdate, character.originSystem)
  ensureOriginSystemInvariants(provenanceUpdate, character.originSystem)

  return {
    characterPatch: {
      race: race.name,
      raceSource: race.source || undefined,
      subrace: subrace?.name,
      subraceSource: subrace?.source || undefined,
      raceAsiBlockIndex,
      raceAsiChoices: [],
      ...buildRaceMaterializedPatch(character, ledger, normalized.race, normalized.subrace, [
        ['race', oldRaceName],
        ['subrace', oldSubraceName],
      ]),
    },
    provenanceUpdate,
  }
}

export function applySubraceSelectionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
  resolveRaceChoiceOptions: ResolveRaceChoiceOptions,
): CharacterCommandResult {
  const normalized = normalizeRaceSelectionForOriginSystem(race, subrace, character.originSystem)
  if (!normalized.race) return { characterPatch: {}, provenanceUpdate: ledger }
  const oldSubraceName = character.subrace || undefined
  let provenanceUpdate = reconcileSubraceChange(ledger, oldSubraceName)
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
      1,
      { suppressLanguageGrants: character.originSystem === '2024' },
    )
  }
  provenanceUpdate = ensureOriginLanguageBaseline(provenanceUpdate, character.originSystem)
  ensureOriginSystemInvariants(provenanceUpdate, character.originSystem)

  return {
    characterPatch: {
      subrace: subrace?.name,
      subraceSource: subrace?.source || undefined,
      raceAsiChoices: [],
      ...buildRaceMaterializedPatch(character, ledger, normalized.race, normalized.subrace, [
        ['subrace', oldSubraceName],
      ]),
    },
    provenanceUpdate,
  }
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
