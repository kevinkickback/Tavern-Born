import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { CLASS_PROFICIENCY_RULES } from '@/lib/5etools/classProficiencyRules'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import {
  deriveClassProficiencyRules,
  deriveLanguagePool,
  validateExpertiseRule,
} from '../../scripts/lib/class-proficiency-source.mjs'
import { proficiencySources } from '../fixtures/classProficiencyFixtures'

const dependencies = JSON.parse(
  readFileSync('tests/fixtures/classProficiencyDependencies.json', 'utf8'),
)
const options = () => ({
  languagePool: deriveLanguagePool(dependencies.book).names,
  identity: getClassFeatureIdentity,
  digest: getFeatureSourceDigest,
})

test('source-derived checkpoint exactly reproduces all fourteen supported complete producers', () => {
  expect(deriveClassProficiencyRules(proficiencySources, options())).toEqual(
    CLASS_PROFICIENCY_RULES,
  )
  const later = CLASS_PROFICIENCY_RULES.find(
    (row) => row.target === 'class-feature|expertise|expert sidekick|tce|15|tce',
  )!
  expect(later.domains[0]).toMatchObject({
    count: 2,
    distinctEarlier: true,
    excludeExisting: false,
  })
  validateExpertiseRule([dependencies.expertiseRule])
  expect(deriveLanguagePool(dependencies.book).names).toEqual([
    'abyssal',
    'celestial',
    'common',
    'common sign language',
    'deep speech',
    'draconic',
    'druidic',
    'dwarvish',
    'elvish',
    'giant',
    'gnomish',
    'goblin',
    'halfling',
    'infernal',
    'orc',
    'primordial',
    'sylvan',
    "thieves' cant",
    'undercommon',
  ])
})

test('generation rejects new metadata, entry mechanics, changed clauses and duplicate producers instead of blessing their shape', () => {
  for (const mutate of [
    (rows: typeof proficiencySources) => {
      rows[0].skillProficiencies = [{ any: 3 }]
    },
    (rows: typeof proficiencySources) => {
      rows[0].entries = [...rows[0].entries!, 'Only while underground.']
    },
    (rows: typeof proficiencySources) => {
      rows[0].entries = [{ type: 'options', count: 1, entries: rows[0].entries }]
    },
    (rows: typeof proficiencySources) => {
      rows.push(structuredClone(rows[0]))
    },
  ]) {
    const rows = structuredClone(proficiencySources)
    mutate(rows)
    expect(() => deriveClassProficiencyRules(rows, options())).toThrow()
  }
  expect(() =>
    deriveClassProficiencyRules(
      proficiencySources.filter(
        (row) => !(row.className === 'Expert Sidekick' && row.level === 15),
      ),
      options(),
    ),
  ).toThrow(/Future gain/)
})

test('referenced language tables fail closed on ambiguity, unsupported cell shapes and missing columns', () => {
  const ambiguous = structuredClone(dependencies.book)
  ambiguous.data[2].entries.push(structuredClone(ambiguous.data[2].entries[0]))
  expect(() => deriveLanguagePool(ambiguous)).toThrow(/ambiguous/)
  const missing = structuredClone(dependencies.book)
  missing.data[2].entries[0].entries[2].colLabels[1] = 'Other'
  expect(() => deriveLanguagePool(missing)).toThrow(/shape/)
  const shaped = structuredClone(dependencies.book)
  shaped.data[2].entries[0].entries[2].rows[0][1] = { name: 'Common' }
  expect(() => deriveLanguagePool(shaped)).toThrow(/cell/)
})

test('regeneration rejects new dependency qualifications and cannot substitute a same-caption table from another chapter', () => {
  for (const [key, value] of [
    ['eligibility', { minimumLevel: 10 }],
    ['footnotes', ['Only Rangers may choose these languages.']],
  ] as const) {
    const book = structuredClone(dependencies.book)
    book.data[2].entries[0].entries[4][key] = value
    expect(() => deriveLanguagePool(book)).toThrow(/qualifier/)
  }
  const wrongChapter = structuredClone(dependencies.book)
  wrongChapter.data[1] = wrongChapter.data[2]
  wrongChapter.data[2] = { entries: [] }
  expect(() => deriveLanguagePool(wrongChapter)).toThrow(/section missing/)
  const metadata = { ...dependencies.expertiseRule, eligibility: { minimumLevel: 10 } }
  expect(() => validateExpertiseRule([metadata])).toThrow(/metadata/)
  const changed = {
    ...dependencies.expertiseRule,
    entries: [...dependencies.expertiseRule.entries, 'Only while resting.'],
  }
  expect(() => validateExpertiseRule([changed])).toThrow(/interpretation/)
})
