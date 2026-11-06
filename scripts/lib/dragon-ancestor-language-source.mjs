import { deriveSubclassProficiencyCertificates } from './subclass-proficiency-source.mjs'

const owner = ['sorcerer', 'phb', 'draconic bloodline', 'phb']
const gain = 'Sorcerous Origin|Sorcerer||1'
const intro = 'Draconic Bloodline|Sorcerer||Draconic||1'
const leaf = 'Dragon Ancestor|Sorcerer||Draconic||1'
const bundledDigests = [
  'd7c3619438545320f7d82ddd2495759b1b65721f0d15e963cf7b78e5b21af22a',
  'a984ef0236f2c62c5abb54bab32f41072c0477490042052f603348a8c0f677e6',
  '12d71ce63084fb3a004bc82b0ed67a254e3f29d66e8551165cc0db489b6200e9',
]

export function deriveDragonAncestorLanguage(configured, bundled, api) {
  const introTarget = api.identity(api.decode(intro))
  const target = api.identity(api.decode(leaf))
  const roots = bundled.subclass.filter(
    (row) => JSON.stringify(api.owner(row)) === JSON.stringify(owner),
  )
  const intros = bundled.subclassFeature.filter((row) => api.identity(row) === introTarget)
  const leaves = bundled.subclassFeature.filter((row) => api.identity(row) === target)
  if (
    [roots, intros, leaves].some(
      (rows, index) => rows.length !== 1 || api.digest(rows[0]) !== bundledDigests[index],
    )
  )
    throw new Error('Unreviewed bundled Dragon Ancestor language source')

  const configuredLeaves = configured.subclassFeature.filter((row) => api.identity(row) === target)
  const [feature] = configuredLeaves
  const digest = api.entriesDigest(leaves[0].entries, false)
  const language = /^You can speak, read, and write \{@language ([^|{}]+)\}\. /.exec(
    leaves[0].entries[2],
  )?.[1]
  if (
    !language ||
    configuredLeaves.length !== 1 ||
    api.entriesDigest(feature.entries, false) !== digest
  )
    throw new Error('Configured and bundled Dragon Ancestor language clauses disagree')

  for (const document of [configured, bundled]) {
    const classes = document.class.filter(
      (row) => row.name === feature.className && row.source === feature.classSource,
    )
    const declarations = classes[0]?.classFeatures?.filter(
      (row) => row?.gainSubclassFeature === true,
    )
    if (
      classes.length !== 1 ||
      '_copy' in classes[0] ||
      !declarations?.length ||
      api.digest(declarations[0]) !==
        api.digest({ classFeature: gain, gainSubclassFeature: true }) ||
      declarations.filter((row) => api.decodeClass(row.classFeature).level === feature.level)
        .length !== 1
    )
      throw new Error('Unreviewed native Sorcerous Origin gain declaration')
  }

  const paths = [{ target, refs: [intro, leaf], level: feature.level }]
  const certificate = deriveSubclassProficiencyCertificates(
    [{ subclass: roots, subclassFeature: [...intros, ...leaves] }],
    [{ target }],
    {
      ...api,
      reviewedAncestors: [{ target: introTarget, digest: bundledDigests[1] }],
      admittedContexts: [{ owner, intro, paths }],
    },
  )
  return {
    package: { ...certificate, fixedOnly: true },
    rule: {
      target,
      name: feature.name,
      className: feature.className,
      classSource: feature.classSource,
      level: feature.level,
      kind: 'fixed-languages',
      subclassGain: { owner, target: api.classIdentity(api.decodeClass(gain)) },
      languages: [language.toLowerCase()],
      // The unqualified 5etools language tag defaults to PHB.
      languageSource: 'PHB',
      digest,
      metadataDigest: api.digest(api.metadata(feature)),
      fields: Object.keys(feature).sort(),
    },
  }
}
