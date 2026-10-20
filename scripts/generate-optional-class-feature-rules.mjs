import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { deriveOptionalClassFeatureRules } from './lib/optional-class-feature-source.mjs'

// Explicit development tooling. The separate reviewed semantic seed is read-only input.
const root = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) ?? 'data'
const checking = process.argv.includes('--check')
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const inputs = []
const read = (file) => {
  const bytes = fs.readFileSync(path.join(root, file))
  inputs.push({ file, sha256: sha(bytes) })
  return JSON.parse(bytes)
}
const index = read('class/index.json')
const documents = [...new Set(Object.values(index))].sort().map((file) => read('class/' + file))
const rules = read('variantrules.json').variantrule.filter(
  (row) => row.name === 'Optional Class Features' && row.source === 'TCE',
)
const server = await createServer({
  configFile: 'vite.config.e2e.ts',
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const identity = await server.ssrLoadModule('/src/lib/5etools/classFeatureIdentity.ts')
  const preparation = await server.ssrLoadModule('/src/lib/5etools/subclassSourcePreparation.ts')
  const certificates = await server.ssrLoadModule(
    '/src/lib/5etools/subclassProficiencyCertificates.ts',
  )
  const derived = deriveOptionalClassFeatureRules(documents, rules, {
    classIdentity: identity.getClassFeatureIdentity,
    subclassIdentity: identity.getSubclassFeatureIdentity,
    decodeClass: identity.decodeClassFeatureReference,
    materializeSubclassFeatures: preparation.materializeSubclassFeatureCopies,
    digest: certificates.subclassProficiencyDigest,
  })
  const helpers = [
    'scripts/generate-optional-class-feature-rules.mjs',
    'scripts/lib/optional-class-feature-source.mjs',
    'scripts/lib/optional-class-feature-semantics.json',
    'src/lib/5etools/classFeatureIdentity.ts',
    'src/lib/5etools/featureSourceAudit.ts',
    'src/lib/5etools/featureRulesSignature.ts',
    'src/lib/5etools/subclassSourcePreparation.ts',
    'src/lib/5etools/subclassProficiencyCertificates.ts',
    'src/lib/5etools/subclassContent.ts',
    'src/lib/5etools/copyResolution.ts',
  ].map((file) => ({ file, sha256: sha(fs.readFileSync(file)) }))
  const upstream = execFileSync('git', ['-C', '.tmp/5etools-src', 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  const outputs = [
    ['src/lib/5etools/optionalClassFeatureRules.generated.json', derived],
    [
      'scripts/generated/optional-class-feature-inputs.json',
      { version: 1, upstream, inputs, helpers },
    ],
  ]
  for (const [file, value] of outputs) {
    const bytes = execFileSync(
      process.execPath,
      ['node_modules/@biomejs/biome/bin/biome', 'format', '--stdin-file-path', file],
      { input: JSON.stringify(value, null, 2) + '\n', encoding: 'utf8', windowsHide: true },
    )
    if (checking) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== bytes)
        throw Error('Optional class generated output is stale: ' + file)
    } else fs.writeFileSync(file, bytes)
  }
  console.log(
    JSON.stringify({
      checked: checking,
      roots: derived.roots.length,
      knownOptionalTargets: derived.knownOptionalTargets.length,
      parents: derived.parents.length,
      features: derived.features.length,
    }),
  )
} finally {
  await server.close()
}
