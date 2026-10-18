import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { normalizeSubclassRules } from '@/lib/5etools/classChoiceNormalization'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
} from '@/lib/character/classChoiceOptions'
import { ClassChoiceSelectionModal } from '@/pages/build/class/components/ClassChoiceSelectionModal'
import { useClassChoiceController } from '@/pages/build/class/hooks/useClassChoiceController'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Feat5e, Subclass5e, SubclassFeatureReference } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  makeCharacterFixture,
  makePrereqCharacterSnapshotFixture,
} from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

beforeEach(() => {
  resetCharacterStore()
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 100
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
function queueFixture(featFirst = false) {
  const refs: SubclassFeatureReference[] = ['Companion', 'Mount'].map((name) => ({
    ref: `${name}|Test Class|TEST|Bond|TEST|3|TEST`,
    name,
    source: 'TEST',
    className: 'Test Class',
    classSource: 'TEST',
    subclassShortName: 'Bond',
    subclassSource: 'TEST',
    level: 3,
    feature: {
      name,
      source: 'TEST',
      level: 3,
      entries:
        featFirst && name === 'Companion'
          ? [{ type: 'options', count: 1, entries: [{ feat: 'Gift|TEST' }] }]
          : ['Choose a {@filter beast|bestiary|type=beast|challenge rating=[&0;&1/4]}.'],
    },
  }))
  const subclass: Subclass5e = {
    name: 'Bond',
    shortName: 'Bond',
    source: 'TEST',
    className: 'Test Class',
    classSource: 'TEST',
    subclassFeatureRefs: refs,
    normalizedRules: normalizeSubclassRules(
      { name: 'Test Class', source: 'TEST' },
      { name: 'Bond', source: 'TEST' },
      refs,
    ),
  }
  const classData: Class5e = {
    name: 'Test Class',
    source: 'TEST',
    classFeatureRefs: [
      {
        ref: 'Bond Selection|Test Class|TEST|3',
        name: 'Bond Selection',
        className: 'Test Class',
        gainSubclassFeature: true,
        level: 3,
      },
    ],
    subclasses: [subclass],
  }
  const data = makeGameDataFixture({
    classes: [classData],
    feats: [
      {
        name: 'Gift',
        source: 'TEST',
        entries: [],
        ability: [{ choose: { from: ['int', 'wis'], count: 1 } }],
      },
    ],
    creatures: [
      { name: 'Wolf', source: 'TEST', type: 'beast', size: ['M'], cr: '1/4' },
      { name: 'Hawk', source: 'TEST', type: 'beast', size: ['T'], cr: '0' },
    ],
  })
  data.lookups = buildGameDataLookups(data)
  const character = makeCharacterFixture({
    allowedSources: ['TEST'],
    classProgression: [
      { name: 'Test Class', source: 'TEST', levels: 3, subclass: 'Bond', subclassSource: 'TEST' },
    ],
    features: [{ id: 'manual:keep', name: 'Independent', source: 'TEST', description: '' }],
  })
  const catalogs = {
    ...createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(data)),
    creatures: data.creatures ?? [],
    feats: data.feats,
  }
  return { data, classData, subclass, catalogs, character }
}
function setup() {
  const { data, classData, subclass, catalogs, character } = queueFixture()
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(character)
  const hook = renderHook(
    ({
      currentCatalogs = catalogs,
      currentSubclass = subclass,
      variants = false,
      paused = false,
    }) => {
      const current = useCharacterStore((state) => state.activeCharacter)
      return useClassChoiceController({
        character: current,
        viewingClassData: classData,
        viewingClassEntry: current?.classProgression[0],
        viewingSubclassData: currentSubclass,
        viewingClassLevel: current?.classProgression[0].levels ?? 0,
        includeClassFeatureVariants: variants,
        configurationPaused: paused,
        catalogs: currentCatalogs,
      })
    },
    {
      initialProps: {
        currentCatalogs: catalogs,
        currentSubclass: subclass,
        variants: false,
        paused: false,
      },
    },
  )
  return { ...hook, catalogs, subclass, character }
}
const active = () => useCharacterStore.getState().activeCharacter!

test('two source-normalized setup choices advance once, including a cleared first choice, then strictly reopen', () => {
  const { result, subclass, character } = setup()
  expect(result.current.choices.map((choice) => choice.label)).toEqual(['Companion', 'Mount'])
  act(() => result.current.configureSubclass(subclass))
  expect(result.current.activeChoice?.label).toBe('Companion')
  act(() => result.current.confirm([]))
  expect(result.current.activeChoice?.label).toBe('Mount')
  const hawk = result.current.activeOptionViews.find((view) => view.reference.name === 'Hawk')!
  act(() => result.current.confirm([hawk]))
  expect(result.current.activeChoice).toBeUndefined()
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(
    reopened.classChoiceSelections?.map((choice) => [
      choice.label,
      choice.selected.map((row) => row.name),
    ]),
  ).toEqual([['Mount', ['Hawk']]])
  expect(active().features).toEqual(character.features)
  act(() => result.current.configureSubclass(subclass))
  expect(result.current.activeChoice?.label).toBe('Companion')
  const bytes = JSON.stringify(active())
  act(() => result.current.close())
  expect(result.current.activeChoice).toBeUndefined()
  expect(JSON.stringify(active())).toBe(bytes)
})

test('generic manual picker revalidates current creature rows after source refresh', () => {
  const { result, rerender, catalogs, subclass, character } = setup()
  act(() => result.current.open(result.current.choices[0]))
  const stale = result.current.activeOptionViews.find((view) => view.reference.name === 'Wolf')!
  rerender({
    currentCatalogs: { ...catalogs, creatures: [] },
    currentSubclass: subclass,
    variants: false,
    paused: false,
  })
  act(() => result.current.confirm([stale]))
  expect(JSON.stringify(active())).toBe(JSON.stringify(character))
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  expect(
    result.current.activeOptionViews.filter((view) => view.availability === 'eligible'),
  ).toEqual([])
})

test('pending setup terminates on catalog, variant, owner, level or character change and does not resume on restoration', () => {
  for (const change of ['catalog', 'variant', 'owner', 'level', 'character'] as const) {
    const hook = setup()
    const { result, rerender, catalogs, subclass, character } = hook
    act(() => result.current.configureSubclass(subclass))
    expect(result.current.activeChoice?.label).toBe('Companion')
    if (change === 'catalog')
      rerender({
        currentCatalogs: { ...catalogs, creatures: [] },
        currentSubclass: subclass,
        variants: false,
        paused: false,
      })
    if (change === 'variant')
      rerender({
        currentCatalogs: catalogs,
        currentSubclass: subclass,
        variants: true,
        paused: false,
      })
    if (change === 'owner')
      act(() =>
        setActiveCharacter({
          ...character,
          classProgression: character.classProgression.map((entry) => ({
            ...entry,
            subclass: 'Other',
          })),
        }),
      )
    if (change === 'level')
      act(() =>
        setActiveCharacter({
          ...character,
          classProgression: character.classProgression.map((entry) => ({ ...entry, levels: 2 })),
        }),
      )
    if (change === 'character')
      act(() => setActiveCharacter({ ...character, id: 'other-character' }))
    expect(result.current.activeChoice).toBeUndefined()
    act(() => setActiveCharacter(character))
    rerender({
      currentCatalogs: catalogs,
      currentSubclass: subclass,
      variants: false,
      paused: false,
    })
    expect(result.current.activeChoice).toBeUndefined()
    expect(active().classChoiceSelections ?? []).toEqual([])
    hook.unmount()
  }
})

test('an existing nested feat modal owns focus before the setup queue continues', () => {
  const { result, rerender, catalogs, subclass } = setup()
  act(() => result.current.configureSubclass(subclass))
  expect(result.current.activeChoice?.label).toBe('Companion')
  rerender({ currentCatalogs: catalogs, currentSubclass: subclass, variants: false, paused: true })
  expect(result.current.activeChoice).toBeUndefined()
  rerender({ currentCatalogs: catalogs, currentSubclass: subclass, variants: false, paused: false })
  expect(result.current.activeChoice?.label).toBe('Companion')
  act(() => result.current.close())
  expect(result.current.activeChoice).toBeUndefined()
})

function SharedQueue({ fixture }: { fixture: ReturnType<typeof queueFixture> }) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const [pendingFeat, setPendingFeat] = useState<(Feat5e & { classFeatChoiceId: string }) | null>(
    null,
  )
  const { commitFeatWithOptions } = useFeatProvenanceMutations()
  const controller = useClassChoiceController({
    character,
    viewingClassData: fixture.classData,
    viewingClassEntry: character?.classProgression[0],
    viewingSubclassData: fixture.subclass,
    viewingClassLevel: character?.classProgression[0].levels ?? 0,
    catalogs: fixture.catalogs,
    configurationPaused: !!pendingFeat,
    onFeatOptionsRequired: (feat, id) => setPendingFeat({ ...feat, classFeatChoiceId: id }),
  })
  return (
    <>
      <button type="button" onClick={() => controller.configureSubclass(fixture.subclass)}>
        Configure
      </button>
      <button type="button" onClick={() => controller.open(controller.choices[0])}>
        Edit companion
      </button>
      {controller.activeChoice && (
        <ClassChoiceSelectionModal
          key={controller.activeChoice.id}
          choice={controller.activeChoice}
          options={controller.activeOptionViews}
          maximumSelections={controller.activeRequiredCount}
          initialSelectedIds={controller.activeInitialSelectedIds}
          characterSnapshot={makePrereqCharacterSnapshotFixture()}
          onClose={controller.close}
          onConfirm={controller.confirm}
        />
      )}
      {pendingFeat && (
        <FeatOptionsModal
          open
          feat={pendingFeat}
          onOpenChange={(open) => {
            if (!open) {
              setPendingFeat(null)
            }
          }}
          onDismiss={() => {
            setPendingFeat(null)
          }}
          onFinish={(selections) => {
            commitFeatWithOptions(pendingFeat, selections, [])
            setPendingFeat(null)
          }}
        />
      )}
    </>
  )
}
function mountSharedQueue(featFirst = false) {
  const fixture = queueFixture(featFirst)
  useGameDataStore.setState({ gameData: fixture.data })
  setActiveCharacter(fixture.character)
  const view = render(<SharedQueue fixture={fixture} />)
  fireEvent.click(screen.getByRole('button', { name: 'Configure' }))
  return { ...fixture, view }
}
const sharedDialog = () => within(screen.getByRole('dialog'))
function sharedRow(name: string) {
  fireEvent.change(sharedDialog().getByPlaceholderText('Search available options'), {
    target: { value: name },
  })
  return sharedDialog().findByRole('button', { name: new RegExp(`^${name}`) })
}

