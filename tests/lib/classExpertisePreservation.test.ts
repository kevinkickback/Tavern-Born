import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { expertiseOption, makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'

test('mixed actual class and subclass feature owners survive proficiency add/edit/no-op/clear and retained-source recovery', () => {
  const f = makeClassProficiencyFixture('Wizard', 'XPHB', 2)
  const original = characterPersistenceSchema.parse(
    JSON.parse(readFileSync('tests/fixtures/full-coverage-character-2024.tbc', 'utf8')),
  )
  const choice = f.choices[0]
  const authority = { classes: f.data.classes, catalogs: f.catalogs }
  const apply = (character: Character, names: string[]) => {
    const result = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      choice,
      names.map(expertiseOption),
      authority,
    )
    return characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  const base = apply(original, [])
  expect(base.features).toEqual(original.features)
  expect(base.provenance.features).toEqual(original.provenance.features)
  const features = base.features,
    owners = base.provenance.features
  expect(owners["commander's strike"].some((tag) => tag.sourceType === 'subclass')).toBe(true)
  const preserve = (character: Character) => {
    expect(character.features).toEqual(features)
    expect(character.provenance.features).toEqual(owners)
    expect(character.feats).toEqual(base.feats)
    expect(character.classFeatChoices).toEqual(base.classFeatChoices)
    for (const name of base.proficiencies.expertise)
      expect(character.provenance.proficiencies.expertise?.[name]).toEqual(
        base.provenance.proficiencies.expertise?.[name],
      )
  }
  // A stale descriptor kind is canonicalized by the reserved ID; it must never create a feat mirror.
  const forged = applyClassChoiceSelectionWithGrantsCommand(
    base,
    base.provenance,
    { ...choice, kind: 'feat' },
    [expertiseOption('History')],
    authority,
  )
  let current = characterPersistenceSchema.parse({
    ...base,
    ...forged.characterPatch,
    provenance: forged.provenanceUpdate,
  })
  expect(current.classChoiceSelections?.find((row) => row.choiceId === choice.id)?.kind).toBe(
    'proficiency',
  )
  preserve(current)
  current = apply(current, ['Nature'])
  preserve(current)
  const noop = applyClassChoiceSelectionWithGrantsCommand(
    current,
    current.provenance,
    { ...choice, kind: 'feat' },
    [expertiseOption('Nature')],
    authority,
  )
  expect(noop.characterPatch).toEqual({})
  expect(noop.provenanceUpdate).toBe(current.provenance)
  const cleared = apply(current, [])
  preserve(cleared)
  expect(cleared.proficiencies.expertise).toEqual(base.proficiencies.expertise)
  const saved = apply(cleared, ['History'])
  const suspended = refreshClassProficiencyState(saved, f.data.classes, {
    ...f.catalogs,
    classFeatures: [],
    classFeatureCandidates: new Map(),
  })
  const recovery = retainSavedFeatureOptionsCommand(suspended, suspended.provenance, choice.id, [])
  const removed = characterPersistenceSchema.parse({
    ...suspended,
    ...recovery.characterPatch,
    provenance: recovery.provenanceUpdate,
  })
  preserve(removed)
  expect(removed.proficiencies.expertise).toEqual(base.proficiencies.expertise)

  const supplied = addGrant(
    base.provenance,
    'features',
    'precision attack',
    makeSourceTag('manual', 'Additional ledger owner', 'choice'),
  )
  const result = applyClassChoiceSelectionWithGrantsCommand(
    base,
    supplied,
    choice,
    [expertiseOption('History')],
    authority,
  )
  expect(result.provenanceUpdate.features).toBe(supplied.features)
  expect(result.characterPatch.features).toBe(base.features)
  const pending = apply(base, ['History'])
  const recoveryLedger = addGrant(
    pending.provenance,
    'features',
    'precision attack',
    makeSourceTag('manual', 'Additional recovery owner', 'choice'),
  )
  const recovered = retainSavedFeatureOptionsCommand(pending, recoveryLedger, choice.id, [])
  expect(recovered.provenanceUpdate.features).toBe(recoveryLedger.features)
  expect(recovered.characterPatch.features).toBe(pending.features)
})
