import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseFeats } from '@/lib/5etools/parsers'
import type { Feat5e } from '@/types/5etools'
import {
  actorPrerequisite,
  athletePrerequisite,
  defensiveDuelistPrerequisite,
} from '../fixtures/prerequisiteFixtures'

const featsPath = resolve(process.cwd(), 'data', 'feats.json')
describe.runIf(existsSync(featsPath))('upstream prerequisite fixtures', () => {
  test('retains the real mechanical shapes through feat ingestion', () => {
    const feats = parseFeats(JSON.parse(readFileSync(featsPath, 'utf8'))) as Feat5e[]
    for (const fixture of [actorPrerequisite, athletePrerequisite, defensiveDuelistPrerequisite]) {
      const feat = feats.find(
        (candidate) => candidate.name === fixture.name && candidate.source === fixture.source,
      )
      expect(feat?.prerequisite).toEqual(fixture.prerequisite)
    }
  })
})
