import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import { characterPersistenceSchema } from '@/types/characterSchema'

describe.runIf(existsSync(resolve(process.cwd(), 'data')))(
  'current character fixture generation',
  () => {
    test('emits strict current-format characters with separate fixed target identity', () => {
      // Run the real generator while capturing every write in the child process.
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const outputs = [];
fs.writeFileSync = (path, contents) => outputs.push({ path, character: JSON.parse(contents) });
syncBuiltinESMExports();
await import('./scripts/generate-full-coverage-character-fixtures.mjs');
process.stdout.write(JSON.stringify(outputs));`,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      )
      const outputs = JSON.parse(output) as Array<{ path: string; character: unknown }>
      expect(outputs).toHaveLength(4)
      for (const { character } of outputs) {
        const parsed = characterPersistenceSchema.parse(character)
        expect(parsed.schemaVersion).toBe(CURRENT_CHARACTER_SCHEMA_VERSION)
        for (const tags of Object.values(parsed.provenance.feats)) {
          for (const tag of tags.filter((entry) => entry.grantType === 'fixed')) {
            expect(tag.sourceRef).toBe(parsed.backgroundSource)
            expect(tag.grantSource).toBe('XPHB')
          }
        }
      }
      const revised = outputs.find(({ path }) => path.endsWith('full-coverage-character-2024.tbc'))
      const character = characterPersistenceSchema.parse(revised?.character)
      expect(character.provenance.feats.alert).toEqual([
        expect.objectContaining({
          sourceType: 'background',
          sourceName: 'Criminal',
          sourceRef: 'XPHB',
          grantSource: 'XPHB',
          grantType: 'fixed',
        }),
      ])
    })
  },
)
