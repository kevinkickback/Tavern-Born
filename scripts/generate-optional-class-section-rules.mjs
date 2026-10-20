import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import seed from './lib/optional-class-section-semantics.json' with { type: 'json' }

if (seed.version !== 3) throw Error('Unsupported optional book semantic input version')

// Explicit generation verifies an independently reviewed input. It never rewrites semantic authority.
const root = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) ?? 'data'
const checking = process.argv.includes('--check'),
  inputs = []
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const read = (file) => {
  const bytes = fs.readFileSync(path.join(root, file))
  inputs.push({ file, sha256: sha(bytes) })
  return JSON.parse(bytes)
}
const book = read('book/book-tce.json'),
  books = read('books.json')
const documents = [...new Set(seed.parents.map((row) => 'class/class-' + row.owner[1] + '.json'))]
  .sort()
  .map(read)
const server = await createServer({
  configFile: false,
  resolve: { alias: { '@': path.resolve('src') } },
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const { getFeatureSourceDigest } = await server.ssrLoadModule(
    '/src/lib/5etools/featureSourceAudit.ts',
  )
  const { readOptionalClassSectionInput, getOptionalClassSectionMembers } =
    await server.ssrLoadModule('/src/lib/5etools/optionalClassSectionStructure.ts')
  const identity = await server.ssrLoadModule('/src/lib/5etools/classFeatureIdentity.ts')
  const digest = (value) => getFeatureSourceDigest([value], false)
  const norm = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
  const features = seed.features.map((expected) => {
    const rows = documents
      .flatMap((row) => row.classFeature ?? [])
      .filter((row) => identity.getClassFeatureIdentity(row) === expected.target)
    if (rows.length !== 1 || digest(rows[0]) !== digest(expected.sourceRecord))
      throw Error('Section granting feature meaning changed: ' + expected.target)
    const row = rows[0]
    return {
      target: expected.target,
      name: row.name,
      source: row.source,
      level: row.level,
      fields: Object.keys(row).sort(),
      digest: digest(row),
    }
  })
  const parents = seed.parents.map((expected) => {
    const rows = documents
      .flatMap((row) => row.class ?? [])
      .filter(
        (row) =>
          JSON.stringify(['class', norm(row.name), norm(row.source)]) ===
          JSON.stringify(expected.owner),
      )
    if (
      rows.length !== 1 ||
      rows[0]._copy ||
      JSON.stringify(Object.keys(rows[0]).sort()) !== JSON.stringify(expected.fields)
    )
      throw Error('Section owner shape changed')
    for (const declaration of expected.declarations)
      if (rows[0].classFeatures.filter((row) => row === declaration.rawDeclaration).length !== 1)
        throw Error('Section grant declaration changed')
    return expected
  })
  const sections = seed.sections.map((expected) => {
    const current = readOptionalClassSectionInput(book, books, expected)
    const semantic = {
      document: expected.document,
      rootContext: expected.rootContext,
      book: expected.book,
      chapter: expected.chapter,
      classSection: expected.classSection,
      parent: expected.parent,
      leaf: expected.leaf,
    }
    if (!current || digest(current) !== digest(semantic))
      throw Error('Optional book section meaning/context changed: ' + expected.target)
    const members = getOptionalClassSectionMembers(current.leaf)
    if (!members?.length || JSON.stringify(members) !== JSON.stringify(expected.members))
      throw Error('Optional section member set changed')
    const parent = documents
      .flatMap((row) => row.class ?? [])
      .find((row) => norm(row.name) === expected.owner[1] && norm(row.source) === expected.owner[2])
    if (
      expected.progression &&
      digest(
        parent.optionalfeatureProgression.filter((row) => row.name === expected.progression.name),
      ) !== digest([expected.progression])
    )
      throw Error('Section granting progression changed')
    return {
      target: expected.target,
      owner: expected.owner,
      name: expected.name,
      source: expected.source,
      level: expected.level,
      locator: {
        book: expected.book,
        chapter: { id: expected.chapter.id },
        classSection: { id: expected.classSection.id },
        parent: { id: expected.parent.id },
        leaf: { id: expected.leaf.id },
        contextInventory: expected.contextInventory,
      },
      digest: digest(semantic),
      members,
      grantingTarget: expected.grantingTarget,
      ...(expected.progression ? { progression: expected.progression } : {}),
    }
  })
  const helpers = [
    'scripts/generate-optional-class-section-rules.mjs',
    'scripts/lib/optional-class-section-semantics.json',
    'src/lib/5etools/optionalClassSectionStructure.ts',
    'src/lib/5etools/featureSourceAudit.ts',
    'src/lib/5etools/featureRulesSignature.ts',
    'src/lib/5etools/classFeatureIdentity.ts',
  ].map((file) => ({ file, sha256: sha(fs.readFileSync(file)) }))
  const upstream = execFileSync('git', ['-C', '.tmp/5etools-src', 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  for (const [file, value] of [
    [
      'src/lib/5etools/optionalClassSectionRules.generated.json',
      { version: 3, sections, parents, features },
    ],
    [
      'scripts/generated/optional-class-section-inputs.json',
      { version: 1, upstream, inputs, helpers },
    ],
  ]) {
    const bytes = execFileSync(
      process.execPath,
      ['node_modules/@biomejs/biome/bin/biome', 'format', '--stdin-file-path', file],
      { input: JSON.stringify(value, null, 2) + '\n', encoding: 'utf8', windowsHide: true },
    )
    if (checking) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== bytes)
        throw Error('Optional book generated output stale: ' + file)
    } else fs.writeFileSync(file, bytes)
  }
  console.log(
    JSON.stringify({
      checked: checking,
      sections: sections.length,
      parents: parents.length,
      features: features.length,
      members: sections.reduce((n, row) => n + row.members.length, 0),
    }),
  )
} finally {
  await server.close()
}
