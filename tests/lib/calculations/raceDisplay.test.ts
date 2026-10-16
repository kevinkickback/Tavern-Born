import { expect, test } from 'vitest'
import {
  getRaceDisplayName,
  getSpellProfileDisplayLabel,
  getSubraceDisplayName,
} from '@/lib/calculations/raceDisplay'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'

test.each([
  ['Dragonborn', 'Dragonborn (Black)', 'Black'],
  ['Dragonborn', 'Dragonborn (Draconblood; Brass)', 'Draconblood: Brass'],
  ['Elf', 'Elf; Drow Lineage', 'Drow Lineage'],
  ['Gnome', 'Forest', 'Forest'],
  [
    'Half-Elf',
    'Half-Elf (Variant; High Elf Descent; Moon Elf)',
    'Variant: High Elf Descent: Moon Elf',
  ],
  ['Test Race', 'Test Race (Family (Legacy); Brass)', 'Family (Legacy): Brass'],
  ['Test Race', 'Test Race (Family); Brass', 'Family: Brass'],
  ['Elf', 'Elfish (Moon)', 'Elfish (Moon)'],
  ['Elf', 'Elf (Moon', 'Elf (Moon'],
  ['Elf', 'Elf (Moon) extra', 'Elf (Moon) extra'],
  ['Elf', 'Elf (Moon;)', 'Elf (Moon;)'],
  ['Dragonborn', 'Black)', 'Black)'],
])('formats %s / %s without collapsing lineage distinctions', (parent, child, expected) => {
  expect(getSubraceDisplayName(parent, child)).toBe(expected)
})

test('full-context summaries work without loaded metadata and preserve stored identities', () => {
  const character = makeCharacterFixture({
    race: 'Dragonborn',
    raceSource: 'PHB',
    subrace: 'Dragonborn (Draconblood; Brass)',
    subraceSource: 'EGW',
  })
  const before = JSON.stringify(character)
  expect(getRaceDisplayName(character.race, character.subrace)).toBe(
    'Dragonborn (Draconblood: Brass)',
  )
  expect(createCharacterSheetViewModel(character, {}).raceSummary).toBe(
    'Dragonborn (Draconblood: Brass)',
  )
  expect(JSON.stringify(character)).toBe(before)
})

test('native spell display uses its saved context without changing profile labels or ownership', () => {
  const profile = {
    label: 'High',
    racial: {
      ownerType: 'subrace' as const,
      mode: 'mandatory' as const,
      fixed: [],
      context: { parent: { name: 'Elf', source: 'PHB' }, child: { name: 'High', source: 'PHB' } },
    },
  }
  const before = JSON.stringify(profile)
  expect(getSpellProfileDisplayLabel(profile)).toBe('Elf (High)')
  expect(getSpellProfileDisplayLabel({ label: 'Wizard 3' })).toBe('Wizard 3')
  expect(JSON.stringify(profile)).toBe(before)
})
