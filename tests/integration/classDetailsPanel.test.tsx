import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { getSubclassFeatureGroups, resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildClassDetailsPanel } from '@/pages/build/class/components/DetailsPanel'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

test.each([true, false])('renders complete intro content once with level groups %s', (grouped) => {
  const classes = parseClasses({
    class: [{ name: 'Wizard', source: 'PHB' }],
    subclass: [
      {
        name: 'School',
        shortName: 'School',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        subclassFeatures: [
          'School|Wizard||School||3',
          'Practice|Wizard||School||3',
          'Practice|Wizard||School||3|TCE',
          'Practice|Wizard||School||6',
        ],
      },
    ],
    subclassFeature: [
      {
        name: 'School',
        className: 'Wizard',
        subclassShortName: 'School',
        level: 3,
        entries: [
          'Study the school.',
          { type: 'refSubclassFeature', subclassFeature: 'Practice|Wizard|| school ||3' },
          {
            type: 'options',
            count: 1,
            entries: [{ type: 'refOptionalfeature', optionalfeature: 'Training|PHB' }],
          },
        ],
      },
      {
        name: 'Practice',
        className: 'Wizard',
        subclassShortName: 'School',
        level: 3,
        entries: [
          { type: 'entries', name: 'Practice', entries: ['As an action, practice the method.'] },
          { type: 'refSubclassFeature', subclassFeature: 'Deep practice|Wizard||School||3' },
        ],
      },
      {
        name: 'Deep practice',
        className: 'Wizard',
        subclassShortName: 'School',
        level: 3,
        entries: ['As a bonus action, use the deeper method.'],
      },
      ...(
        [
          [3, 'TCE', 'Use the other printing.'],
          [6, 'PHB', 'Use the later gain.'],
        ] as const
      ).map(([level, source, text]) => ({
        name: 'Practice',
        className: 'Wizard',
        subclassShortName: 'School',
        level,
        source,
        entries: [text],
      })),
    ],
  }) as Class5e[]
  const subclass = classes[0].subclasses![0]
  const before = structuredClone(subclass)
  render(
    <BuildClassDetailsPanel
      selectedFeature={{
        name: subclass.name,
        source: subclass.source,
        entries: resolveSubclassFeatureRefs(subclass.entries ?? [], subclass.shortName),
        levelFeatures: grouped ? getSubclassFeatureGroups(subclass) : undefined,
      }}
      viewingClassLevel={3}
      viewingClassEntries={[]}
      onClearSelection={() => {}}
    />,
  )

  expect(screen.getAllByText('Study the school.')).toHaveLength(1)
  expect(screen.getAllByText('As an action, practice the method.')).toHaveLength(1)
  expect(screen.getAllByText('As a bonus action, use the deeper method.')).toHaveLength(1)
  expect(subclass.subclassFeatureRefs![0].feature).toBeDefined()
  if (grouped) {
    expect(screen.getAllByText('Use the other printing.')).toHaveLength(1)
    expect(screen.getAllByText('Use the later gain.')).toHaveLength(1)
  }
  expect(subclass.levelFeatures![0].features).toHaveLength(3)
  expect(subclass.normalizedRules!.choices).toHaveLength(1)
  expect(subclass).toEqual(before)
})

test.each([
  false,
  true,
])('keeps subclass details through replacement/filter/restore (parent spelling refresh %s)', async (refreshed) => {
  const makeCatalog = (text: string, refreshParent = false) => {
    const classes = parseClasses({
      class: [{ name: 'Wizard', source: 'PHB', classFeatures: [] }],
      subclass: [
        {
          name: 'School',
          shortName: 'School',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          subclassFeatures: ['School|Wizard||School||3|XGE'],
        },
      ],
      subclassFeature: [
        {
          name: 'School',
          className: 'Wizard',
          subclassShortName: 'School',
          source: 'XGE',
          level: 3,
          entries: [text],
        },
      ],
    }) as Class5e[]
    const data = makeGameDataFixture({
      classes: refreshParent
        ? classes.map((cls) => ({ ...cls, name: ' WIZARD ', source: ' phb ' }))
        : classes,
    })
    data.lookups = buildGameDataLookups(data)
    return data
  }
  useGameDataStore.setState({ gameData: makeCatalog('Original school rules.') })
  setActiveCharacter(
    makeCharacterFixture({
      allowedSources: ['PHB', 'XGE'],
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3, subclass: 'School', subclassSource: 'PHB' },
      ],
    }),
  )
  render(
    <MemoryRouter>
      <BuildClassPage />
    </MemoryRouter>,
  )
  if (!screen.queryByRole('button', { name: 'School' })) {
    fireEvent.click(screen.getByRole('button', { name: /^Level 3\b/ }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'School' }))
  expect(screen.getAllByText('Original school rules.')).toHaveLength(1)
  const replacement = makeCatalog('Replacement school rules.', refreshed)
  const before = structuredClone(replacement)
  await act(async () => {
    useGameDataStore.setState({ gameData: replacement })
  })
  expect(screen.queryByText('Original school rules.')).toBeNull()
  expect(screen.getAllByText('Replacement school rules.')).toHaveLength(1)
  await act(async () => {
    setActiveCharacter({
      ...useCharacterStore.getState().activeCharacter!,
      allowedSources: ['PHB'],
    })
  })
  expect(screen.queryByText('Replacement school rules.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Show class overview' }))
  fireEvent.click(screen.getByRole('button', { name: 'School' }))
  expect(screen.queryByText('Replacement school rules.')).toBeNull()
  await act(async () => {
    setActiveCharacter({
      ...useCharacterStore.getState().activeCharacter!,
      allowedSources: ['PHB', 'XGE'],
    })
  })
  expect(screen.getAllByText('Replacement school rules.')).toHaveLength(1)
  expect(replacement).toEqual(before)
  expect(useCharacterStore.getState().activeCharacter!.classProgression[0].subclassSource).toBe(
    'PHB',
  )
})
