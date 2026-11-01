import { readFileSync } from 'node:fs'
import { buildGameDataLookups, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Spell5e } from '@/types/5etools'
import { makeManagedClassSpellFixtures } from './managedClassSpellFixtures'
import { makeOptionalClassSectionData } from './optionalClassSectionFixtures'

/** Actual optional routes omitted from the SRD, joined to existing certified casting/book fixtures. */
export function makeOptionalClassSpellFixtures() {
  const fixture = makeManagedClassSpellFixtures()
  const { sourceLookup } = JSON.parse(
    readFileSync('tests/fixtures/optionalClassSpellRoutes.json', 'utf8'),
  )
  const raw = [
    ...JSON.parse(readFileSync('resources/srd/core/data/spells/spells-phb.json', 'utf8')).spell,
    ...['managedClassDailyOptionalSpell.json', 'managedClassSourceSpell.json'].map((file) =>
      JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8')),
    ),
  ].filter((spell) => sourceLookup[spell.source.toLowerCase()]?.[spell.name.toLowerCase()])
  const captured = parseSpells(raw, {
    sourceLookup,
    origin: 'fixture:optional-class-spells',
  }) as Spell5e[]
  const spells = [
    ...new Map(
      [...fixture.spells, ...captured].map((spell) => [
        getSpellReferenceKey(spell.name, spell.source),
        spell,
      ]),
    ).values(),
  ]
  const gameData = {
    ...fixture.data,
    spells,
    optionalClassSections: makeOptionalClassSectionData().data.optionalClassSections,
  }
  gameData.lookups = buildGameDataLookups(gameData)
  const catalogs = buildClassChoiceFeatureCatalogs(gameData)
  const spellsByKey = buildSpellLookup(spells)
  return {
    gameData,
    spells,
    context: { catalogs, spellsByKey },
    lookups: { ...fixture.lookups, classChoiceFeatureCatalogs: catalogs, spellsByKey },
  }
}
