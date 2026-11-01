import { readFileSync } from 'node:fs'
import { buildGameDataLookups, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { Spell5e } from '@/types/5etools'
import { makeManagedClassSpellFixtures } from './managedClassSpellFixtures'

/** Current source facts and routes for browser targets omitted from the bundled SRD. */
export function makeManagedClassSpellBrowserFixtures() {
  const fixture = makeManagedClassSpellFixtures()
  const facts = JSON.parse(readFileSync('tests/fixtures/managedClassBrowserSpells.json', 'utf8'))
  const captured = parseSpells(facts.spells, { sourceLookup: facts.sourceLookup }) as Spell5e[]
  const spells = [
    ...new Map(
      [...fixture.spells, ...captured].map((spell) => [
        getSpellReferenceKey(spell.name, spell.source),
        spell,
      ]),
    ).values(),
  ]
  const spellsByKey = buildSpellLookup(spells)
  const gameData = { ...fixture.data, spells }
  gameData.lookups = buildGameDataLookups(gameData)
  return {
    ...fixture,
    spells,
    gameData,
    context: { ...fixture.context, spellsByKey },
    lookups: { ...fixture.lookups, spellsByKey },
  }
}
