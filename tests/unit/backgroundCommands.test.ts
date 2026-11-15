import { describe, expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  applyBackgroundAbilityChoicesCommand,
  applyBackgroundSelectionCommand,
} from '@/lib/character/commands/backgroundCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { resolveFeatChoiceCommand } from '@/lib/character/commands/featCommands'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { Background5e, Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('background commands', () => {
  test('reapplying a refreshed printing replaces its fixed grants and keeps independent grants', () => {
    const before = {
      name: 'Acolyte',
      source: 'XPHB',
      skillProficiencies: [{ insight: true, religion: true }],
      feats: [{ 'magic initiate|xphb': true }],
    } as Background5e
    const next = {
      ...before,
      skillProficiencies: [{ stealth: true }],
      feats: [{ 'alert|xphb': true }],
      ability: [{ choose: { weighted: { from: ['dex', 'con', 'int'], weights: [2, 1] } } }],
    }
    const character = makeCharacterFixture({ originSystem: '2024', background: '', equipment: [] })
    const lookup = buildItemLookup([])
    let current = applyCharacterCommandResult(
      character,
      applyBackgroundSelectionCommand(character, character.provenance, before, [], lookup),
    )
    const independent = makeSourceTag('class', 'Cleric', 'fixed', 'XPHB')
    current = {
      ...current,
      provenance: addGrant(current.provenance, 'skills', 'insight', independent),
    }
    const refreshed = applyCharacterCommandResult(
      current,
      applyBackgroundSelectionCommand(current, current.provenance, next, [], lookup),
    )
    expect(refreshed.proficiencies.skills).toEqual(['insight', 'stealth'])
    expect(refreshed.provenance.proficiencies.skills.insight).toEqual([independent])
    expect(refreshed.provenance.feats.alert).toHaveLength(1)
    expect(refreshed.provenance.feats['magic initiate']).toBeUndefined()
    const setup = applyBackgroundAbilityChoicesCommand(refreshed, refreshed.provenance, next, 0, [
      'intelligence',
      'wisdom',
    ])
    expect(setup.characterPatch.backgroundAsiChoices).toEqual(['intelligence', 'wisdom'])
    expect(setup.provenanceUpdate.abilityBonuses).toContainEqual(
      expect.objectContaining({ ability: 'intelligence', value: 2 }),
    )
    expect(setup.provenanceUpdate.abilityBonuses).not.toContainEqual(
      expect.objectContaining({ ability: 'wisdom' }),
    )
  })

  test('a current fixed origin feat supersedes an obsolete fallback choice from the same printing', () => {
    const background = { name: 'Acolyte', source: 'XPHB' } as Background5e
    const blank = makeCharacterFixture({ originSystem: '2024', background: '' })
    const lookup = buildItemLookup([])
    const started = applyCharacterCommandResult(
      blank,
      applyBackgroundSelectionCommand(blank, blank.provenance, background, [], lookup),
    )
    const fallback = started.provenance.choices.find((choice) => choice.domain === 'feats')!
    const chosen = applyCharacterCommandResult(
      started,
      resolveFeatChoiceCommand(started, started.provenance, fallback.id, {
        name: 'Alert',
        source: 'XPHB',
      }),
    )
    const refreshed = applyBackgroundSelectionCommand(
      chosen,
      chosen.provenance,
      { ...background, feats: [{ 'magic initiate|xphb': true }] },
      [],
      lookup,
    )
    expect(refreshed.provenanceUpdate.feats['magic initiate']).toHaveLength(1)
    expect(refreshed.provenanceUpdate.feats.alert).toBeUndefined()
    expect(refreshed.provenanceUpdate.choices.some(({ id }) => id === fallback.id)).toBe(false)
  })

  test('rejects a withdrawn saved package instead of applying a different branch', () => {
    const background = {
      name: 'Acolyte',
      source: 'PHB',
      startingEquipment: [{ a: [{ value: 500 }] }],
    } as Background5e
    const actor = makeCharacterFixture({
      background: 'Acolyte',
      backgroundSource: 'PHB',
      backgroundEquipmentChoices: ['b'],
    })
    expect(() =>
      applyBackgroundSelectionCommand(
        actor,
        actor.provenance,
        background,
        actor.backgroundEquipmentChoices!,
        buildItemLookup([]),
      ),
    ).toThrow(/current Background starting equipment package/)
  })

  test('reapplies a saved fixed package without substituting a selectable or missing branch', () => {
    const background = {
      name: 'Acolyte',
      source: 'PHB',
      startingEquipment: [{ _: [{ value: 500 }] }],
    } as Background5e
    const actor = makeCharacterFixture({
      background: 'Acolyte',
      backgroundSource: 'PHB',
      backgroundEquipmentChoices: ['_'],
    })
    const apply = (startingEquipment: Background5e['startingEquipment']) =>
      applyBackgroundSelectionCommand(
        actor,
        actor.provenance,
        { ...background, startingEquipment },
        actor.backgroundEquipmentChoices!,
        buildItemLookup([]),
      )

    expect(apply(background.startingEquipment).characterPatch).toMatchObject({
      backgroundEquipmentChoices: ['_'],
      currency: { gp: 5 },
    })
    expect(() => apply([{ a: [{ value: 500 }] }])).toThrow(/current Background starting equipment/)
    expect(() => apply([{}])).toThrow(/current Background starting equipment/)
    expect(() => apply([])).toThrow(/current Background starting equipment/)
  })

  test('applies identity, proficiencies, equipment, and currency in one result', () => {
    const pouch = { name: 'Pouch', source: 'PHB', type: 'G' } as Item5e
    const background = {
      name: 'Acolyte',
      source: 'PHB',
      skillProficiencies: [{ insight: true }],
      languageProficiencies: [{ celestial: true }],
      startingEquipment: [
        {
          a: ['Pouch|PHB', { value: 250 }],
        },
      ],
    } as Background5e
    const character = makeCharacterFixture({ background: '', backgroundSource: '' })

    const result = applyBackgroundSelectionCommand(
      character,
      emptyProvenance(),
      background,
      ['a'],
      buildItemLookup([pouch]),
    )

    expect(result.characterPatch.background).toBe('Acolyte')
    expect(result.characterPatch.backgroundSource).toBe('PHB')
    expect(result.characterPatch.proficiencies?.skills).toContain('insight')
    expect(result.characterPatch.proficiencies?.languages).toContain('celestial')
    expect(result.characterPatch.equipment?.map((item) => item.name)).toContain('Pouch')
    expect(result.characterPatch.backgroundEquipmentChoices).toEqual(['a'])
    expect(result.characterPatch.currency?.gp).toBe(2)
    expect(result.characterPatch.currency?.sp).toBe(5)
  })

  test('changing background retracts options owned by its feat choice', () => {
    const choiceId = 'sage-feat'
    const character = makeCharacterFixture({
      background: 'Sage',
      backgroundSource: 'PHB',
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: ['arcana'],
        expertise: [],
        languages: [],
        savingThrows: [],
      },
    })
    const ledger = {
      ...emptyProvenance(),
      proficiencies: {
        ...emptyProvenance().proficiencies,
        skills: {
          arcana: [
            {
              ...makeSourceTag('feat', 'Skill Expert', 'choice', 'TCE'),
              grantVariant: `choice:${choiceId}`,
            },
          ],
        },
      },
      choices: [
        {
          id: choiceId,
          domain: 'feats' as const,
          sourceTag: makeSourceTag('background', 'Sage', 'placeholder', 'PHB'),
          chooseCount: 1,
          optionPool: [],
          selected: ['Skill Expert'],
          selectedRefs: [{ name: 'Skill Expert', source: 'TCE', options: { skills: ['Arcana'] } }],
          status: 'resolved' as const,
        },
      ],
    }

    const result = applyBackgroundSelectionCommand(
      character,
      ledger,
      { name: 'Soldier', source: 'PHB' } as Background5e,
      [],
      buildItemLookup([]),
    )

    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.characterPatch.proficiencies?.expertise).toEqual([])
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })
})
