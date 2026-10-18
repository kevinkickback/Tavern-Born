import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
} from '@/lib/5etools/classFeatureIdentity'
import type { ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'

// Representative declarations from the configured 5etools class files.
export const dragonEntries = [
  'At 1st level, you choose one type of dragon as your ancestor.',
  {
    type: 'table',
    caption: 'Draconic Ancestry',
    colLabels: ['Dragon', 'Damage Type'],
    rows: [
      ['Black', 'Acid'],
      ['Red', 'Fire'],
    ],
  },
]
export const stormEntries = [
  'Choose desert, sea, or tundra.',
  {
    type: 'options',
    entries: ['Desert', 'Sea', 'Tundra'].map((name) => ({
      type: 'refSubclassFeature',
      subclassFeature: `${name}|Barbarian||Storm Herald|XGE|3`,
    })),
  },
]
export const enemyEntries = [
  'Choose a type of favored enemy:',
  'You choose one additional favored enemy at 6th and 14th level.',
]
const terrainEntries = [
  'Choose one type of favored terrain:',
  'You choose additional favored terrain types at 6th and 10th level.',
]
export const deftEntries = [
  '1st-level ranger optional feature, which replaces the Natural Explorer feature',
  {
    type: 'entries',
    name: 'Canny',
    entries: [
      'Choose one of your skill proficiencies.',
      'You can also speak, read, and write two additional languages of your choice.',
    ],
  },
]
const foeEntries = [
  '1st-level ranger optional feature, which replaces the Favored Enemy feature and works with the Foe Slayer feature',
]

export function classSetupRef(
  uid: string,
  entries: unknown[],
  variant = false,
): ClassFeatureReference {
  const target = decodeClassFeatureReference(uid)
  return {
    ...target,
    feature: {
      ...target,
      source: target.source!,
      entries,
      ...(variant ? { isClassFeatureVariant: true } : {}),
    },
  }
}
export function subclassSetupRef(uid: string, entries: unknown[]): SubclassFeatureReference {
  const target = decodeSubclassFeatureReference(uid)
  return { ...target, feature: { ...target, source: target.source!, entries } }
}
export function rangerSetupDocument() {
  const refs = [
    classSetupRef('Favored Enemy|Ranger||1', enemyEntries),
    classSetupRef('Natural Explorer|Ranger||1', terrainEntries),
    classSetupRef('Favored Foe|Ranger||1|TCE', foeEntries, true),
    classSetupRef('Deft Explorer|Ranger||1|TCE', deftEntries, true),
  ]
  return {
    class: [
      {
        name: 'Ranger',
        source: 'PHB',
        hd: { number: 1, faces: 10 },
        classFeatures: refs.map((ref) => ref.ref),
      },
    ],
    classFeature: refs.map((ref) => ref.feature),
  }
}
export function dragonSetupDocument(revisedOwner = true) {
  const classSource = revisedOwner ? 'XPHB' : 'PHB'
  const level = revisedOwner ? 3 : 1
  const dragon = subclassSetupRef('Dragon Ancestor|Sorcerer||Draconic||1', dragonEntries)
  const root = subclassSetupRef(
    `Draconic Bloodline|Sorcerer|${classSource}|Draconic|PHB|${level}|PHB`,
    [
      'Your innate magic comes from draconic magic.',
      { type: 'refSubclassFeature', subclassFeature: dragon.ref },
    ],
  )
  return {
    class: [
      {
        name: 'Sorcerer',
        source: classSource,
        hd: { number: 1, faces: 6 },
        classFeatures: [
          {
            classFeature: `Sorcerous Origin|Sorcerer|${classSource}|${level}`,
            gainSubclassFeature: true,
          },
        ],
      },
    ],
    classFeature: [
      classSetupRef(`Sorcerous Origin|Sorcerer|${classSource}|${level}`, ['Choose a subclass.'])
        .feature,
    ],
    subclass: [
      {
        name: 'Draconic Bloodline',
        shortName: 'Draconic',
        source: 'PHB',
        className: 'Sorcerer',
        classSource,
        subclassFeatures: [root.ref],
      },
    ],
    subclassFeature: [root.feature, dragon.feature],
  }
}
