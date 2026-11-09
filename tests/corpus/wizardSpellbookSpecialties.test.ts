// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  type ManagedClassSpellRequest,
  retainEarnedManagedClassSpells,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const variants = [
  ['bundled', 'resources/srd/data'],
  ...(existsSync('data/class/class-wizard.json') ? [['local', 'data']] : []),
] as Array<['bundled' | 'local', string]>

async function load(type: 'bundled' | 'local', root: string) {
  return composeGameDataLayers([
    await new FiveEToolsDataLoader(
      type === 'bundled'
        ? {
            type,
            path: 'srd/core',
            packId: 'tavern-born-srd-core',
            packVersion: '1.0.1',
            isValid: true,
          }
        : { type, path: resolve(root), isValid: true },
      { type, readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')) },
    ).loadAllData(),
  ])
}
const lookups = (data: GameData) => ({
  ...buildGameDataLookups(data),
  classChoiceClasses: data.classes,
  classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
})
const specialty = (actor: Character) =>
  (actor.managedClassSpellChoices ?? []).filter(
    (choice) => choice.slot[1] === 'class-spellbook-specialty',
  )

test.each(variants)(
  'Wizard specialties borrow current spellbook choices in %s data',
  async (type, root) => {
    const data = await load(type, root)
    const current = lookups(data)
    for (const source of ['PHB', 'XPHB'] as const) {
      const revised = source === 'XPHB'
      const entry = { name: 'Wizard', source, levels: 20 }
      const actor = makeCharacterFixture({
        originSystem: revised ? '2024' : '2014',
        allowedSources: [source],
        classProgression: [entry],
        race: '',
        raceSource: '',
      })
      const view = (candidate: Character, supplied = current) =>
        createCharacterCalculationContext(candidate, supplied, current)
      const change = (candidate: Character, ...requests: ManagedClassSpellRequest[]) => {
        const result = setManagedClassSpellChoicesCommand(
          candidate,
          candidate.provenance,
          requests,
          view(candidate).classChoices.spellContext,
        )
        return characterPersistenceSchema.parse(
          JSON.parse(
            JSON.stringify({
              ...candidate,
              ...result.characterPatch,
              provenance: result.provenanceUpdate,
            }),
          ),
        )
      }
      const slots = getManagedClassSpellSlots(entry)
      const book = (level: number, ordinal = 0) =>
        slots.find(
          (slot) => slot[1] === 'class-spellbook' && slot[3] === level && slot[4] === ordinal,
        )!
      const cap = (level: number, ordinal = 0) =>
        slots.find(
          (slot) =>
            slot[1] === 'class-spellbook-specialty' && slot[3] === level && slot[4] === ordinal,
        )!
      const add = (
        candidate: Character,
        slot: ManagedClassSpellSlot,
        name: string,
        prepare = false,
        policy: ManagedClassSpellRequest['policy'] = 'default',
      ): ManagedClassSpellRequest => ({
        slot,
        target: { name, source },
        expected: null,
        expectedEmptyRevision: candidate.managedClassSpellRevision ?? 0,
        prepare,
        policy,
      })
      expect(slots.filter((slot) => slot[1] === 'class-spellbook-specialty')).toHaveLength(4)
      expect(validateSpells(actor, view(actor), current.spellsByKey)).toContainEqual(
        expect.objectContaining({ title: expect.stringContaining('Spell Mastery') }),
      )
      expect(() => change(actor, add(actor, cap(18), 'Magic Missile'))).toThrow(/spellbook/)
      const learned = change(
        actor,
        add(actor, book(1), 'Shield'),
        add(actor, book(1, 1), 'Cure Wounds', false, 'ignore-class-list'),
        add(actor, book(3), 'Mirror Image', true),
        add(actor, book(5), 'Fireball', true),
        add(actor, book(5, 1), 'Counterspell'),
        add(actor, book(6), 'Revivify', false, 'ignore-class-list'),
      )
      const pool = getManagedClassSpellPool(
        learned,
        cap(18),
        view(learned).classChoices.spellContext,
      )
      expect(pool.spells.map(({ name }) => name)).toEqual(revised ? ['Cure Wounds'] : ['Shield'])
      if (revised) {
        expect(() => change(learned, add(learned, cap(18), 'Shield'))).toThrow(/spellbook/)
        const bypassed = change(learned, add(learned, cap(18), 'Cure Wounds'))
        const match = (spell: GameData['spells'][number]) =>
          spell.source === source && spell.name === 'Cure Wounds'
        const candidate = data.spells.find(match)!
        const [conflicted] = auditSpellRouteMultiplicity([candidate, { ...candidate }])
        expect(conflicted.classSpellRouteSource?.input.targetOccurrences).toHaveLength(2)
        for (const target of [conflicted, { ...candidate, time: null as never }]) {
          const changed = lookups({
            ...data,
            spells: data.spells.map((spell) => (match(spell) ? target : spell)),
          })
          const statuses = view(bypassed, changed).managedClassSpellStatuses.filter(
            ({ choice }) => choice.target.name === 'Cure Wounds',
          )
          expect(statuses.map(({ active }) => active)).toEqual([true, false])
        }
        expect(
          view(bypassed)
            .managedClassSpellStatuses.filter(({ choice }) => choice.target.name === 'Cure Wounds')
            .map(({ active }) => active),
        ).toEqual([true, true])
      } else {
        expect(() => change(learned, add(learned, cap(18), 'Cure Wounds'))).toThrow(/spellbook/)
        expect(() => change(learned, add(learned, cap(20), 'Revivify'))).toThrow(/spellbook/)
      }
      expect(() =>
        change(learned, add(learned, cap(20), 'Fireball'), add(learned, cap(20, 1), 'Fireball')),
      ).toThrow()
      const saved = change(
        learned,
        add(learned, cap(18), 'Magic Missile'),
        add(learned, book(18), 'Magic Missile'),
        add(learned, cap(18, 1), 'Mirror Image'),
        add(learned, cap(20), 'Fireball'),
        add(learned, cap(20, 1), 'Counterspell'),
      )
      const profile = (candidate: Character) =>
        candidate.spells.spellProfiles.find((row) => row.classSource === source)!
      expect(specialty(saved)).toHaveLength(4)
      expect(profile(saved).alwaysPreparedSpells ?? []).toEqual([])
      const effective = view(saved).character
      expect(profile(effective).alwaysPreparedSpells?.map((ref) => ref.split('|')[0])).toEqual(
        revised
          ? ['Magic Missile', 'Mirror Image', 'Fireball', 'Counterspell']
          : ['Fireball', 'Counterspell'],
      )
      expect(profile(effective).preparedSpells.map((ref) => ref.split('|')[0])).toEqual(
        revised ? [] : ['Mirror Image'],
      )
      const fireball = specialty(saved).find((row) => row.target.name === 'Fireball')!
      const cleared = change(saved, { slot: fireball.slot, expected: fireball })
      expect(profile(view(cleared).character).spellsKnown).toContain(`Fireball|${source}`)
      expect(profile(view(cleared).character).preparedSpells).toContain(`Fireball|${source}`)
      const missile = saved.managedClassSpellChoices!.find(
        (row) => row.target.name === 'Magic Missile' && row.slot[1] === 'class-spellbook',
      )!
      const withoutBook = change(saved, { slot: missile.slot, expected: missile })
      expect(specialty(withoutBook)).toHaveLength(4)
      expect(
        view(withoutBook).managedClassSpellStatuses.find(
          (row) =>
            row.choice.slot[1] === 'class-spellbook-specialty' &&
            row.choice.target.name === 'Magic Missile',
        )?.active,
      ).toBe(false)
      const withoutFeature = lookups({
        ...data,
        classFeatures: data.classFeatures.filter(
          (row) =>
            !(row.className === 'Wizard' && row.source === source && row.name === 'Spell Mastery'),
        ),
      })
      const hidden = view(saved, withoutFeature)
      expect(
        hidden.managedClassSpellStatuses.filter(
          (row) => row.choice.slot[1] === 'class-spellbook-specialty' && row.active,
        ),
      ).toHaveLength(2)
      expect(
        view(saved).managedClassSpellStatuses.filter(
          (row) => row.choice.slot[1] === 'class-spellbook-specialty' && row.active,
        ),
      ).toHaveLength(4)
      const rolled = retainEarnedManagedClassSpells(saved, [{ ...entry, levels: 19 }])
      expect(specialty(rolled)).toHaveLength(2)
      expect(rolled.managedClassSpellRevision).toBe((saved.managedClassSpellRevision ?? 0) + 1)
      const sheet = createCharacterSheetViewModel(saved, current, current)
      expect(sheet.spellRows.find((row) => row.name === 'Magic Missile')).toMatchObject({
        prepared: revised,
        castingNote: expect.stringContaining('Spell Mastery'),
      })
      expect(sheet.spellRows.find((row) => row.name === 'Counterspell')).toMatchObject({
        prepared: true,
        castingNote: expect.stringContaining('Signature Spells'),
      })
      expect(sheet.actions.find((row) => row.name === 'Magic Missile')).toMatchObject({
        active: revised,
        description: expect.stringContaining('Spell Mastery'),
      })
      expect(sheet.actions.find((row) => row.name === 'Counterspell')).toMatchObject({
        active: true,
      })
      if (type !== 'bundled') continue
      const edition = revised ? '2024' : '2014'
      for (const layout of ['official', 'custom'] as const) {
        const pdf = await PDFDocument.load(
          await generateTestCharacterSheet(sheet, `${edition}-${layout}`, {
            text: { descriptions: 'full', overflow: 'notes' },
          }),
        )
        const text = pdf
          .getForm()
          .getFields()
          .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
          .join(' ')
        expect(text).toContain('Spell Mastery')
        expect(text).toContain('Signature Spells')
        expect(text).toContain('without expending a spell slot')
      }
    }
  },
  90_000,
)
