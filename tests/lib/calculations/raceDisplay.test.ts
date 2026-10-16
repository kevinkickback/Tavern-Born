import { expect, test } from 'vitest'
import {
  getRaceDisplayName,
  getRacialSourceDisplayName,
  getSpellProfileDisplayLabel,
  getSubraceDisplayName,
} from '@/lib/calculations/raceDisplay'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'

const selection = { race: 'Elf', subrace: 'High', subraceSource: 'PHB' }

test.each([
  [{ kind: 'race', name: 'High', source: 'PHB' }, 'Elf (High)'],
  [{ kind: 'subrace', name: 'High', source: ' phb ' }, 'Elf (High)'],
  [{ kind: 'race', name: 'Wood', source: 'PHB' }, 'Wood'],
  [{ kind: 'race', name: 'High', source: 'XPHB' }, 'High'],
  [{ kind: 'race', name: 'High' }, 'High'],
  [{ kind: 'manual', name: 'High', source: 'PHB' }, 'High'],
  [{ kind: 'class', name: 'High', source: 'PHB' }, 'High'],
  [{ kind: 'race', name: 'Elf', source: 'PHB' }, 'Elf'],
])('qualifies only the exact selected racial source %j', (source, expected) => {
  const before = JSON.stringify({ selection, source })
  expect(getRacialSourceDisplayName(selection, source)).toBe(expected)
  expect(JSON.stringify({ selection, source })).toBe(before)
})

test('source tags and incomplete context retain conservative presentation fallbacks', () => {
  const tag = { sourceType: 'subrace' as const, sourceName: 'High', sourceRef: 'PHB' }
  expect(getRacialSourceDisplayName(selection, tag)).toBe('Elf (High)')
  expect(getRacialSourceDisplayName(undefined, tag)).toBe('High')
  expect(getRacialSourceDisplayName({ ...selection, race: '' }, tag)).toBe('High')
  expect(getRacialSourceDisplayName({ ...selection, subraceSource: ' ' }, tag)).toBe('High')
})

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
