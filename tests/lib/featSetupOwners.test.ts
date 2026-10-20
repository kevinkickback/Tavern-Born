import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  featSetupOwnerTarget,
  getFeatSetupFocusKey,
  getFeatSetupOwners,
  hasExpertiseChoice,
} from '@/lib/character/featSetupOwners'
import type { Feat5e } from '@/types/5etools'
import { makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'

const feats = JSON.parse(
  readFileSync('tests/fixtures/expertiseFeatSources.json', 'utf8'),
) as Feat5e[]
test('actual Expertise choice declarations distinguish fixed grants, selected printings and all existing setup owners without writes', () => {
  const f = makeClassProficiencyFixture()
  const feat = { id: 'skill-expert', name: 'Skill Expert', source: 'TCE', description: '' }
  f.character.feats = [{ ...feat, options: {} }]
  f.character.specialFeats = [{ ...feat, id: 'bonus' }]
  f.character.classFeatChoices = [
    {
      id: 'class-feat',
      className: 'Rogue',
      classSource: 'PHB',
      progressionName: 'Training',
      categories: [],
      feats: [feat],
    },
  ]
  f.character.provenance!.choices.push({
    id: 'race-feat',
    domain: 'feats',
    sourceTag: { sourceType: 'race', sourceName: 'Human', grantType: 'choice', label: 'Human' },
    chooseCount: 1,
    optionPool: [],
    selected: ['Skill Expert'],
    selectedRefs: [{ name: 'Skill Expert', source: 'TCE' }],
    status: 'resolved',
  })
  f.character.provenance!.feats['skill expert'] = [
    {
      sourceType: 'background',
      sourceName: 'Scholar',
      grantType: 'fixed',
      grantSource: 'TCE',
      label: 'Scholar',
    },
  ]
  const before = JSON.stringify(f.character)
  const owners = getFeatSetupOwners(f.character, feats)
  expect(owners).toHaveLength(5)
  expect(new Set(owners.map((row) => row.focusKey)).size).toBe(5)
  for (const owner of owners) {
    const url = new URL(featSetupOwnerTarget(owner), 'https://local.invalid')
    expect(url.searchParams.get('featOwner')).toBe(owner.focusKey)
    expect(url.searchParams.get('source')).toBe('TCE')
    expect(hasExpertiseChoice(owner.data!)).toBe(true)
    expect(owner.options?.expertiseSkill).toBeUndefined()
  }
  expect(hasExpertiseChoice(feats.find((row) => row.name === 'Aberrant Anatomy')!)).toBe(false)
  expect(getFeatSetupOwners(f.character, []).every((row) => row.data === undefined)).toBe(true)
  expect(JSON.stringify(f.character)).toBe(before)
  const stale = owners.find((row) => row.view === 'bonus')!.focusKey
  const removed = { ...f.character, specialFeats: [] }
  expect(getFeatSetupOwners(removed, feats).some((row) => row.focusKey === stale)).toBe(false)
  expect(getFeatSetupOwners(removed, feats)).toHaveLength(4)
})

test('unqualified, duplicate, unselected and foreign-source owner references cannot borrow setup authority', () => {
  const f = makeClassProficiencyFixture()
  f.character.feats = [{ id: 'one', name: 'Skill Expert', source: 'OTHER', description: '' }]
  expect(getFeatSetupOwners(f.character, feats)[0].data).toBeUndefined()
  expect(getFeatSetupOwners({ ...f.character, feats: [] }, feats)).toEqual([])
  expect(getFeatSetupFocusKey({ name: 'Skill Expert', selectionKind: 'ordinary' })).toBeUndefined()
  const foreign = getFeatSetupFocusKey({
    name: 'Skill Expert',
    source: 'OTHER',
    selectionKind: 'ordinary',
  })
  expect(foreign).not.toBe(
    getFeatSetupFocusKey({ name: 'Skill Expert', source: 'TCE', selectionKind: 'ordinary' }),
  )
  expect(
    getFeatSetupOwners(
      { ...f.character, feats: [...f.character.feats, ...f.character.feats] },
      feats,
    ),
  ).toEqual([])
})
