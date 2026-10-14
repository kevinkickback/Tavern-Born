import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { getSubclassFeatureGroups } from '@/lib/5etools/classData'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { BuildClassDetailsPanel } from '@/pages/build/class/components/DetailsPanel'
import type { Class5e } from '@/types/5etools'

afterEach(cleanup)

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
        subclassFeatures: ['School|Wizard||School||3'],
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
          { type: 'entries', name: 'Practice', entries: ['As an action, practice the method.'] },
          {
            type: 'options',
            count: 1,
            entries: [{ type: 'refOptionalfeature', optionalfeature: 'Training|PHB' }],
          },
        ],
      },
    ],
  }) as Class5e[]
  const subclass = classes[0].subclasses![0]
  const before = structuredClone(subclass)
  render(
    <BuildClassDetailsPanel
      selectedFeature={{
        name: subclass.name,
        source: subclass.source,
        entries: subclass.entries ?? [],
        levelFeatures: grouped ? getSubclassFeatureGroups(subclass) : undefined,
      }}
      viewingClassLevel={3}
      viewingClassEntries={[]}
      onClearSelection={() => {}}
    />,
  )

  expect(screen.getAllByText('Study the school.')).toHaveLength(1)
  expect(screen.getAllByText('As an action, practice the method.')).toHaveLength(1)
  expect(subclass.subclassFeatureRefs![0].feature).toBeDefined()
  expect(subclass.levelFeatures![0].features).toHaveLength(1)
  expect(subclass.normalizedRules!.choices).toHaveLength(1)
  expect(subclass).toEqual(before)
})
