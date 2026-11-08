import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import {
  deriveClassProficiencyRules,
  deriveFaerunLanguagePool,
  deriveLanguagePool,
  validateExpertiseRule,
} from './lib/class-proficiency-source.mjs'
import conditionalContexts from './lib/conditional-proficiency-contexts.json' with { type: 'json' }
import {
  deriveConditionalProficiencyRules,
  validateConditionalSubclassProgression,
} from './lib/conditional-proficiency-source.mjs'
import { deriveDragonAncestorLanguage } from './lib/dragon-ancestor-language-source.mjs'
import {
  deriveConcreteToolNames,
  deriveFixedProficiencyRules,
} from './lib/fixed-proficiency-source.mjs'
import { deriveLifeDomainProficiency } from './lib/life-domain-proficiency-source.mjs'
import { emitSharedRegistryModule } from './lib/shared-registry-source.mjs'
import subclassAncestorSemantics from './lib/subclass-proficiency-ancestor-semantics.json' with {
  type: 'json',
}
import {
  deriveSubclassProficiencyCertificates,
  deriveSubclassProficiencyRules,
  deriveToolGroupPool,
} from './lib/subclass-proficiency-source.mjs'
import toolCopySemantics from './lib/tool-proficiency-copy-semantics.json' with { type: 'json' }

