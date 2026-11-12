import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { emitSharedRegistryModule } from './lib/shared-registry-source.mjs'

const data = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) ?? 'data'
const read = (file) => JSON.parse(fs.readFileSync(path.join(data, 'class', file), 'utf8'))
const index = read('index.json')
const documents = new Map([...new Set(Object.values(index))].map((file) => [file, read(file)]))
const output = 'src/lib/5etools/copiedSubclassProficiencyRoots.generated.ts'
const server = await createServer({
  configFile: 'config/vite.e2e.ts',
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
const key = (value) => JSON.stringify(value)

try {
  const load = (name) => server.ssrLoadModule(`/src/lib/5etools/${name}.ts`)
  const { default: standard } = await load('subclassProficiencyCertificates.generated')
  const { default: retained } = await load('retainedSubclassProficiencyCertificates.generated')
  const {
    getSubclassCopyIdentity,
    getSubclassCopyLookupKey,
    getSubclassProficiencyOwner,
    subclassProficiencyDigest,
    subclassProficiencyMetadata,
    subclassProficiencyRootDigest,
  } = await load('subclassProficiencyCertificates')
  const {
    createIndexedClassResolver,
    createIndexedSubclassResolver,
    getIndexedClassDependencyFiles,
  } = await load('subclassSourcePreparation')
  const { getPlainCastingCopyParent } = await load('classCastingStructure')
  const { decodeClassFeatureReference, getClassFeatureIdentity } =
    await load('classFeatureIdentity')
  const known = new Map([...standard.roots, ...retained.roots].map((row) => [key(row.owner), row]))
  const ownerCounts = new Map()
  for (const document of documents.values())
    for (const row of document.subclass ?? []) {
      const owner = getSubclassProficiencyOwner(row)
      if (!owner) continue
      const ownerKey = key(owner)
      ownerCounts.set(ownerKey, (ownerCounts.get(ownerKey) ?? 0) + 1)
    }
  const resolveClasses = createIndexedClassResolver(index, documents)
  const resolveSubclasses = createIndexedSubclassResolver(index, documents)
  const roots = []

  for (const [file, document] of documents) {
    const rawRoots = document.subclass ?? []
    for (const [position, raw] of rawRoots.entries()) {
      const owner = getSubclassProficiencyOwner(raw)
      const parent = raw._copy && getSubclassCopyIdentity(raw._copy)
      if (
        !owner ||
        !parent ||
        ownerCounts.get(key(owner)) !== 1 ||
        known.has(key(owner)) ||
        'subclassFeatures' in raw ||
        Object.keys(raw._copy).length !== parent.length
      )
        continue
      const [name, source, , className, classSource] = parent
      const printedOwner = [className, classSource, name, source].map((value) =>
        value.toLowerCase(),
      )
      const printed = known.get(key(printedOwner))
      if (!printed || classSource !== source) continue
      const rawClasses = document.class?.filter(
        (row) => row.name === raw.className && row.source === raw.classSource,
      )
      const copy = rawClasses?.length === 1 && getPlainCastingCopyParent(rawClasses[0])
      if (!copy || copy[1] !== printedOwner[0] || copy[2] !== printedOwner[1]) continue

      const files = getIndexedClassDependencyFiles(index, documents, file, 'subclass')
      if (document._meta?.internalCopies?.includes('subclass')) files.push(file)
      const candidates = [...new Set(files)].flatMap((name) => documents.get(name).subclass ?? [])
      const bases = candidates.filter((row) => getSubclassCopyLookupKey(row) === parent.join('|'))
      const effective = resolveSubclasses(file)[position]
      const current = resolveClasses(file).find(
        (row) => row.name === raw.className && row.source === raw.classSource,
      )
      const gain = current?.classFeatures?.find((row) => row.gainSubclassFeature === true)
      const decoded = decodeClassFeatureReference(gain?.classFeature ?? '')
      const retainedGainTarget = getClassFeatureIdentity(decoded)
      if (
        bases.length !== 1 ||
        candidates.filter((row) => key(getSubclassProficiencyOwner(row)) === key(printedOwner))
          .length !== 1 ||
        bases[0]._copy ||
        subclassProficiencyRootDigest(bases[0]) !== printed.rawDigest ||
        !retainedGainTarget ||
        decoded.className !== className ||
        decoded.classSource !== classSource ||
        key(effective.subclassFeatures) !== key(printed.declarations)
      )
        continue
      const paths = printed.paths.filter((row) => row.level === decoded.level)
      if (!paths.length) continue
      roots.push({
        owner,
        shortName: effective.shortName,
        rawDigest: subclassProficiencyRootDigest(raw),
        metadataDigest: subclassProficiencyDigest(subclassProficiencyMetadata(effective, true)),
        fields: Object.keys(effective).sort(),
        copies: [{ key: parent.join('|'), digest: printed.rawDigest }],
        declarations: effective.subclassFeatures,
        intro: printed.intro,
        paths,
        retainedGainTarget,
      })
    }
  }
  roots.sort((left, right) => key(left.owner).localeCompare(key(right.owner)))
  const source = emitSharedRegistryModule(
    { roots },
    'scripts/generate-copied-subclass-proficiency-roots.mjs',
    true,
  )
  const text = execFileSync(
    process.execPath,
    ['node_modules/@biomejs/biome/bin/biome', 'format', '--stdin-file-path', output],
    { input: source, encoding: 'utf8', windowsHide: true },
  )
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(output, 'utf8') !== text)
      throw new Error('Copied subclass proficiency roots changed')
  } else fs.writeFileSync(output, text)
  console.log(`Qualified ${roots.length} copied subclass proficiency roots`)
} finally {
  await server.close()
}
