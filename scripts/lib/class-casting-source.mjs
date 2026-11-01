import fs from 'node:fs'
import path from 'node:path'

/** Use production parsing/copy preparation; the explicit reviewed target set supplies meaning. */
export async function deriveClassCastingRegistry(
  server,
  root,
  targets,
  bundledRoot = 'resources/srd/core/data',
) {
  const declarations = await server.ssrLoadModule(
    '/src/lib/5etools/optionalClassDeclarationStructure.ts',
  )
  const casting = await server.ssrLoadModule('/src/lib/5etools/classCastingStructure.ts')
  /** @type {typeof import('../../src/lib/5etools/classCastingStructure.ts').classifyCastingDomains} */
  const classifyCastingDomains = casting.classifyCastingDomains
  const { parseClassDocument } = await server.ssrLoadModule('/src/lib/5etools/parsers/classes.ts')
  const { getEffectiveSpellcastingClassData } = await server.ssrLoadModule(
    '/src/lib/5etools/classData.ts',
  )
  const files = []
  const read = (file, source = 'native') => {
    const bytes = fs.readFileSync(path.join(source === 'native' ? root : bundledRoot, file))
    files.push({ source, file, bytes })
    return JSON.parse(bytes)
  }
  const index = read('class/index.json')
  const documents = [...new Set(Object.values(index))].sort().map((file) => ({
    file,
    raw: read('class/' + file),
  }))
  const rawClasses = documents.flatMap(({ raw }) => raw.class ?? [])
  const classes = documents.flatMap(({ raw }) => parseClassDocument(raw).classes)
  const relations = documents.flatMap(({ raw }) =>
    declarations.collectOptionalDeclarationCertificates(raw, new Set(targets)),
  )
  const parentKeys = new Set(relations.map((relation) => casting.castingParentKey(relation.owner)))
  const standardNames = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard'])
  const standard = (row) =>
    ['phb', 'xphb'].includes(row.source?.trim().toLowerCase()) &&
    standardNames.has(row.name?.trim().toLowerCase()) &&
    row.casterProgression === 'full'
  for (const row of classes)
    if (standard(row)) parentKeys.add(casting.castingParentKey(casting.getCastingParentOwner(row)))
  const parents = [...parentKeys].sort().map((key) => {
    const found = rawClasses.filter(
      (row) => JSON.stringify(casting.getCastingParentOwner(row)) === key,
    )
    const parsed = classes.filter(
      (row) => JSON.stringify(casting.getCastingParentOwner(row)) === key,
    )
    if (found.length !== 1 || parsed.length !== 1 || found[0]._copy)
      throw Error('Ambiguous casting parent ' + key)
    return {
      owner: JSON.parse(key),
      rawDigest: declarations.optionalDeclarationDigest(casting.castingParentProjection(found[0])),
      parsedDigest: declarations.optionalDeclarationDigest(
        casting.castingParentProjection(parsed[0], true),
      ),
      standard: standard(parsed[0]),
    }
  })
  const producers = relations.map((relation) => {
    const parent = classes.find(
      (row) =>
        JSON.stringify(casting.getCastingParentOwner(row)) ===
        casting.castingParentKey(relation.owner),
    )
    const sub =
      relation.owner[0] === 'subclass'
        ? parent.subclasses.find(
            (row) =>
              JSON.stringify(declarations.getOptionalDeclarationOwner(row, 'subclass')) ===
              JSON.stringify(relation.owner),
          )
        : undefined
    const effective = getEffectiveSpellcastingClassData(parent, sub)
    const arcanum =
      relation.owner[0] === 'class' &&
      relation.owner[1] === 'warlock' &&
      relation.target.startsWith('class-feature|mystic arcanum')
    const arcanumLevel = 6 + (relation.level - 11) / 2
    if (
      arcanum &&
      (![11, 13, 15, 17].includes(relation.level) ||
        JSON.stringify(
          Object.entries(effective.spellsKnownProgressionFixedByLevel?.[relation.level] ?? {}),
        ) !== JSON.stringify([[String(arcanumLevel), 1]]))
    )
      throw Error('Unsupported Arcanum schedule ' + relation.target)
    const domains = arcanum
      ? { 'class-arcanum': [{ level: relation.level, count: 1, spellLevel: arcanumLevel }] }
      : classifyCastingDomains(effective)
    const suppliers = Object.fromEntries(
      [
        'spellcastingAbility',
        'casterProgression',
        'spellSlotProgression',
        'cantripProgression',
        'spellsKnownProgression',
        'spellsKnownProgressionFixed',
        'preparedSpells',
        'preparedSpellsProgression',
        'preparedSpellsChange',
      ].map((field) => [field, sub?.[field] != null ? 'subclass' : 'class']),
    )
    const phbSchool =
      relation.target.startsWith('subclass-feature|spellcasting|') &&
      relation.target.endsWith('|3|phb')
        ? relation.target.includes('|eldritch knight|')
          ? ['A', 'V']
          : relation.target.includes('|arcane trickster|')
            ? ['E', 'I']
            : undefined
        : undefined
    return {
      declaration: declarations.summarizeOptionalDeclarationCertificate(relation),
      parent: casting.castingParentKey(relation.owner),
      suppliers,
      domains,
      ...(phbSchool ? { schools: phbSchool, unrestrictedGains: [3, 8, 14, 20] } : {}),
    }
  })
  const bundledIndex = read('class/index.json', 'bundled')
  const bundledDocuments = [...new Set(Object.values(bundledIndex))]
    .sort()
    .map((file) => read('class/' + file, 'bundled'))
  const bundledRelations = bundledDocuments.flatMap((document) =>
    declarations.collectOptionalDeclarationCertificates(document, new Set(targets)),
  )
  const bundledClasses = bundledDocuments.flatMap(
    (document) => parseClassDocument(document).classes,
  )
  for (const relation of bundledRelations) {
    const key = declarations.optionalDeclarationKey(relation.owner, relation.target, relation.level)
    const producer = producers.find(
      (row) =>
        declarations.optionalDeclarationKey(
          row.declaration.owner,
          row.declaration.target,
          row.declaration.level,
        ) === key,
    )
    if (!producer || relation.owner[0] !== 'class')
      throw Error('Unreviewed bundled casting relation ' + key)
    const cls = bundledClasses.filter(
      (row) => JSON.stringify(casting.getCastingParentOwner(row)) === producer.parent,
    )
    const parent = parents.find((row) => JSON.stringify(row.owner) === producer.parent)
    if (!parent || cls.length !== 1 || !casting.castingParsedParentMatches(cls[0], parent))
      throw Error('Bundled casting dependency differs ' + key)
    const alternative = declarations.summarizeOptionalDeclarationCertificate(relation)
    if (
      declarations.optionalDeclarationDigest(alternative.path) !==
        declarations.optionalDeclarationDigest(producer.declaration.path) ||
      declarations.optionalDeclarationDigest(
        alternative.features.map((row) => [row.kind, row.target]),
      ) !==
        declarations.optionalDeclarationDigest(
          producer.declaration.features.map((row) => [row.kind, row.target]),
        )
    )
      throw Error('Bundled casting dependency path differs ' + key)
    const packages = [producer.declaration, ...(producer.declarationAlternatives ?? [])]
    if (!packages.some((row) => row.certificate === alternative.certificate))
      producer.declarationAlternatives = [...(producer.declarationAlternatives ?? []), alternative]
  }
  return { registry: { version: 1, targets, parents, producers }, relations, files }
}
