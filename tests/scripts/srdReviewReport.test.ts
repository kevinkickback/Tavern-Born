import { describe, expect, test } from 'vitest'
import { buildSrdReviewInventory } from '../../scripts/srd/reviewReport.mjs'

describe('SRD review inventory', () => {
  test('emits deterministic review rows with blank reviewer fields', () => {
    const report = buildSrdReviewInventory({
      coverage: {
        records: [
          {
            relativePath: 'data/spells/spells-xphb.json',
            collection: 'spell',
            identity: 'Light|XPHB',
            provenanceType: 'root-marker',
            marker: 'srd52',
            srdVersion: '5.2.1',
            recordSha256: 'b'.repeat(64),
          },
          {
            relativePath: 'data/items-base.json',
            collection: 'itemType',
            identity: 'G|PHB',
            provenanceType: 'approved-dependency',
            srdVersion: '5.1',
            officialSection: 'Equipment',
            reason: 'Required, "compact" metadata.',
            recordSha256: 'a'.repeat(64),
          },
        ],
      },
    })

    const lines = report.trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('"reviewStatus","officialLocation","reviewNotes"')
    expect(lines[1]).toContain('"data/items-base.json","itemType","G|PHB"')
    expect(lines[1]).toContain('"Required, ""compact"" metadata."')
    expect(lines[1]).toMatch(/,"","",""$/)
    expect(lines[2]).toContain('"data/spells/spells-xphb.json","spell","Light|XPHB"')
  })

  test('rejects a manifest without record-level coverage', () => {
    expect(() => buildSrdReviewInventory({})).toThrow('no per-record review inventory')
  })
})
