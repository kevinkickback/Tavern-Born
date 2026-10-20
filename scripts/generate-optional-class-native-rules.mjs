import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createServer } from 'vite'
import { deriveOptionalNativeRules } from './lib/optional-class-native-source.mjs'

const checking = process.argv.includes('--check')
const root = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) ?? 'data'
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const inputs = []
const read = (file) => {
  const bytes = fs.readFileSync(path.join(root, file))
  inputs.push({ file, sha256: sha(bytes) })
  return JSON.parse(bytes)
}
const index = read('class/index.json')
const documents = [...new Set(Object.values(index))].sort().map((file) => read('class/' + file))
const optionalFeatures = read('optionalfeatures.json').optionalfeature
const seed = JSON.parse(fs.readFileSync('scripts/lib/optional-class-native-semantics.json', 'utf8'))
const authority = JSON.parse(
  fs.readFileSync('scripts/lib/optional-class-declaration-semantics.json', 'utf8'),
)
const pilot = JSON.parse(
  fs.readFileSync('src/lib/5etools/optionalClassFeatureRules.generated.json', 'utf8'),
)
const server = await createServer({
  configFile: 'vite.config.e2e.ts',
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const identity = await server.ssrLoadModule('/src/lib/5etools/classFeatureIdentity.ts')
  const structure = await server.ssrLoadModule(
    '/src/lib/5etools/optionalClassDeclarationStructure.ts',
  )
  const { parseClassDocument } = await server.ssrLoadModule('/src/lib/5etools/parsers/classes.ts')
  const { materializeSubclassFeatureCopies } = await server.ssrLoadModule(
    '/src/lib/5etools/subclassSourcePreparation.ts',
  )
  const { collectUnconditionalFeatureReferences } = await server.ssrLoadModule(
    '/src/lib/5etools/unconditionalFeatureReferences.ts',
  )
  const { getFeatureVariantMetadata } = await server.ssrLoadModule(
    '/src/lib/5etools/featureVariantMetadata.ts',
  )
  const { normalizeClassRules } = await server.ssrLoadModule(
    '/src/lib/5etools/classRuleNormalization.ts',
  )
  const { normalizeSubclassRules } = await server.ssrLoadModule(
    '/src/lib/5etools/classChoiceNormalization.ts',
  )
  const derived = deriveOptionalNativeRules(documents, authority, pilot, optionalFeatures, {
    collect: structure.collectOptionalDeclarationCertificates,
    key: structure.optionalDeclarationKey,
    digest: structure.optionalDeclarationDigest,
    parse: parseClassDocument,
    materialize: materializeSubclassFeatureCopies,
    classIdentity: identity.getClassFeatureIdentity,
    subclassIdentity: identity.getSubclassFeatureIdentity,
    declarations: collectUnconditionalFeatureReferences,
    variant: getFeatureVariantMetadata,
    classRules: normalizeClassRules,
    subclassRules: normalizeSubclassRules,
  })
  if (
    seed.version !== 2 ||
    structure.optionalDeclarationDigest(derived) !== structure.optionalDeclarationDigest(seed)
  )
    throw Error('Native adoption meanings changed; independent assessment required')
  const helperFiles = new Set([
    'scripts/generate-optional-class-native-rules.mjs',
    'scripts/lib/optional-class-native-source.mjs',
    'scripts/lib/optional-class-native-semantics.json',
    'scripts/lib/optional-class-declaration-semantics.json',
    'src/lib/5etools/optionalClassFeatureRules.generated.json',
    'src/lib/5etools/parsers/classes.ts',
    'src/lib/5etools/optionalClassDeclarationStructure.ts',
    'src/lib/5etools/featureVariantMetadata.ts',
    'src/lib/5etools/classRuleNormalization.ts',
    'src/lib/5etools/classChoiceNormalization.ts',
    'package-lock.json',
  ])
  const visit = (file) => {
    if (!file.endsWith('.ts')) return
    for (const imported of ts.preProcessFile(fs.readFileSync(file, 'utf8')).importedFiles) {
      const name = imported.fileName,
        base = name.startsWith('@/')
          ? 'src/' + name.slice(2)
          : name.startsWith('.')
            ? path.posix.normalize(path.posix.join(path.posix.dirname(file), name))
            : undefined
      if (!base) continue
      const target = [base, base + '.ts', base + '/index.ts'].find(
        (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
      )
      if (!target) throw Error('Unrecorded native helper dependency: ' + base)
      if (helperFiles.has(target)) continue
      helperFiles.add(target)
      visit(target)
    }
  }
  for (const file of [...helperFiles]) visit(file)
  const helpers = [...helperFiles]
    .sort()
    .map((file) => ({ file, sha256: sha(fs.readFileSync(file)) }))
  const upstream = execFileSync('git', ['-C', '.tmp/5etools-src', 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  const runtime = { version: 1, roots: derived.roots, pools: derived.pools }
  for (const [file, value] of [
    ['src/lib/5etools/optionalClassNativeRules.generated.json', runtime],
    [
      'scripts/generated/optional-class-native-inputs.json',
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
        throw Error('Stale native generated output: ' + file)
    } else fs.writeFileSync(file, bytes)
  }
  console.log(
    JSON.stringify({
      checked: checking,
      roots: derived.roots.length,
      replacements: derived.roots.filter((row) => row.replaces.length).length,
      originalTargets: derived.originals.length,
      pools: derived.pools.length,
      inputs: inputs.length,
      helpers: helpers.length,
    }),
  )
} finally {
  await server.close()
}
