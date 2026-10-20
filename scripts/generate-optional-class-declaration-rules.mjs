import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createServer } from 'vite'

// Read-only semantic authority: ordinary generation checks meaning, never recaptures it.
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
const seed = JSON.parse(
  fs.readFileSync('scripts/lib/optional-class-declaration-semantics.json', 'utf8'),
)
const server = await createServer({
  configFile: 'vite.config.e2e.ts',
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const api = await server.ssrLoadModule('/src/lib/5etools/optionalClassDeclarationStructure.ts')
  const rules = JSON.parse(
    fs.readFileSync('src/lib/5etools/optionalClassFeatureRules.generated.json', 'utf8'),
  )
  const targets = new Set([
    ...rules.knownOptionalTargets.map((row) => row.target),
    ...seed.standardDependencies.map((row) => row.target),
  ])
  const relations = documents
    .flatMap((document) => api.collectOptionalDeclarationCertificates(document, targets))
    .sort((a, b) =>
      api
        .optionalDeclarationKey(a.owner, a.target, a.level)
        .localeCompare(api.optionalDeclarationKey(b.owner, b.target, b.level)),
    )
  if (
    seed.version !== 2 ||
    api.optionalDeclarationDigest(relations) !== api.optionalDeclarationDigest(seed.relations)
  )
    throw Error(
      'Optional declaration meaning/owner/path/copy closure changed; independent assessment required',
    )
  const helperFiles = new Set([
    'scripts/generate-optional-class-declaration-rules.mjs',
    'scripts/lib/optional-class-declaration-semantics.json',
    'src/lib/5etools/optionalClassDeclarationStructure.ts',
    'src/lib/5etools/classFeatureIdentity.ts',
    'src/lib/5etools/featureSourceAudit.ts',
    'src/lib/5etools/featureRulesSignature.ts',
    'src/lib/5etools/subclassSourcePreparation.ts',
    'src/lib/5etools/subclassProficiencyCertificates.ts',
    'src/lib/5etools/copyResolution.ts',
    'src/lib/5etools/subclassContent.ts',
    'src/lib/5etools/optionalClassFeatureRules.generated.json',
    'package-lock.json',
  ])
  const visit = (file) => {
    if (!file.endsWith('.ts')) return
    for (const imported of ts.preProcessFile(fs.readFileSync(file, 'utf8')).importedFiles) {
      const name = imported.fileName
      const base = name.startsWith('@/')
        ? 'src/' + name.slice(2)
        : name.startsWith('.')
          ? path.posix.normalize(path.posix.join(path.posix.dirname(file), name))
          : undefined
      if (!base) continue
      const target = [base, base + '.ts', base + '/index.ts'].find(
        (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
      )
      if (!target) throw Error('Unrecorded generation helper dependency: ' + base)
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
  for (const [file, value] of [
    [
      'src/lib/5etools/optionalClassDeclarationRules.generated.json',
      { version: 1, relations: relations.map(api.summarizeOptionalDeclarationCertificate) },
    ],
    [
      'scripts/generated/optional-class-declaration-inputs.json',
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
        throw Error('Stale optional declaration output: ' + file)
    } else fs.writeFileSync(file, bytes)
  }
  console.log(
    JSON.stringify({
      checked: checking,
      relations: relations.length,
      inputs: inputs.length,
      helpers: helpers.length,
    }),
  )
} finally {
  await server.close()
}
