import { describe, expect, it } from 'vitest'
import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { DataFilter } from '@/lib/5etools/filters'
import {
  getCurrentOptionalDeclaration,
  OPTIONAL_CLASS_DECLARATIONS,
} from '@/lib/5etools/optionalClassDeclarationSource'
import {
  collectOptionalDeclarationCertificates,
  type OptionalDeclarationOwner,
  optionalDeclarationKey,
  summarizeOptionalDeclarationCertificate,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import {
  makeOptionalDeclarationCatalog,
  makeOptionalDeclarationLayer,
  optionalDeclarationSources,
} from '../fixtures/optionalClassDeclarationFixtures'

const MONK: OptionalDeclarationOwner = ['class', 'monk', 'phb']
const DEDICATED = 'class-feature|dedicated weapon|monk|phb|2|tce'
const BATTLE: OptionalDeclarationOwner = ['subclass', 'fighter', 'xphb', 'battle master', 'phb']
const MANEUVERS = 'subclass-feature|maneuver options|fighter|phb|battle master|phb|3|tce'
const KNOWLEDGE: OptionalDeclarationOwner = [
  'subclass',
  'cleric',
  'phb',
  'knowledge domain (psa)',
  'psa',
]
const BLESSED = 'subclass-feature|blessed strikes|cleric|phb|knowledge|phb|8|tce'
const current = (
  catalogs: Parameters<typeof getCurrentOptionalDeclaration>[0],
  owner: OptionalDeclarationOwner = MONK,
  target = DEDICATED,
  level = 2,
) => getCurrentOptionalDeclaration(catalogs, owner, target, level)

describe('current optional class/subclass declaration authority', () => {
  it('generates compact runtime certificates from the actual raw declaration producer', () => {
    const file = optionalDeclarationSources.documents.find(
      (row) => row.file === 'class/class-barbarian.json',
    )!
    const target = 'class-feature|primal knowledge|barbarian|phb|3|tce'
    const certificates = collectOptionalDeclarationCertificates(file.data, new Set([target]))
    expect(certificates).toHaveLength(1)
    const runtime = summarizeOptionalDeclarationCertificate(certificates[0])
    expect(runtime).toEqual(OPTIONAL_CLASS_DECLARATIONS.find((row) => row.target === target))
  })
  it('retains each actual selected owner, target printing and enclosing gain', () => {
    const unavailable: string[] = []
    for (const row of OPTIONAL_CLASS_DECLARATIONS) {
      const file = optionalDeclarationSources.documents.find((document) =>
        document.data.class.some(
          (cls) =>
            String(cls.name).trim().toLowerCase() === row.owner[1] &&
            String(cls.source).trim().toLowerCase() === row.owner[2],
        ),
      )!.file
      const { catalogs } = makeOptionalDeclarationCatalog(file, row.owner)
      const current = getCurrentOptionalDeclaration(catalogs, row.owner, row.target, row.level)
      if (!current) unavailable.push(optionalDeclarationKey(row.owner, row.target, row.level))
      else {
        expect(current.feature.name.toLowerCase()).toBe(row.target.split('|')[1])
        expect(current.level).toBe(row.level)
      }
    }
    expect(unavailable).toEqual([])
  })
  it.each([
    'name',
    'source',
    'className',
    'classSource',
    'level',
  ])('does not recover a class target with conflicting %s from the only remaining neighbor', (field) => {
    const { catalogs } = makeOptionalDeclarationCatalog('class/class-monk.json', MONK)
    const original = catalogs.classFeatures.find(
      (row) => getClassFeatureIdentity(row) === DEDICATED,
    )!
    const other = { ...original, [field]: field === 'level' ? 3 : 'OTHER' }
    const changed = {
      ...catalogs,
      classFeatures: catalogs.classFeatures
        .filter((row) => getClassFeatureIdentity(row) !== DEDICATED)
        .concat(other),
      classFeatureCandidates: new Map([[getClassFeatureIdentity(other)!, [other]]]),
    }
    expect(current(changed)).toBeUndefined()
    expect(current(catalogs)).toBeDefined()
  })
  it.each([
    'name',
    'source',
    'className',
    'classSource',
    'subclassShortName',
    'subclassSource',
    'level',
  ])('does not recover a subclass target with conflicting %s from the only remaining neighbor', (field) => {
    const { catalogs } = makeOptionalDeclarationCatalog('class/class-cleric.json', KNOWLEDGE)
    const original = catalogs.subclassFeatures.find(
      (row) => getSubclassFeatureIdentity(row) === BLESSED,
    )!
    const other = { ...original, [field]: field === 'level' ? 9 : 'OTHER' }
    const changed = {
      ...catalogs,
      subclassFeatures: catalogs.subclassFeatures
        .filter((row) => getSubclassFeatureIdentity(row) !== BLESSED)
        .concat(other),
      subclassFeatureCandidates: new Map([[getSubclassFeatureIdentity(other)!, [other]]]),
    }
    expect(current(changed, KNOWLEDGE, BLESSED, 8)).toBeUndefined()
    expect(current(catalogs, KNOWLEDGE, BLESSED, 8)).toBeDefined()
  })
  it.each([
    'name',
    'source',
    'className',
    'classSource',
    'subclassShortName',
    'subclassSource',
    'level',
    'uid arity',
  ])('rejects an explicit conflicting current reference %s', (field) => {
    const { catalogs } = makeOptionalDeclarationCatalog('class/class-cleric.json', KNOWLEDGE)
    const changed = structuredClone(catalogs)
    const sub = changed
      .classes!.find((row) => row.name === 'Cleric' && row.source === 'PHB')!
      .subclasses!.find((row) => row.name === 'Knowledge Domain (PSA)')!
    sub.subclassFeatureRefs = sub.subclassFeatureRefs!.map((row) =>
      row.ref.startsWith('Blessed Strikes|')
        ? {
            ...row,
            ...(field === 'uid arity'
              ? { ref: row.ref + '|extra' }
              : { [field]: field === 'level' ? 9 : 'OTHER' }),
          }
        : row,
    )
    expect(current(changed, KNOWLEDGE, BLESSED, 8)).toBeUndefined()
  })
  it.each([
    'raw owner duplicate with no declarations',
    'raw class body duplicate',
    'unknown copy directive',
    'duplicate lookup parent',
    'parent meaning drift',
  ])('retains pre-map uncertainty: %s', (mode) => {
    if (mode === 'raw class body duplicate') {
      const { catalogs } = makeOptionalDeclarationCatalog('class/class-monk.json', MONK, (doc) =>
        doc.classFeature.push(
          structuredClone(doc.classFeature.find((row) => row.name === 'Dedicated Weapon')!),
        ),
      )
      expect(current(catalogs)).toBeUndefined()
      return
    }
    const { catalogs } = makeOptionalDeclarationCatalog(
      'class/class-fighter.json',
      BATTLE,
      (doc) => {
        const selected = doc.subclass.find(
          (row) =>
            row.name === 'Battle Master' && row.source === 'PHB' && row.classSource === 'XPHB',
        )!
        const parent = doc.subclass.find(
          (row) =>
            row.name === 'Battle Master' && row.source === 'PHB' && row.classSource === 'PHB',
        )!
        if (mode === 'raw owner duplicate with no declarations')
          doc.subclass.push({ ...structuredClone(selected), subclassFeatures: [] })
        if (mode === 'unknown copy directive')
          (selected._copy as Record<string, unknown>).condition = 'At night'
        if (mode === 'duplicate lookup parent')
          doc.subclass.unshift({ ...structuredClone(parent), subclassFeatures: [] })
        if (mode === 'parent meaning drift') parent.page = 999
      },
    )
    expect(current(catalogs, BATTLE, MANEUVERS, 3)).toBeUndefined()
  })
  it.each([
    'nested ancestor prose',
    'options relocation',
    'nested explicit conflict',
  ])('requires the complete raw nested ancestor/path: %s', (mode) => {
    const { catalogs } = makeOptionalDeclarationCatalog(
      'class/class-fighter.json',
      BATTLE,
      (doc) => {
        const intro = doc.subclassFeature.find((row) => row.name === 'Battle Master')!
        const entries = intro.entries as unknown[]
        if (mode === 'nested ancestor prose') entries[0] = 'Changed governing conditions.'
        if (mode === 'options relocation')
          intro.entries = [
            ...entries.slice(0, -1),
            { type: 'options', entries: [entries[entries.length - 1]] },
          ]
        if (mode === 'nested explicit conflict')
          (entries[entries.length - 1] as Record<string, unknown>).subclassSource = 'OTHER'
      },
    )
    expect(current(catalogs, BATTLE, MANEUVERS, 3)).toBeUndefined()
  })
  it('allows only unrelated qualified refs to be pruned from the current ancestor, preserving active path and prose', () => {
    const { catalogs } = makeOptionalDeclarationCatalog('class/class-fighter.json', BATTLE)
    const change = (mode: string) => {
      const changed = structuredClone(catalogs)
      const edit = (feature: unknown) => {
        const row = feature as { name?: string; entries?: unknown[] }
        if (row?.name !== 'Battle Master') return
        if (mode === 'prose') row.entries = row.entries!.slice(1)
        else
          row.entries = row.entries!.filter(
            (entry) =>
              typeof entry !== 'object' ||
              entry === null ||
              !String((entry as Record<string, unknown>).subclassFeature).startsWith(
                mode === 'active' ? 'Maneuver Options|' : 'Student of War|',
              ),
          )
      }
      changed.subclassFeatures.forEach(edit)
      changed.subclassFeatureCandidates?.forEach((rows) => {
        rows.forEach(edit)
      })
      for (const cls of changed.classes ?? [])
        for (const sub of cls.subclasses ?? [])
          for (const ref of sub.subclassFeatureRefs ?? []) edit(ref.feature)
      return changed
    }
    expect(current(change('unrelated'), BATTLE, MANEUVERS, 3)).toBeDefined()
    expect(current(change('active'), BATTLE, MANEUVERS, 3)).toBeUndefined()
    expect(current(change('prose'), BATTLE, MANEUVERS, 3)).toBeUndefined()
  })
  it('keeps direct roots independent of later child loss and of other declarations', () => {
    const owner: OptionalDeclarationOwner = ['class', 'ranger', 'phb']
    const { catalogs } = makeOptionalDeclarationCatalog('class/class-ranger.json', owner, (doc) => {
      const cls = doc.class.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
      cls.classFeatures = (cls.classFeatures as unknown[]).filter(
        (row) => row !== 'Deft Explorer Improvement|Ranger||10|TCE',
      )
      doc.classFeature = doc.classFeature.filter(
        (row) => !(row.name === 'Deft Explorer Improvement' && row.level === 10),
      )
    })
    expect(
      current(catalogs, owner, 'class-feature|deft explorer|ranger|phb|1|tce', 1),
    ).toBeDefined()
    expect(
      current(catalogs, owner, 'class-feature|deft explorer improvement|ranger|phb|10|tce', 10),
    ).toBeUndefined()
    expect(current(catalogs, owner, 'class-feature|favored foe|ranger|phb|1|tce', 1)).toBeDefined()
  })
  it('uses the exact current unattached Paladin class reference without raw recovery', () => {
    const owner: OptionalDeclarationOwner = ['class', 'paladin', 'phb'],
      target = 'class-feature|channel divinity: harness divine power|paladin|phb|3|tce'
    const { catalogs } = makeOptionalDeclarationCatalog('class/class-paladin.json', owner)
    expect(current(catalogs, owner, target, 3)).toBeDefined()
    expect(
      current({ ...catalogs, classFeatureCandidates: new Map() }, owner, target, 3),
    ).toBeUndefined()
    expect(
      current(
        {
          ...catalogs,
          classFeatures: catalogs.classFeatures.filter(
            (row) => getClassFeatureIdentity(row) !== target,
          ),
        },
        owner,
        target,
        3,
      ),
    ).toBeUndefined()
  })
  it('serializes proofs, respects explicit empty catalogs and replaces stale authority with a winning owner', () => {
    const base = makeOptionalDeclarationLayer('class/class-fighter.json')
    const reopen = JSON.parse(JSON.stringify(base)) as typeof base
    const build = (layers: (typeof base)[]) =>
      scopeClassChoiceFeatureCatalogs(
        buildClassChoiceFeatureCatalogs(composeGameDataLayers(layers)),
        getFeatureOwnerKey('Fighter', 'XPHB', 'Battle Master', 'PHB'),
      )
    const good = build([reopen])
    const before = JSON.stringify(reopen)
    expect(current(good, BATTLE, MANEUVERS, 3)).toBeDefined()
    for (const missing of [
      { ...good, classes: [] },
      { ...good, subclassFeatures: [] },
      { ...good, subclassFeatureCandidates: new Map() },
      { ...good, optionalClassFeatureSources: [] },
    ])
      expect(current(missing, BATTLE, MANEUVERS, 3)).toBeUndefined()
    const replacement = structuredClone(base)
    replacement.optionalClassFeatureSources = []
    expect(current(build([base, replacement]), BATTLE, MANEUVERS, 3)).toBeUndefined()
    expect(current(build([replacement, base]), BATTLE, MANEUVERS, 3)).toBeDefined()
    expect(JSON.stringify(reopen)).toBe(before)
  })
  it.each([
    'duplicate raw body',
    'missing proof',
    'false proof',
    'valid other owner',
  ])('does not join a losing copied-owner proof to a winning shared subclass body: %s', (mode) => {
    const base = makeOptionalDeclarationLayer('class/class-fighter.json')
    const overlay = makeOptionalDeclarationLayer(
      'class/class-fighter.json',
      (doc) => {
        doc.class = doc.class.filter((row) => row.source === 'PHB')
        doc.subclass = doc.subclass.filter((row) => row.classSource === 'PHB')
        if (mode === 'duplicate raw body')
          doc.subclassFeature.push(
            structuredClone(doc.subclassFeature.find((row) => row.name === 'Maneuver Options')!),
          )
      },
      'fixture:winning-shared-body:' + mode,
    )
    if (mode === 'missing proof') overlay.optionalClassFeatureSources = []
    if (mode === 'false proof')
      overlay.optionalClassFeatureSources = overlay.optionalClassFeatureSources?.map((row) => ({
        ...row,
        verified: false,
      }))
    const build = (layers: (typeof base)[]) =>
      scopeClassChoiceFeatureCatalogs(
        buildClassChoiceFeatureCatalogs(composeGameDataLayers(layers)),
        getFeatureOwnerKey('Fighter', 'XPHB', 'Battle Master', 'PHB'),
      )
    expect(current(build([base]), BATTLE, MANEUVERS, 3)).toBeDefined()
    expect(current(build([base, overlay]), BATTLE, MANEUVERS, 3)).toBeUndefined()
    expect(current(build([base, overlay, base]), BATTLE, MANEUVERS, 3)).toBeDefined()
    const unrelated = makeOptionalDeclarationLayer('class/class-wizard.json')
    expect(current(build([base, unrelated]), BATTLE, MANEUVERS, 3)).toBeDefined()
  })
  it('preserves source-local copy materialization when a later unrelated owner changes only its metadata', () => {
    const base = makeOptionalDeclarationLayer('class/class-fighter.json')
    const overlay = makeOptionalDeclarationLayer(
      'class/class-fighter.json',
      (doc) => {
        doc.class = doc.class.filter((row) => row.source === 'PHB')
        doc.subclass = doc.subclass.filter((row) => row.classSource === 'PHB')
        doc.subclass.find((row) => row.name === 'Battle Master')!.page = 999
        doc.classFeature = []
        doc.subclassFeature = []
      },
      'fixture:source-local-other-owner',
    )
    const data = composeGameDataLayers([base, overlay])
    const scoped = scopeClassChoiceFeatureCatalogs(
      buildClassChoiceFeatureCatalogs(data),
      getFeatureOwnerKey('Fighter', 'XPHB', 'Battle Master', 'PHB'),
    )
    expect(current(scoped, BATTLE, MANEUVERS, 3)).toBeDefined()
    expect(
      data.classes
        .find((row) => row.source === 'XPHB')!
        .subclasses!.find((row) => row.name === 'Battle Master')!.page,
    ).toBe(73)
    expect(
      data.classes
        .find((row) => row.source === 'PHB')!
        .subclasses!.find((row) => row.name === 'Battle Master')!.page,
    ).toBe(999)
  })
  it('retains unrelated nested class refs which the actual filtering producer never removes', () => {
    const owner: OptionalDeclarationOwner = ['class', 'paladin', 'phb']
    const target = 'class-feature|channel divinity: harness divine power|paladin|phb|3|tce'
    const { catalogs, data } = makeOptionalDeclarationCatalog('class/class-paladin.json', owner)
    const changed = structuredClone(catalogs)
    const edit = (feature: unknown) => {
      const row = feature as { name?: string; entries?: unknown[] }
      if (row?.name !== 'Sacred Oath') return
      row.entries = row.entries!.filter(
        (entry) =>
          !entry ||
          typeof entry !== 'object' ||
          (entry as Record<string, unknown>).classFeature !== 'Channel Divinity|Paladin||3',
      )
    }
    changed.classFeatures.forEach(edit)
    changed.classFeatureCandidates?.forEach((rows) => {
      rows.forEach(edit)
    })
    for (const cls of changed.classes ?? [])
      for (const ref of cls.classFeatureRefs ?? []) edit(ref.feature)
    expect(current(changed, owner, target, 3)).toBeUndefined()
    expect(current(catalogs, owner, target, 3)).toBeDefined()
    const filters = { suppressedKeys: new Set(['channel divinity|phb']) }
    const filtered = buildClassChoiceFeatureCatalogs({
      ...data,
      classes: DataFilter.filterClasses(data.classes, filters),
      classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filters),
    })
    expect(current(filtered, owner, target, 3)).toBeDefined()
  })
})
