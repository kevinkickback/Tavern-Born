import { readFileSync } from 'node:fs'
import { buildClassLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import type { Spell5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ClassSpellSelectionPolicy, ManagedClassSpellDomain } from '@/types/classCasting'
import { makeClassCastingData } from './classCastingFixtures'

export function makeManagedClassSpellFixtures() {
  const data = makeClassCastingData()
  const sourceLookup = JSON.parse(
    readFileSync('resources/srd/core/data/generated/gendata-spell-source-lookup.json', 'utf8'),
  )
  const spells = parseSpells(
    [
      ...['phb', 'xphb'].flatMap(
        (source) =>
          JSON.parse(readFileSync(`resources/srd/core/data/spells/spells-${source}.json`, 'utf8'))
            .spell,
      ),
      JSON.parse(readFileSync('tests/fixtures/managedClassSourceSpell.json', 'utf8')),
      JSON.parse(readFileSync('tests/fixtures/managedClassDailyOptionalSpell.json', 'utf8')),
      ...JSON.parse(readFileSync('tests/fixtures/managedClassSourceNeighbors.json', 'utf8')),
    ],
    { sourceLookup },
  ) as Spell5e[]
  const context = {
    catalogs: buildClassChoiceFeatureCatalogs(data),
    spellsByKey: buildSpellLookup(spells),
  }
  return {
    data,
    spells,
    context,
    lookups: {
      classesByKey: buildClassLookup(data.classes),
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: context.catalogs,
      spellsByKey: context.spellsByKey,
    },
  }
}

/** Explicit current-format test authorship; never converts saved profile rows into ownership. */
export function authorManagedClassSpellFixture(
  initial: Character,
  fixture: ReturnType<typeof makeManagedClassSpellFixtures>,
  plans: readonly {
    owner: CharacterClassEntry
    domain: ManagedClassSpellDomain
    gain: number
    policy?: ClassSpellSelectionPolicy
    targets: readonly { name: string; source: string; prepare?: true }[]
  }[],
  daily: readonly { profileId: string; reference: string }[] = [],
) {
  if (initial.managedClassSpellChoices?.length)
    throw Error(
      'Author a fresh fixture; existing spell ownership must be edited through its command.',
    )
  let character: Character = characterPersistenceSchema.parse(initial)
  character = {
    ...character,
    spells: { ...character.spells, spellProfiles: ensureSpellProfiles(character) },
  }
  const requests = plans.flatMap((plan) =>
    plan.targets.map((target, ordinal) => {
      const slot = getManagedClassSpellSlots(plan.owner).find(
        (slot) => slot[1] === plan.domain && slot[3] === plan.gain && slot[4] === ordinal,
      )
      if (!slot) throw Error('The explicit test plan has no earned spell slot')
      const { prepare, ...reference } = target
      return {
        slot,
        expected: null,
        expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
        target: reference,
        policy: plan.policy ?? 'default',
        ...(prepare ? { prepare } : {}),
      }
    }),
  )
  const context = { ...fixture.context, abilityScores: character.abilityScores }
  if (requests.length) {
    const result = setManagedClassSpellChoicesCommand(
      character,
      character.provenance,
      requests,
      context,
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  for (const row of daily) {
    const result = setDailyClassSpellPreparedCommand(
      character,
      character.provenance,
      row.profileId,
      row.reference,
      true,
      context,
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  return character
}
