import { describe, expect, test } from 'vitest'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { emptyProvenance } from '@/lib/character/createCharacter'
import { resolveFixedFeatGrant } from '@/lib/featGrants'
import {
  applyFeatGrant,
  applyFeatGrantBlocks,
} from '@/lib/provenance/applyFeatAndOptionalFeatureGrants'
import { removeGrantsBySourceRef } from '@/lib/provenance/ledger'
import type { Background5e, Feat5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const reopen = (character: Character) =>
  characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character))) as Character

const noChoices = () => []

describe('fixed feat granting owner and target identity', () => {
  test('fixed self-grants record their target while manual selections keep their existing owner', () => {
    expect(applyFeatGrant(emptyProvenance(), 'Alert', 'PHB', false).feats.alert).toEqual([
      expect.objectContaining({
        sourceType: 'feat',
        sourceRef: 'PHB',
        grantSource: 'PHB',
        grantType: 'fixed',
      }),
    ])
    expect(applyFeatGrant(emptyProvenance(), 'Alert', 'PHB', true).feats.alert).toEqual([
      {
        sourceType: 'manual',
        sourceName: 'User Choice',
        sourceRef: 'PHB',
        grantType: 'choice',
        label: 'User Choice',
      },
    ])
  })

  test('unqualified upstream feat references stay unresolved without borrowing owner or unique catalog printing', () => {
    const ledger = applyFeatGrantBlocks(
      emptyProvenance(),
      [{ Alert: true }],
      'race',
      'Gifted',
      'HB',
    )
    const tag = ledger.feats.alert[0]
    expect(tag).toMatchObject({ sourceRef: 'HB', grantSource: '' })
    const resolved = resolveFixedFeatGrant(
      [{ name: 'Alert', source: 'HB' } as Feat5e],
      'alert',
      tag,
    )
    expect(resolved).toMatchObject({ feat: undefined, source: '', resolution: 'missing' })
  })

  test('keeps the granting race printing and resolves the exact different feat printing after reopening', () => {
    const [race] = parseRaces({
      race: [{ name: 'Gifted', source: 'HB', feats: [{ 'Alert|PHB': true }] }],
    }) as Race5e[]
    const initial = makeCharacterFixture({ race: '', raceSource: undefined })
    const character = reopen(
      applyCharacterCommandResult(
        initial,
        applyRaceSelectionCommand(initial, emptyProvenance(), race, undefined, 0, noChoices),
      ),
    )
    const tag = character.provenance.feats.alert[0]
    expect(tag).toMatchObject({
      sourceType: 'race',
      sourceName: 'Gifted',
      sourceRef: 'HB',
      grantSource: 'PHB',
    })
    const exact = { name: 'Alert', source: 'PHB' } as Feat5e
    expect(resolveFixedFeatGrant([{ ...exact, source: 'HB' }, exact], 'alert', tag).feat).toBe(
      exact,
    )
    expect(
      removeGrantsBySourceRef(character.provenance, 'race', 'Gifted', 'HB').feats.alert,
    ).toBeUndefined()
  })

  test('keeps the background owner distinct from its fixed feat target', () => {
    const background = {
      name: 'Student',
      source: 'HB',
      feats: [{ 'Training|PHB': true }],
    } as Background5e
    const initial = makeCharacterFixture({
      originSystem: '2024',
      background: '',
      backgroundSource: undefined,
    })
    const character = reopen(
      applyCharacterCommandResult(
        initial,
        applyBackgroundSelectionCommand(initial, emptyProvenance(), background, [], new Map()),
      ),
    )
    expect(character.provenance.feats.training[0]).toMatchObject({
      sourceType: 'background',
      sourceRef: 'HB',
      grantSource: 'PHB',
    })
  })

  test('keeps different target printings from one owner distinct and reapplication idempotent', () => {
    const blocks = [{ 'Alert|PHB': true }, { 'Alert|XPHB': true }]
    const ledger = applyFeatGrantBlocks(emptyProvenance(), blocks, 'background', 'Student', 'HB')
    expect(ledger.feats.alert).toHaveLength(2)
    expect(ledger.feats.alert.map((tag) => tag.sourceRef)).toEqual(['HB', 'HB'])
    expect(ledger.feats.alert).toEqual([
      expect.objectContaining({ grantSource: 'PHB' }),
      expect.objectContaining({ grantSource: 'XPHB' }),
    ])
    expect(applyFeatGrantBlocks(ledger, blocks, 'background', 'Student', 'HB')).toEqual(ledger)
  })

  test('retracts fixed setup only after the final legitimate owner of the target disappears', () => {
    const [race, plain] = parseRaces({
      race: [
        {
          name: 'Gifted',
          source: 'HB',
          feats: [{ 'Training|PHB': true }],
          subraces: [{ name: 'Child', source: 'OTHER', feats: [{ 'Training|PHB': true }] }],
        },
        { name: 'Plain', source: 'HB' },
      ],
    }) as Race5e[]
    let character = makeCharacterFixture({ race: '', background: '' })
    const child = race.subraces?.[0]
    character = applyCharacterCommandResult(
      character,
      applyRaceSelectionCommand(character, character.provenance, race, child, 0, noChoices),
    )
    character = reopen(
      applyCharacterCommandResult(
        character,
        commitFeatOptionsCommand(
          character,
          character.provenance,
          { name: 'Training', source: 'PHB', fixedGrant: true },
          { skills: ['Arcana'] },
          [],
        ),
      ),
    )
    character = reopen(
      applyCharacterCommandResult(
        character,
        applySubraceSelectionCommand(character, character.provenance, race, undefined, noChoices, {
          previousSubrace: child,
        }),
      ),
    )
    expect(character.fixedFeatOptions).toEqual({ 'training|phb|': { skills: ['Arcana'] } })
    expect(character.proficiencies.skills).toContain('arcana')
    expect(character.provenance.feats.training).toEqual([
      expect.objectContaining({ sourceType: 'race', sourceRef: 'HB', grantSource: 'PHB' }),
    ])
    character = reopen(
      applyCharacterCommandResult(
        character,
        applyRaceSelectionCommand(character, character.provenance, plain, undefined, 0, noChoices),
      ),
    )
    expect(character.fixedFeatOptions).toEqual({})
    expect(character.proficiencies.skills).not.toContain('arcana')
  })

  test('rejects a current-format fixed grant without a separate target source', () => {
    const character = makeCharacterFixture()
    character.provenance = {
      ...character.provenance,
      feats: {
        alert: [
          {
            sourceType: 'race',
            sourceName: 'Human',
            sourceRef: 'PHB',
            grantType: 'fixed',
            label: 'Human',
          },
        ],
      },
    }
    const result = characterPersistenceSchema.safeParse(character)
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['provenance', 'feats', 'alert', 0, 'grantSource'] }),
        ]),
      )
  })

  test('same-printing fixed setup and edits preserve a repeatable chosen copy through final owner removal', () => {
    const [race, plain] = parseRaces({
      race: [
        { name: 'Gifted', source: 'HB', feats: [{ 'Training|PHB': true }] },
        { name: 'Plain', source: 'HB' },
      ],
    }) as Race5e[]
    const training = { name: 'Training', source: 'PHB', repeatable: true } as Feat5e
    let character = makeCharacterFixture({ race: '', background: '' })
    character = applyCharacterCommandResult(
      character,
      applyRaceSelectionCommand(character, character.provenance, race, undefined, 0, noChoices),
    )
    character = applyCharacterCommandResult(
      character,
      replaceFeatSelectionsCommand(character, character.provenance, [training]),
    )
    character = reopen(
      applyCharacterCommandResult(
        character,
        commitFeatOptionsCommand(character, character.provenance, training, { skills: ['Arcana'] }),
      ),
    )
    const fixed = { ...training, fixedGrant: true }
    character = reopen(
      applyCharacterCommandResult(
        character,
        commitFeatOptionsCommand(character, character.provenance, fixed, { skills: ['History'] }),
      ),
    )
    expect(character.feats[0].options).toEqual({ skills: ['Arcana'] })
    character = reopen(
      applyCharacterCommandResult(
        character,
        editFeatOptionsCommand(
          character,
          character.provenance,
          fixed,
          { skills: ['History'] },
          { skills: ['Nature'] },
        ),
      ),
    )
    expect(character.feats[0].options).toEqual({ skills: ['Arcana'] })
    expect(character.proficiencies.skills).toEqual(['arcana', 'nature'])
    character = reopen(
      applyCharacterCommandResult(
        character,
        applyRaceSelectionCommand(character, character.provenance, plain, undefined, 0, noChoices),
      ),
    )
    expect(character.feats[0].options).toEqual({ skills: ['Arcana'] })
    expect(character.fixedFeatOptions).toEqual({})
    expect(character.proficiencies.skills).toEqual(['arcana'])
  })

  test('editing and removing a chosen copy retains fixed same-printing setup ownership and bonuses', () => {
    const [race] = parseRaces({
      race: [{ name: 'Gifted', source: 'HB', feats: [{ 'Training|PHB': true }] }],
    }) as Race5e[]
    const training = { name: 'Training', source: 'PHB', repeatable: true } as Feat5e
    let character = makeCharacterFixture({ race: '', background: '' })
    character = applyCharacterCommandResult(
      character,
      applyRaceSelectionCommand(character, character.provenance, race, undefined, 0, noChoices),
    )
    character = applyCharacterCommandResult(
      character,
      replaceFeatSelectionsCommand(character, character.provenance, [training]),
    )
    const initialChosen = { skills: ['Arcana'], abilityScore: 'Strength' }
    const fixedOptions = { skills: ['History'], abilityScore: 'Wisdom' }
    character = reopen(
      applyCharacterCommandResult(
        character,
        commitFeatOptionsCommand(character, character.provenance, training, initialChosen),
      ),
    )
    character = reopen(
      applyCharacterCommandResult(
        character,
        commitFeatOptionsCommand(
          character,
          character.provenance,
          { ...training, fixedGrant: true },
          fixedOptions,
        ),
      ),
    )
    const chosenOptions = { skills: ['Nature'], abilityScore: 'Constitution' }
    character = reopen(
      applyCharacterCommandResult(
        character,
        editFeatOptionsCommand(
          character,
          character.provenance,
          training,
          initialChosen,
          chosenOptions,
        ),
      ),
    )
    expect(character.provenance.proficiencies.skills.history).toEqual([
      expect.objectContaining({ grantVariant: 'fixed:' }),
    ])
    expect(character.provenance.abilityBonuses).toEqual([
      expect.objectContaining({
        ability: 'wisdom',
        sourceTag: expect.objectContaining({ grantVariant: 'fixed:' }),
      }),
      expect.objectContaining({
        ability: 'constitution',
        sourceTag: expect.objectContaining({ sourceType: 'feat', sourceRef: 'PHB' }),
      }),
    ])
    expect(character.provenance.abilityBonuses[1].sourceTag.grantVariant).toBeUndefined()
    character = reopen(
      applyCharacterCommandResult(
        character,
        replaceFeatSelectionsCommand(character, character.provenance, []),
      ),
    )
    expect(character.provenance.abilityBonuses).toEqual([
      expect.objectContaining({
        ability: 'wisdom',
        sourceTag: expect.objectContaining({ grantVariant: 'fixed:' }),
      }),
    ])
    expect(character.proficiencies.skills).toEqual(['history'])
    expect(character.fixedFeatOptions).toEqual({ 'training|phb|': fixedOptions })
  })
})
