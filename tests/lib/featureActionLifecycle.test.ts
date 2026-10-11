import { expect, test } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import {
  removeManualActionCommand,
  upsertManualActionCommand,
} from '@/lib/character/commands/actionCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import type { CharacterAction } from '@/types/actions'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

function fixture() {
  const classes = [
    makeClassFixture({
      classFeatureRefs: [
        {
          ref: 'Beacon|Wizard||1',
          name: 'Beacon',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          feature: {
            name: 'Beacon',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            level: 1,
            entries: ['As an action, light a beacon.'],
          },
        },
      ],
    }),
  ]
  const character = makeCharacterFixture({
    features: [],
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
  })
  const view = (saved = character) =>
    createCharacterSheetViewModel(saved, { classesByKey: buildClassLookup(classes) })
  const reopen = () => characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
  return { classes, character, view, reopen }
}
const manual = (id: string, name = 'Player rule'): CharacterAction => ({
  id,
  name,
  kind: 'action',
  description: `${name} text.`,
  source: { kind: 'manual', name },
  active: false,
})

test('new exact owned IDs survive UID enrichment and canonical spelling refresh without aliases', () => {
  const { classes, character, view, reopen } = fixture()
  const ref = classes[0].classFeatureRefs![0]
  ref.ref = ''
  const id = view().actions[0].id
  Object.assign(character, upsertManualActionCommand(character, manual(id)))
  ref.ref = ' beacon | WIZARD | PHB | 1 | PHB | Display'
  const saved = reopen()
  expect(view(saved).actions).toMatchObject([{ id, active: false }])
  expect(view(saved).actions).toHaveLength(1)
  saved.manualActions = []
  expect(view(saved).actions[0].id).toBe(id)
  expect(
    planSheetContent(view(saved), '2014-custom', { action: [id] }).groups.find(
      (group) => group.id === 'action',
    ),
  ).toMatchObject({ automatic: false, selected: [id] })
})

test('current exact override Edit, missing/restored data, strict reopen and Clear preserve player intent', () => {
  const { classes, character, view, reopen } = fixture()
  const id = view().actions[0].id
  Object.assign(character, upsertManualActionCommand(character, manual(id)))
  Object.assign(character, upsertManualActionCommand(character, manual(id, 'Edited rule')))
  const refs = classes[0].classFeatureRefs
  classes[0].classFeatureRefs = []
  expect(view(reopen()).actions).toMatchObject([{ id, name: 'Edited rule', active: false }])
  classes[0].classFeatureRefs = refs
  const saved = reopen()
  const before = structuredClone({ saved, classes })
  expect(view(saved).actions).toMatchObject([{ id, name: 'Edited rule', active: false }])
  const direct = deriveCharacterActions(saved, {
    classes,
    abilityModifiers: {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    },
    proficiencyBonus: 2,
  })
  expect(direct).toEqual(view(saved).actions)
  expect({ saved, classes }).toEqual(before)
  Object.assign(character, removeManualActionCommand(character, id))
  expect(view(reopen()).actions).toMatchObject([{ id, active: true, source: { kind: 'class' } }])
})

test('distinct manual IDs remain independent and PDF choices select each exact player row', () => {
  const { character, view, reopen } = fixture()
  const id = view().actions[0].id
  Object.assign(character, upsertManualActionCommand(character, manual(id, 'Owned override')))
  Object.assign(
    character,
    upsertManualActionCommand(character, manual('independent-player-row', 'Independent rule')),
  )
  for (const reverse of [false, true]) {
    const saved = reopen()
    if (reverse) saved.manualActions!.reverse()
    const actions = view(saved).actions
    expect(actions).toHaveLength(2)
    for (const selected of [id, 'independent-player-row']) {
      expect(
        planSheetContent(view(saved), '2014-custom', { action: [selected] }).groups.find(
          (group) => group.id === 'action',
        ),
      ).toMatchObject({ automatic: false, selected: [selected] })
    }
    expect(actions.find((action) => action.id === id)).toMatchObject({ name: 'Owned override' })
  }
})

test('an ineligible exact gain leaves its configured override explicit and restoration reunites it', () => {
  const { classes, character, view, reopen } = fixture()
  const ref = classes[0].classFeatureRefs![0]
  ref.ref = 'Beacon|Wizard||2'
  ref.level = 2
  ref.feature!.level = 2
  character.classProgression[0].levels = 2
  const id = view().actions[0].id
  Object.assign(character, upsertManualActionCommand(character, manual(id)))
  character.classProgression[0].levels = 1
  expect(view(reopen()).actions).toMatchObject([{ id, active: false }])
  character.classProgression[0].levels = 2
  expect(view(reopen()).actions).toHaveLength(1)
})

test('a newly issued earned ID stays stable when a unique saved feature arrives and leaves', () => {
  const { character, view, reopen } = fixture()
  const id = view().actions[0].id
  character.features = [
    {
      id: 'saved-beacon',
      name: 'Beacon',
      source: 'PHB',
      description: 'As an action, use saved training.',
    },
  ]
  expect(view().actions[0].id).toBe(id)
  Object.assign(character, upsertManualActionCommand(character, manual(id)))
  expect(view(reopen()).actions).toHaveLength(1)
  character.features = []
  expect(view(reopen()).actions).toMatchObject([{ id, active: false }])
})

test('canonical subclass source defaults remain independent of the parent class printing', () => {
  const { classes, character, view } = fixture()
  classes[0].classFeatureRefs = []
  classes[0].subclasses = [
    {
      name: 'School',
      shortName: 'School',
      source: 'PHB',
      className: 'Wizard',
      classSource: 'PHB',
      subclassFeatureRefs: [
        {
          ref: '',
          name: 'Beacon',
          source: '',
          className: 'Wizard',
          classSource: 'XPHB',
          subclassShortName: 'School',
          level: 1,
          feature: {
            name: 'Beacon',
            source: '',
            className: 'Wizard',
            classSource: 'XPHB',
            subclassShortName: 'School',
            level: 1,
            entries: ['As an action, use training.'],
          },
        },
      ],
    },
  ]
  character.classProgression[0].subclass = 'School'
  character.classProgression[0].subclassSource = 'PHB'
  const action = view().actions[0]
  expect(action.source.source).toBe('PHB')
  expect(action.id).toBe(
    `subclass-feature:${encodeURIComponent(JSON.stringify([JSON.stringify(['wizard|phb', 'school|phb']), 'subclass-feature|beacon|wizard|xphb|school|phb|1|phb']))}`,
  )
  expect(action).not.toHaveProperty('idAliases')
  expect(action).not.toHaveProperty('featureIdentities')
})
