import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { emitSharedRegistryModule } from './lib/shared-registry-source.mjs'

const root = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) ?? 'data'
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, 'class', file), 'utf8'))
const index = read('index.json')
const documents = new Map([...new Set(Object.values(index))].map((file) => [file, read(file)]))
const registry = JSON.parse(
  fs.readFileSync('src/lib/5etools/classCastingRules.generated.json', 'utf8'),
)
const server = await createServer({
  configFile: 'config/vite.e2e.ts',
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const { getCastingParentOwner, getClassCastingRoots, getPlainCastingCopyParent } =
    await server.ssrLoadModule('/src/lib/5etools/classCastingStructure.ts')
  const { createIndexedClassResolver } = await server.ssrLoadModule(
    '/src/lib/5etools/subclassSourcePreparation.ts',
  )
  const resolve = createIndexedClassResolver(index, documents)
  const key = JSON.stringify
  const children = new Map()
  for (const [file, document] of documents) {
    for (const [position, row] of (document.class ?? []).entries()) {
      const owner = getCastingParentOwner(row)
      if (!owner) continue
      const id = key(owner)
      if (children.has(id)) throw Error('Ambiguous class owner ' + id)
      const parent = getPlainCastingCopyParent(row)
      const casting =
        parent &&
        registry.producers.find(
          (producer) =>
            !producer.domains['class-arcanum'] && key(producer.declaration.owner) === key(parent),
        )
      const prepared = casting && resolve(file)[position]
      children.set(
        id,
        prepared && getClassCastingRoots(prepared, casting.declaration.target).length === 1
          ? [owner, parent]
          : undefined,
      )
    }
  }
  const owners = [...children.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, pair]) => (pair ? [pair] : []))
  const file = 'src/lib/5etools/classCastingCopyOwners.generated.ts'
  const output = execFileSync(
    process.execPath,
    ['node_modules/@biomejs/biome/bin/biome', 'format', '--stdin-file-path', file],
    {
      input: emitSharedRegistryModule(owners, 'scripts/generate-class-casting-copy-owners.mjs'),
      encoding: 'utf8',
      windowsHide: true,
    },
  )
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(file, 'utf8') !== output) throw Error('Stale casting copy owners')
  } else fs.writeFileSync(file, output)
} finally {
  await server.close()
}
