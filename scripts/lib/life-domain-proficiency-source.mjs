import { deriveSubclassProficiencyCertificates } from './subclass-proficiency-source.mjs'

const owner = ['cleric', 'phb', 'life domain', 'phb']
const intro = 'Life Domain|Cleric||Life||1'
const leaf = 'Bonus Proficiency|Cleric||Life||1'
const clause = 'When you choose this domain at 1st level, you gain proficiency with heavy armor.'

// Exact reviewed packages in configured and bundled order. The configured root has a TCE
// declaration and printed metadata absent from the bundled root. Keep each package intact.
const reviewed = [
  [
    '1e15ee65728d9b01cf593c1c7a29217d5e014cff3a2731826e10241774139122',
    '13811cb8f2b721ba9b70581217d6df7a68184fb9e50e7a74fd20bab5d659a3f6',
    '2f7a0cb3c998ced94e390f93df0ce8e7bae7b713fbd5e69e40e362d2aed73ec5',
  ],
  [
    'd9e29d8b9ca46d83cce74f51e8af8221015cd80176394187ece0e286d0af04e7',
    '39c258d4f93e7e32c197c5673463fa6f6fb05a033ac54378b66546bf5d3d7c8f',
    'd603ec69b39565314751d0a37125ca1d056e9f2368f621e9605495bc1e589cc6',
  ],
]

export function deriveLifeDomainProficiency(configured, bundled, api) {
  const target = api.identity(api.decode(leaf))
  const introTarget = api.identity(api.decode(intro))
  const expectedPath = { target, refs: [intro, leaf], level: 1 }
  const packages = [configured, bundled].map((document, index) => {
    const roots = document.subclass.filter(
      (row) => JSON.stringify(api.owner(row)) === JSON.stringify(owner),
    )
    const intros = document.subclassFeature.filter((row) => api.identity(row) === introTarget)
    const leaves = document.subclassFeature.filter((row) => api.identity(row) === target)
    if (
      [roots, intros, leaves].some(
        (rows, part) => rows.length !== 1 || api.digest(rows[0]) !== reviewed[index][part],
      ) ||
      leaves[0].entries.length !== 1 ||
      leaves[0].entries[0] !== clause
    )
      throw new Error('Unreviewed classic Life Domain proficiency source package')
    return deriveSubclassProficiencyCertificates(
      [{ subclass: roots, subclassFeature: [...intros, ...leaves] }],
      [{ target }],
      {
        ...api,
        sourceFields: ['basicRules'],
        reviewedAncestors: [{ target: introTarget, digest: reviewed[index][1] }],
        admittedContexts: [{ owner, intro, paths: [expectedPath] }],
      },
    )
  })
  return {
    packages,
    rule: {
      target,
      name: 'Bonus Proficiency',
      className: 'Cleric',
      classSource: 'PHB',
      level: expectedPath.level,
      kind: 'fixed-training',
      training: { armor: ['heavy'] },
      digest: api.entriesDigest([clause], false),
      metadataDigest: packages[0].features.find((row) => row.target === target).metadataDigest,
      fields: packages[0].features.find((row) => row.target === target).fields,
    },
  }
}
