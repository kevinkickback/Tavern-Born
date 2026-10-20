import { readFileSync } from 'node:fs'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { applySkillProficiencyActionCommand } from '@/lib/character/commands/skillProficiencyCommands'
import { getSkillProficiencyChoices } from '@/lib/character/skillProficiencyChoices'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'
import {
  makeOptionalDeclarationCatalog,
  type OptionalDeclarationDocument,
} from './optionalClassDeclarationFixtures'

export const PRIMAL_TARGET = 'class-feature|primal knowledge|barbarian|phb|3|tce'
export function makeOptionalSkillFixture(
  level = 10,
  change?: (document: OptionalDeclarationDocument) => void,
) {
  const { data } = makeOptionalDeclarationCatalog(
    'class/class-barbarian.json',
    ['class', 'barbarian', 'phb'],
    change,
  )
  data.skills = JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill
  data.lookups = buildGameDataLookups(data)
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const character = makeCharacterFixture({
    race: '',
    raceSource: '',
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Barbarian', source: 'PHB', levels: level }],
    variantRules: { optionalClassFeatures: true },
    optionalClassFeatureAdoptions: [
      { owner: ['class', 'barbarian', 'phb'], target: PRIMAL_TARGET, earnedLevel: 3 },
    ],
  })
  return {
    data,
    catalogs,
    character,
    authority: { classes: data.classes, feats: data.feats, catalogs },
  }
}
export function chooseOptionalSkill(
  f: ReturnType<typeof makeOptionalSkillFixture>,
  character: Character,
  level: number,
  skill: string,
) {
  const model = getSkillProficiencyChoices(character, f.authority)
  const owner = model.classOwners.find((row) => row.level === level)!
  const action = model.actions[skill].find((row) => row.ownerId === owner.id && row.adding)!
  const result = applySkillProficiencyActionCommand(
    character,
    character.provenance,
    skill,
    action.id,
    f.authority,
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}
