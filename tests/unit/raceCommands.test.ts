import { describe, expect, test } from 'vitest'
import { parseRaces } from '@/lib/5etools/parsers/races'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const resolveNoChoices = () => []

describe('race commands', () => {
  test('version selection replaces parent mechanics atomically and returning to the base restores them once', () => {
    const race = (
      parseRaces({
        race: [
          {
            name: 'Test Race',
            source: 'PHB',
            speed: 30,
            ability: [{ dex: 2 }],
            darkvision: 60,
            resist: ['fire'],
            skillProficiencies: [{ perception: true }],
            feats: [{ any: 1 }],
            additionalSpells: [{ innate: { 1: ['light'] } }],
            _versions: [
              {
                name: 'Test Race; Changed',
                source: 'HB',
                darkvision: null,
                resist: null,
                skillProficiencies: null,
                feats: null,
                additionalSpells: null,
              },
            ],
          },
        ],
      }) as Race5e[]
    )[0]
    const original = makeCharacterFixture({ race: '', raceSource: '' })
    const baseResult = applyRaceSelectionCommand(
      original,
      emptyProvenance(),
      race,
      undefined,
      0,
      resolveNoChoices,
    )
    const baseCharacter = { ...original, ...baseResult.characterPatch }
    const changed = applySubraceSelectionCommand(
      baseCharacter,
      baseResult.provenanceUpdate,
      race,
      race.subraces?.[0],
      resolveNoChoices,
    )
    expect(changed.characterPatch).toMatchObject({
      race: 'Test Race',
      raceSource: 'PHB',
      subrace: 'Changed',
      subraceSource: 'HB',
    })
    expect(changed.characterPatch.proficiencies?.skills).not.toContain('perception')
    expect(changed.characterPatch.visions).toBeUndefined()
    expect(changed.characterPatch.damageResistances).toBeUndefined()
    expect(changed.provenanceUpdate.abilityBonuses).toEqual([
      expect.objectContaining({
        ability: 'dexterity',
        value: 2,
        sourceTag: expect.objectContaining({ sourceType: 'subrace', sourceName: 'Changed' }),
      }),
    ])
    expect(changed.provenanceUpdate.proficiencies.skills.perception).toBeUndefined()
    expect(changed.provenanceUpdate.choices.filter((choice) => choice.domain === 'feats')).toEqual(
      [],
    )
    expect(changed.provenanceUpdate.spells.light).toBeUndefined()
    const restored = applySubraceSelectionCommand(
      { ...baseCharacter, ...changed.characterPatch },
      changed.provenanceUpdate,
      race,
      undefined,
      resolveNoChoices,
    )
    expect(restored.characterPatch.proficiencies?.skills).toContain('perception')
    expect(restored.characterPatch.visions).toEqual([{ type: 'darkvision', range: 60 }])
    expect(restored.characterPatch.damageResistances).toEqual(['fire'])
    expect(restored.provenanceUpdate.abilityBonuses).toEqual([
      expect.objectContaining({
        ability: 'dexterity',
        value: 2,
        sourceTag: expect.objectContaining({ sourceType: 'race' }),
      }),
    ])
  })

  test('applies identity, proficiencies, and traits in one result', () => {
    const character = makeCharacterFixture({ race: '', raceSource: '' })
    const race = {
      name: 'Elf',
      source: 'PHB',
      skillProficiencies: [{ perception: true }],
      languageProficiencies: [{ elvish: true }],
      darkvision: 60,
      resist: ['fire'],
      speed: 35,
    } as Race5e

    const result = applyRaceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      undefined,
      0,
      resolveNoChoices,
    )

    expect(result.characterPatch.race).toBe('Elf')
    expect(result.characterPatch.raceSource).toBe('PHB')
    expect(result.characterPatch.proficiencies?.skills).toContain('perception')
    expect(result.characterPatch.proficiencies?.languages).toContain('elvish')
    expect(result.characterPatch.visions).toContainEqual({ type: 'darkvision', range: 60 })
    expect(result.characterPatch.damageResistances).toEqual(['fire'])
    expect(result.characterPatch.movement).toEqual({
      speeds: { walk: 35 },
      source: { kind: 'race', name: 'Elf', source: 'PHB' },
    })
  })

  test('subrace selection owns identity and resets race ASI choices', () => {
    const character = makeCharacterFixture({
      race: 'Dwarf',
      raceSource: 'PHB',
      raceAsiChoices: [['strength']],
    })
    const race = { name: 'Dwarf', source: 'PHB', darkvision: 60, speed: 25 } as Race5e
    const subrace = {
      name: 'Duergar',
      source: 'SCAG',
      darkvision: 120,
      speed: { walk: 30, climb: 30 },
    } as Race5e

    const result = applySubraceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      subrace,
      resolveNoChoices,
    )

    expect(result.characterPatch.subrace).toBe('Duergar')
    expect(result.characterPatch.subraceSource).toBe('SCAG')
    expect(result.characterPatch.raceAsiChoices).toEqual([])
    expect(result.characterPatch.visions).toContainEqual({ type: 'darkvision', range: 120 })
    expect(result.characterPatch.movement).toMatchObject({
      speeds: { walk: 30, climb: 30 },
      source: { name: 'Duergar', source: 'SCAG' },
    })
  })

  test('allows a 2024 lineage selection before unrelated background choices are complete', () => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      race: 'Elf',
      raceSource: 'XPHB',
      background: 'Sage',
      backgroundSource: 'XPHB',
    })
    const race = { name: 'Elf', source: 'XPHB' } as Race5e
    const lineage = {
      name: 'Drow Lineage',
      source: 'XPHB',
      ability: [{ dex: 2 }],
      feats: [{ any: 1 }],
      languageProficiencies: [{ elvish: true }],
    } as Race5e

    const result = applySubraceSelectionCommand(
      character,
      emptyProvenance(),
      race,
      lineage,
      resolveNoChoices,
    )

    expect(result.characterPatch.subrace).toBe('Drow Lineage')
    expect(result.provenanceUpdate.abilityBonuses).toEqual([])
    expect(result.provenanceUpdate.feats).toEqual({})
    expect(result.provenanceUpdate.proficiencies.languages.elvish).toBeUndefined()
  })

  test('race changes replace only racial base movement and preserve manual settings', () => {
    const character = makeCharacterFixture({
      race: 'Dwarf',
      raceSource: 'PHB',
      movement: {
        speeds: { walk: 25 },
        source: { kind: 'race', name: 'Dwarf', source: 'PHB' },
      },
      movementAdjustments: [
        {
          id: 'training',
          label: 'Training',
          mode: 'walk',
          amount: 5,
          sourceType: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      movementOverrides: { swim: 20 },
    })

    const result = applyRaceSelectionCommand(
      character,
      emptyProvenance(),
      { name: 'Elf', source: 'PHB', speed: 30 } as Race5e,
      undefined,
      0,
      resolveNoChoices,
    )
    const updated = { ...character, ...result.characterPatch }

    expect(updated.movement).toMatchObject({
      speeds: { walk: 30 },
      source: { name: 'Elf', source: 'PHB' },
    })
    expect(updated.movementAdjustments).toEqual(character.movementAdjustments)
    expect(updated.movementOverrides).toEqual({ swim: 20 })
  })

  test('changing race retracts options owned by its feat choice', () => {
    const choiceId = 'variant-human-feat'
    const character = makeCharacterFixture({
      race: 'Variant Human',
      raceSource: 'PHB',
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
          sourceTag: makeSourceTag('race', 'Variant Human', 'placeholder', 'PHB'),
          chooseCount: 1,
          optionPool: [],
          selected: ['Skill Expert'],
          selectedRefs: [{ name: 'Skill Expert', source: 'TCE', options: { skills: ['Arcana'] } }],
          status: 'resolved' as const,
        },
      ],
    }

    const result = applyRaceSelectionCommand(
      character,
      ledger,
      { name: 'Elf', source: 'PHB' } as Race5e,
      undefined,
      0,
      resolveNoChoices,
    )

    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.characterPatch.proficiencies?.expertise).toEqual([])
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })

  test.each([
    false,
    true,
  ])("race removal retains another printing's feat follow-up (overlap: %s)", (overlap) => {
    const choice = (id: string, source: string) => ({
      id,
      domain: 'feats' as const,
      sourceTag: makeSourceTag('race', 'Parent', 'placeholder', source),
      chooseCount: 1,
      optionPool: [],
      selected: ['Skill Expert'],
      selectedRefs: [{ name: 'Skill Expert', source: 'TCE', options: { skills: ['Arcana'] } }],
      status: 'resolved' as const,
    })
    const foreign = choice('foreign-feat', 'OTHER')
    const selected = choice('selected-feat', 'PHB')
    const featTag = (id: string) => ({
      ...makeSourceTag('feat', 'Skill Expert', 'choice', 'TCE'),
      grantVariant: `choice:${id}`,
    })
    const character = makeCharacterFixture({ race: 'Parent', raceSource: 'PHB' })
    character.proficiencies.skills = ['arcana']
    const ledger = emptyProvenance()
    ledger.choices = overlap ? [foreign, selected] : [foreign]
    ledger.proficiencies.skills.arcana = overlap
      ? [featTag(foreign.id), featTag(selected.id)]
      : [featTag(foreign.id)]
    const before = structuredClone(ledger)
    const result = applyRaceSelectionCommand(
      character,
      ledger,
      { name: 'Replacement', source: 'PHB' } as Race5e,
      undefined,
      0,
      resolveNoChoices,
    )
    expect(result.characterPatch.proficiencies!.skills).toEqual(['arcana'])
    expect(result.provenanceUpdate.choices.filter((record) => record.domain === 'feats')).toEqual([
      foreign,
    ])
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toEqual([featTag(foreign.id)])
    expect(ledger).toEqual(before)
  })
})
