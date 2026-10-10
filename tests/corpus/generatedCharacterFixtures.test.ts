import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import { characterPersistenceSchema } from '@/types/characterSchema'

describe.runIf(existsSync(resolve(process.cwd(), 'data')))(
  'current character fixture generation',
  () => {
    test('emits strict current-format characters with separate fixed target identity', () => {
      // Capture the four fixture writes; dependency cache writes remain ordinary cache writes.
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
const outputs = [];
const fixturePaths = new Set(['full-coverage-character-2014.tbc', 'full-coverage-character-2024.tbc', 'companion-choice-character-2014.tbc', 'companion-choice-character-2024.tbc'].map(name => resolve('tests', 'fixtures', name)));
const write = fs.writeFileSync;
fs.writeFileSync = (path, contents, ...options) => {
  if (typeof path === 'string' && fixturePaths.has(resolve(path))) outputs.push({ path, character: JSON.parse(contents) });
  else write(path, contents, ...options);
};
syncBuiltinESMExports();
await import('./scripts/generate-full-coverage-character-fixtures.mjs');
process.stdout.write(JSON.stringify(outputs));`,
        ],
        // The full coverage run shares CPU with three other workers and their data parsing.
        { cwd: process.cwd(), encoding: 'utf8', timeout: 90_000 },
      )
      const outputs = JSON.parse(output) as Array<{ path: string; character: unknown }>
      expect(outputs).toHaveLength(4)
      expect(new Set(outputs.map(({ path }) => path)).size).toBe(4)
      for (const { path, character } of outputs) {
        expect(character).toEqual(JSON.parse(readFileSync(path, 'utf8')))
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
    }, 100_000)
  },
)