test.each([
  false,
  true,
])('real shared modal advances once after Confirm (Clear=%s) and Cancel stops the next step', async (clear) => {
  const fixture = mountSharedQueue()
  await screen.findByRole('heading', { name: 'Choose Companion' })
  if (!clear) fireEvent.click(await sharedRow('Wolf'))
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Confirm' }))
  await screen.findByRole('heading', { name: 'Choose Mount' })
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(active().classChoiceSelections?.map((choice) => choice.label) ?? []).toEqual(
    clear ? [] : ['Companion'],
  )
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(active().features).toEqual(fixture.character.features)
})

test('real nested feat configuration finishes before the next shared setup modal opens', async () => {
  mountSharedQueue(true)
  await screen.findByRole('heading', { name: 'Choose Companion' })
  fireEvent.click(await sharedRow('Gift'))
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Confirm' }))
  await screen.findByRole('heading', { name: 'Configure: Gift' })
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.queryByRole('heading', { name: 'Choose Mount' })).toBeNull()
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Intelligence' }))
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Finish' }))
  await screen.findByRole('heading', { name: 'Choose Mount' })
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(
    active()
      .classFeatChoices?.flatMap((choice) => choice.feats)
      .find((feat) => feat.name === 'Gift')?.options?.abilityScore,
  ).toBe('int')
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Cancel' }))
})