// Explicit development command. Never regenerate trusted mechanical descriptors on application load.
const root = process.argv.find((arg) => arg.startsWith('--data='))?.slice(7) ?? 'data'
const checking = process.argv.includes('--check')
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const inputs = []
const read = (file) => {
  const bytes = fs.readFileSync(path.join(root, file))
  inputs.push({ file, sha256: sha(bytes) })
  return JSON.parse(bytes.toString())
}
const index = read('class/index.json')
const documents = [...new Set(Object.values(index))].sort().map((file) => read(`class/${file}`))
const bundledClericPath = 'resources/srd/core/data/class/class-cleric.json'
const bundledClericBytes = fs.readFileSync(bundledClericPath)
const bundledSorcererPath = 'resources/srd/core/data/class/class-sorcerer.json'
const bundledSorcererBytes = fs.readFileSync(bundledSorcererPath)
const bundledBardPath = 'resources/srd/core/data/class/class-bard.json'
const bundledBardBytes = fs.readFileSync(bundledBardPath)
const features = documents.flatMap((document) => document.classFeature ?? [])
const itemDocuments = [read('items.json'), read('items-base.json')]
const optionalRecords = read('optionalfeatures.json').optionalfeature
const variants = read('variantrules.json').variantrule
const rules = variants.filter((row) => row.name === 'Expertise' && row.source === 'XPHB')
validateExpertiseRule(rules)
const book = read('book/book-xphb.json')
const languages = deriveLanguagePool(book)
const banneretLanguages = [
  ...new Map(
    [
      ...languages.names.map((name) => [name, 'XPHB']),
      ...deriveFaerunLanguagePool(read('book/book-frhof.json')),
    ].map((entry) => [JSON.stringify(entry), entry]),
  ).values(),
].sort(([left], [right]) => left.localeCompare(right))
const server = await createServer({
  configFile: 'config/vite.e2e.ts',
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const {
    getClassFeatureIdentity,
    getSubclassFeatureIdentity,
    decodeSubclassFeatureReference,
    decodeClassFeatureReference,
  } = await server.ssrLoadModule('/src/lib/5etools/classFeatureIdentity.ts')
  const { getFeatureSourceDigest } = await server.ssrLoadModule(
    '/src/lib/5etools/featureSourceAudit.ts',
  )
  const derived = deriveClassProficiencyRules(features, {
    classes: documents.flatMap((document) => document.class ?? []),
    languagePool: languages.names,
    identity: getClassFeatureIdentity,
    digest: getFeatureSourceDigest,
  })
  const preparation = await server.ssrLoadModule('/src/lib/5etools/subclassSourcePreparation.ts')
  const certificates = await server.ssrLoadModule(
    '/src/lib/5etools/subclassProficiencyCertificates.ts',
  )
  const { getSubclassIntroReference } = await server.ssrLoadModule(
    '/src/lib/5etools/subclassContent.ts',
  )
  const { getItemTypeCodes, isSelectableEquipmentItem } = await server.ssrLoadModule(
    '/src/lib/calculations/itemClassification.ts',
  )
  const tools = new Map()
  const toolsFor = (uid, category = 'AT') => {
    const key = `${uid}:${category}`
    if (!tools.has(key))
      tools.set(
        key,
        deriveToolGroupPool(
          uid,
          itemDocuments,
          { types: getItemTypeCodes, selectable: isSelectableEquipmentItem },
          category,
        ),
      )
    return tools.get(key)
  }
  const subclassDerived = deriveSubclassProficiencyRules(
    documents.flatMap((document) =>
      preparation.materializeSubclassFeatureCopies(document.subclassFeature ?? []),
    ),
    toolsFor,
    getSubclassFeatureIdentity,
    getFeatureSourceDigest,
    banneretLanguages,
  )
  const fixed = deriveFixedProficiencyRules(documents, {
    toolDocuments: itemDocuments,
    materializeFeatures: preparation.materializeSubclassFeatureCopies,
    subclassIdentity: getSubclassFeatureIdentity,
    classIdentity: getClassFeatureIdentity,
    decodeClass: decodeClassFeatureReference,
    entriesDigest: getFeatureSourceDigest,
    digest: certificates.subclassProficiencyDigest,
    metadata: certificates.subclassProficiencyMetadata,
  })
  const { getClassChoiceOptionKey } = await server.ssrLoadModule(
    '/src/lib/character/classChoiceIdentity.ts',
  )
  const { isAuditedNaturalExplorerFeature } = await server.ssrLoadModule(
    '/src/lib/5etools/naturalExplorerSource.ts',
  )
  const { NATURAL_EXPLORER_TARGET } = await server.ssrLoadModule(
    '/src/lib/5etools/naturalExplorerIdentity.ts',
  )
  const conditional = deriveConditionalProficiencyRules(documents, optionalRecords, {
    materializeFeatures: preparation.materializeSubclassFeatureCopies,
    materializeRoots: preparation.materializeSubclassCopies,
    identity: getSubclassFeatureIdentity,
    classIdentity: getClassFeatureIdentity,
    optionalIdentity: (row) =>
      getClassChoiceOptionKey({
        entityType: 'optionalFeature',
        name: row.name,
        source: row.source,
      }),
    digest: certificates.subclassProficiencyDigest,
    terrainTarget: NATURAL_EXPLORER_TARGET,
    isTerrainSource: isAuditedNaturalExplorerFeature,
  })
  for (const feature of fixed.features) {
    if (feature.startingSkillFallbacks) {
      subclassDerived.push({
        target: feature.target,
        digest: feature.digest,
        fields: feature.fields,
        optional: false,
        subclassGainPosition: feature.subclassGainPosition,
        startingSkillPoolBase: [],
        domains: feature.startingSkillFallbacks.map((trigger) => ({
          domain: 'skills',
          count: 1,
          skillPool: null,
          excludeExisting: true,
          trigger,
        })),
      })
      continue
    }
    if (!feature.fallback) continue
    subclassDerived.push({
      target: feature.target,
      digest: feature.digest,
      fields: feature.fields,
      optional: false,
      proficiencyAtGain: feature.fallback.name,
      ...(feature.subclassGain && { subclassGainTarget: feature.subclassGain.target }),
      ...(feature.subclassGainPosition && { subclassGainPosition: feature.subclassGainPosition }),
      domains: [
        feature.fallback.savingThrowPool
          ? {
              domain: 'savingThrows',
              count: feature.fallback.count,
              savingThrowPool: feature.fallback.savingThrowPool,
            }
          : {
              domain: 'skills',
              count: feature.fallback.count,
              skillPool: feature.fallback.skillPool,
            },
      ],
    })
  }
  subclassDerived.sort((left, right) => left.target.localeCompare(right.target))
  const { resolveCopiedRecords } = await server.ssrLoadModule('/src/lib/5etools/copyResolution.ts')
  const { assessConcreteToolProficiency } = await server.ssrLoadModule(
    '/src/lib/5etools/concreteToolProficiencies.ts',
  )
  const rawTools = itemDocuments.flatMap((doc) => [...(doc.item ?? []), ...(doc.baseitem ?? [])])
  const resolvedTools = resolveCopiedRecords(rawTools, 'item')
  const { prepareToolProficiencySources, assessToolProficiencySource } = await server.ssrLoadModule(
    '/src/lib/5etools/toolProficiencySource.ts',
  )
  const preparedTools = prepareToolProficiencySources(
    rawTools,
    resolvedTools.records,
    toolCopySemantics.certificates,
  )
  for (const certificate of toolCopySemantics.certificates) {
    if (
      preparedTools.filter(
        (item) => assessToolProficiencySource(item, [certificate]).kind === 'ineligible',
      ).length !== 1
    )
      throw new Error(
        'Reviewed copied-tool semantics changed; independent source assessment required.',
      )
  }
  const toolNames = deriveConcreteToolNames(preparedTools, (item) =>
    assessConcreteToolProficiency(item, toolCopySemantics.certificates),
  )
  const subclassCertificateApi = {
    materializeRoots: preparation.materializeSubclassCopies,
    materializeFeatures: preparation.materializeSubclassFeatureCopies,
    identity: getSubclassFeatureIdentity,
    decode: decodeSubclassFeatureReference,
    copyKey: certificates.getSubclassCopyLookupKey,
    paths: certificates.collectSubclassProficiencyPaths,
    owner: certificates.getSubclassProficiencyOwner,
    digest: certificates.subclassProficiencyDigest,
    entriesDigest: getFeatureSourceDigest,
    metadata: certificates.subclassProficiencyMetadata,
    intro: getSubclassIntroReference,
    rootDigest: certificates.subclassProficiencyRootDigest,
    featureDigest: certificates.subclassProficiencyFeatureDigest,
    featureEntries: certificates.getSubclassProficiencyEntries,
    validateProgression: (root) => {
      const [progression] = Array.isArray(root.optionalfeatureProgression)
        ? root.optionalfeatureProgression
        : []
      const fighterProgression =
        root.name === 'Battle Master' && ['PHB', 'XPHB'].includes(root.source)
          ? ['Maneuvers', 'MV:B']
          : root.name === 'Arcane Archer' && ['XGE', 'AU'].includes(root.source)
            ? ['Arcane Shots', 'AS']
            : undefined
      if (
        root.className === 'Fighter' &&
        root.shortName === root.name &&
        fighterProgression &&
        root.optionalfeatureProgression?.length === 1 &&
        progression?.name === fighterProgression[0] &&
        JSON.stringify(progression.featureType) === JSON.stringify(fighterProgression.slice(1)) &&
        progression.progression &&
        Object.keys(progression.progression).length &&
        Object.keys(progression).length === 3 &&
        Object.entries(progression.progression).every(
          ([level, count]) =>
            /^(?:[1-9]|1[0-9]|20)$/.test(level) && Number.isSafeInteger(count) && count > 0,
        )
      )
        return
      if (
        root.className === 'Bard' &&
        ['PHB', 'XPHB'].includes(root.classSource) &&
        root.name === 'College of Swords' &&
        root.source === 'XGE' &&
        getFeatureSourceDigest(root.optionalfeatureProgression) ===
          getFeatureSourceDigest([
            { name: 'Fighting Style', featureType: ['FS:B'], progression: { 3: 1 } },
          ])
      )
        return
      validateConditionalSubclassProgression(root, conditional.features)
    },
    admittedContexts: conditionalContexts.contexts,
  }
  const subclassCertificates = deriveSubclassProficiencyCertificates(
    documents,
    [
      ...subclassDerived,
      ...fixed.features.filter(
        (row) =>
          row.target.startsWith('subclass-feature|') &&
          !row.fallback &&
          !row.startingSkillFallbacks,
      ),
      ...conditional.features.filter((row) => row.target.startsWith('subclass-feature|')),
    ],
    subclassCertificateApi,
  )
  const life = deriveLifeDomainProficiency(
    documents.find((document) =>
      document.class?.some((row) => row.name === 'Cleric' && row.source === 'PHB'),
    ),
    JSON.parse(bundledClericBytes),
    subclassCertificateApi,
  )
  const dragonAncestor = deriveDragonAncestorLanguage(
    documents.find((document) =>
      document.class?.some((row) => row.name === 'Sorcerer' && row.source === 'PHB'),
    ),
    JSON.parse(bundledSorcererBytes),
    {
      ...subclassCertificateApi,
      classIdentity: getClassFeatureIdentity,
      decodeClass: decodeClassFeatureReference,
    },
  )
  const bundledBard = JSON.parse(bundledBardBytes)
  const bundledLore = deriveSubclassProficiencyRules(
    bundledBard.subclassFeature,
    toolsFor,
    getSubclassFeatureIdentity,
    getFeatureSourceDigest,
  )
  const bundledLoreCertificates = bundledLore.map((rule) =>
    deriveSubclassProficiencyCertificates([bundledBard], [rule], {
      ...subclassCertificateApi,
      admittedContexts: [],
      reviewedAncestors: subclassAncestorSemantics.bundledBardAncestors,
    }),
  )
  subclassCertificates.packages = [
    ...life.packages,
    dragonAncestor.package,
    ...bundledLoreCertificates,
  ]
  fixed.features.push(life.rule, dragonAncestor.rule)
  fixed.features.sort((left, right) => left.target.localeCompare(right.target))
  const provenance = {
    purpose:
      'Reviewed development-time semantic checkpoint; runtime validates complete granting source and filtered vocabulary.',
    upstream:
      '5etools b9061583536101068b3a59d27e886d1fa664e366 UID/copy handling; rendering Expertise prerequisites supplies no character choice model.',
    inputs,
    bundledLifeDomainInput: { file: bundledClericPath, sha256: sha(bundledClericBytes) },
    bundledDragonAncestorInput: { file: bundledSorcererPath, sha256: sha(bundledSorcererBytes) },
    bundledBardInput: { file: bundledBardPath, sha256: sha(bundledBardBytes) },
    dragonAncestorLanguageSource: {
      file: 'scripts/lib/dragon-ancestor-language-source.mjs',
      sha256: sha(fs.readFileSync('scripts/lib/dragon-ancestor-language-source.mjs')),
    },
    lifeDomainProficiencyDependencies: [
      'scripts/lib/life-domain-proficiency-source.mjs',
      'scripts/lib/subclass-proficiency-source.mjs',
    ].map((file) => ({ file, sha256: sha(fs.readFileSync(file)) })),
    toolClassificationDependencies: [
      'scripts/lib/artificer-proficiency-source.mjs',
      'scripts/lib/fixed-proficiency-source.mjs',
      'src/lib/calculations/itemClassification.ts',
      'src/lib/5etools/copyResolution.ts',
      'src/lib/5etools/concreteToolProficiencies.ts',
      'src/lib/5etools/concreteToolClassification.ts',
      'src/lib/5etools/toolProficiencySource.ts',
      'scripts/lib/tool-proficiency-copy-semantics.json',
      'src/lib/5etools/rulesetMetadata.ts',
    ].map((file) => ({ file, sha256: sha(fs.readFileSync(file)) })),
    conditionalProficiencyDependencies: [
      'scripts/lib/conditional-proficiency-source.mjs',
      'scripts/lib/conditional-proficiency-semantics.json',
      'scripts/lib/conditional-proficiency-contexts.json',
      'scripts/lib/subclass-proficiency-ancestor-semantics.json',
      'scripts/lib/shared-registry-source.mjs',
      'src/lib/5etools/naturalExplorerSource.ts',
    ].map((file) => ({ file, sha256: sha(fs.readFileSync(file)) })),
    dependencies: [
      {
        file: 'variantrules.json',
        identity: 'Expertise|XPHB',
        entriesDigest: getFeatureSourceDigest(rules[0].entries, false),
      },
      ...languages.tables.map(({ value, path: section }) => ({
        file: 'book/book-xphb.json',
        section: section.join('.'),
        identity: `Choose Languages; ${value.caption}|XPHB`,
        entriesDigest: getFeatureSourceDigest([value], false),
      })),
      ...[...tools].map(([uid, pool]) => ({
        file: 'items.json',
        identity: `itemGroup:${uid}`,
        entriesDigest: getFeatureSourceDigest([pool.group], false),
        memberIdentities: pool.members,
      })),
    ],
  }
  for (const [file, value] of [
    ['src/lib/5etools/classProficiencyRules.generated.json', derived],
    ['src/lib/5etools/subclassProficiencyRules.generated.json', subclassDerived],
    ['src/lib/5etools/subclassProficiencyCertificates.generated.ts', subclassCertificates],
    ['src/lib/5etools/fixedProficiencyRules.generated.json', { ...fixed, toolNames }],
    ['src/lib/5etools/conditionalProficiencyRules.generated.json', conditional],
    ['src/lib/5etools/toolProficiencyCopySemantics.generated.json', toolCopySemantics.certificates],
    ['scripts/generated/class-proficiency-inputs.json', provenance],
  ]) {
    const text = execFileSync(
      process.execPath,
      ['node_modules/@biomejs/biome/bin/biome', 'format', '--stdin-file-path', file],
      {
        input: file.endsWith('.ts')
          ? emitSharedRegistryModule(value, 'scripts/generate-class-proficiency-rules.mjs', true)
          : `${JSON.stringify(value, null, 2)}\n`,
        encoding: 'utf8',
        windowsHide: true,
      },
    )
    if (checking) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
        throw new Error(`Source-derived checkpoint changed: ${file}`)
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, text)
    }
  }
  console.log(
    `${checking ? 'Verified' : 'Generated'} ${derived.length} class and ${subclassDerived.length} subclass targets, ${subclassCertificates.roots.length} certified owners; ${languages.names.length} chapter2 language names; all consumed input hashes pinned.`,
  )
} finally {
  await server.close()
}
