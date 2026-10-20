import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createServer } from 'vite'
import { deriveOptionalClassProficiencyRules } from './lib/optional-class-proficiency-source.mjs'

const checking = process.argv.includes('--check')
const root = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) ?? 'data'
const document = JSON.parse(fs.readFileSync(root + '/class/class-barbarian.json', 'utf8'))
const skills = JSON.parse(fs.readFileSync(root + '/skills.json', 'utf8')).skill.map((row) =>
  row.name.trim().toLowerCase(),
)
const authority = JSON.parse(
  fs.readFileSync('scripts/lib/optional-class-declaration-semantics.json', 'utf8'),
)
const server = await createServer({
  configFile: 'vite.config.e2e.ts',
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const structure = await server.ssrLoadModule(
    '/src/lib/5etools/optionalClassDeclarationStructure.ts',
  )
  const rules = deriveOptionalClassProficiencyRules([document], authority, {
    collect: structure.collectOptionalDeclarationCertificates,
    digest: structure.optionalDeclarationDigest,
    skills,
  })
  const file = 'src/lib/5etools/optionalClassProficiencyRules.generated.json'
  const bytes = execFileSync(
    process.execPath,
    ['node_modules/@biomejs/biome/bin/biome', 'format', '--stdin-file-path', file],
    {
      input: JSON.stringify(rules, null, 2) + '\n',
      encoding: 'utf8',
      windowsHide: true,
    },
  )
  if (checking) {
    if (fs.readFileSync(file, 'utf8') !== bytes) throw Error('Stale optional proficiency rules')
  } else fs.writeFileSync(file, bytes)
  console.log(JSON.stringify({ checked: checking, roots: rules.length, gains: rules[0].gains }))
} finally {
  await server.close()
}