test('real generic modal preserves saved choice when an unsaved replacement disappears, and confirms after exact restoration', async () => {
  const fixture = mountSharedQueue()
  await screen.findByRole('heading', { name: 'Choose Companion' })
  fireEvent.click(await sharedRow('Wolf'))
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Confirm' }))
  await screen.findByRole('heading', { name: 'Choose Mount' })
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit companion' }))
  fireEvent.click(await sharedRow('Wolf'))
  fireEvent.click(await sharedRow('Hawk'))
  const bytes = JSON.stringify(active())
  await act(async () => {
    await useCharacterStore.setState({ isActiveCharacterDirty: false })
  })
  fixture.view.rerender(
    <SharedQueue
      fixture={{
        ...fixture,
        catalogs: {
          ...fixture.catalogs,
          creatures: fixture.catalogs.creatures.filter((creature) => creature.name !== 'Hawk'),
        },
      }}
    />,
  )
  expect(sharedDialog().getByRole('button', { name: 'Confirm' }).hasAttribute('disabled')).toBe(
    true,
  )
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Confirm' }))
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  fixture.view.rerender(<SharedQueue fixture={fixture} />)
  expect(sharedDialog().getByRole('button', { name: 'Confirm' }).hasAttribute('disabled')).toBe(
    false,
  )
  fireEvent.click(sharedDialog().getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(
    active()
      .classChoiceSelections?.find((choice) => choice.label === 'Companion')
      ?.selected.map((row) => row.name),
  ).toEqual(['Hawk'])
})
