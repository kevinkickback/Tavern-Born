import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { CompanionFamilySource } from '@/types/5etools'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

export const COMPANION_FAMILY_BOOK = 'book/book-wow.json'
const creature = '\\{@creature ([^|{}#]+)\\|([^|{}#]+)(?:\\|[^|{}#]+)?\\}'
const formText = new RegExp(`^${creature}(?: or ${creature})*$`)
const specs = { C: 'Cunning', F: 'Ferocity', T: 'Tenacity' } as const
const entries = (row: Record<string, unknown>) =>
  Array.isArray(row.entries) ? row.entries.map(record) : []

/** Only the qualified class section and its actual family table are catalog data. */
export function parseCompanionFamilySources(raw: unknown, source: string): CompanionFamilySource[] {
  const document = record(raw)
  if (!Array.isArray(document.bookData) || document.bookData.length !== 1) return []
  const book = record(document.bookData[0])
  if (book.source !== source || book.id !== source || !Array.isArray(book.data)) return []
  const result: CompanionFamilySource[] = []
  const chapters = book.data.map(record)
  for (const chapter of chapters) {
    if (
      chapter.type !== 'section' ||
      typeof chapter.id !== 'string' ||
      chapters.filter((row) => row.id === chapter.id).length !== 1
    )
      continue
    const sections = entries(chapter)
    for (const cls of sections) {
      if (
        (cls.type !== 'entries' && cls.type !== 'section') ||
        typeof cls.name !== 'string' ||
        typeof cls.id !== 'string' ||
        sections.filter((row) => row.id === cls.id || row.name === cls.name).length !== 1
      )
        continue
      const petSections = entries(cls).filter((row) => row.name === `${cls.name} Pets`)
      if (petSections.length !== 1 || petSections[0].type !== 'entries') continue
      const section = petSections[0]
      const intro = Array.isArray(section.entries) ? section.entries[0] : undefined
      const list = entries(section).filter((row) => row.type === 'list')
      const notes =
        list.length === 1 && Array.isArray(list[0].items) ? list[0].items.map(record) : []
      const masteryNote = notes.find((row) => row.name === 'Mastery Property (Mastery)')?.entry
      const specializationNote = notes.find((row) => row.name === 'Specialization (Spec.)')?.entry
      if (
        typeof intro !== 'string' ||
        !intro.includes(
          '{@subclassFeature Primal Companion|Ranger|XPHB|Beast Master|XPHB|3|XPHB}',
        ) ||
        !intro.includes('you choose the form it takes from among the pet families') ||
        notes.length !== 3 ||
        typeof specializationNote !== 'string' ||
        !specializationNote.includes('Cunning (C), Ferocity (F), or Tenacity (T)') ||
        !specializationNote.includes(
          `{@classFeature Pet Specialization|Ranger|XPHB|6|${source}}`,
        ) ||
        typeof masteryNote !== 'string' ||
        !masteryNote.includes(
          "you can choose your pet's family as one of the weapons for your Weapon Mastery feature",
        ) ||
        !masteryNote.endsWith(
          "its mastery property applies to your primal companion's Beast's Strike attack.",
        )
      )
        continue
      const tables = entries(section).filter((row) => row.caption === 'Pet Families')
      const [table] = tables
      if (
        tables.length !== 1 ||
        table.type !== 'table' ||
        !Array.isArray(table.rows) ||
        JSON.stringify(table.colLabels) !==
          JSON.stringify(['Family', 'Stat Block', 'Spec.', 'Mastery'])
      )
        continue
      const families: CompanionFamilySource['families'] = []
      const tamingNotes = Array.isArray(table.footnotes)
        ? table.footnotes.filter(
            (line): line is string =>
              typeof line === 'string' && line.startsWith('*Unusual pet family;'),
          )
        : []
      for (const row of table.rows) {
        if (
          !Array.isArray(row) ||
          row.length !== 4 ||
          !row.every((field) => typeof field === 'string')
        )
          break
        const [family, forms, spec, property] = row
        const name = /^([\p{L}\d -]+?)(\*)?(?: \(.+\))?$/u.exec(family)
        const mastery = /^\{@itemMastery ([^|{}#]+)(?:\|([^|{}#]+))?\}$/.exec(property)
        const specialization =
          spec === 'C' || spec === 'F' || spec === 'T' ? specs[spec] : undefined
        if (
          !name?.[1].trim() ||
          !mastery?.[1].trim() ||
          !specialization ||
          !formText.test(forms) ||
          (name[2] &&
            (tamingNotes.length !== 1 ||
              !tamingNotes[0].includes('must acquire a special ability') ||
              !tamingNotes[0].endsWith('to tame an unusual pet.')))
        )
          break
        const creatures = [...forms.matchAll(new RegExp(creature, 'g'))].map((form) => ({
          name: form[1].trim(),
          source: form[2].trim(),
        }))
        if (
          creatures.some((form) => !form.name || !form.source) ||
          new Set(creatures.map((form) => JSON.stringify([norm(form.name), norm(form.source)])))
            .size !== creatures.length
        )
          break
        families.push({
          name: name[1].trim(),
          creatures,
          mastery: { name: mastery[1].trim(), source: mastery[2]?.trim() ?? 'XPHB' },
          specialization,
          ...(name[2] && { unusual: true }),
        })
      }
      if (
        families.length === table.rows.length &&
        families.length &&
        new Set(families.map((family) => norm(family.name))).size === families.length
      )
        result.push({ name: cls.name, source, families })
    }
  }
  return result.filter(
    (row) => result.filter((candidate) => norm(candidate.name) === norm(row.name)).length === 1,
  )
}
