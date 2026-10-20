// Native prose exceptions are confined to the separately certified complete declarations.
// Existing normalized replacement metadata supplies names; actual qualified declarations supply targets.
const norm = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
const ownerKey = (value) => JSON.stringify(value)
export function deriveOptionalNativeRules(documents, authority, pilot, optionalFeatures, api) {
  const actual = documents
    .flatMap((document) =>
      api.collect(document, new Set(authority.relations.map((row) => row.target))),
    )
    .sort((a, b) =>
      api.key(a.owner, a.target, a.level).localeCompare(api.key(b.owner, b.target, b.level)),
    )
  if (api.digest(actual) !== api.digest(authority.relations))
    throw Error('Current all-owner declaration authority changed')
  const parsed = documents.flatMap((document) => api.parse(document).classes)
  const bodies = documents.flatMap((document) => [
    ...(document.classFeature ?? []).map((row) => ({
      kind: 'classFeature',
      target: api.classIdentity(row),
      row,
    })),
    ...api
      .materialize(document.subclassFeature ?? [])
      .map((row) => ({ kind: 'subclassFeature', target: api.subclassIdentity(row), row })),
  ])
  const children = new Set(pilot.roots.flatMap((row) => row.children))
  const optionalTargets = new Set(pilot.knownOptionalTargets.map((row) => row.target))
  const originals = new Map(),
    pools = []
  const roots = authority.relations
    .filter((row) => optionalTargets.has(row.target) && !children.has(row.target))
    .map((relation) => {
      const feature = relation.features[relation.features.length - 1].body
      const old = pilot.roots.find(
        (row) => ownerKey(row.owner) === ownerKey(relation.owner) && row.target === relation.target,
      )
      if (old)
        return {
          ...old,
          original: old.replaces.length
            ? pilot.features.find((row) => row.target === old.replaces[0].target)
            : undefined,
        }
      const cls = parsed.filter(
        (row) => norm(row.name) === relation.owner[1] && norm(row.source) === relation.owner[2],
      )
      if (cls.length !== 1) throw Error('Missing/ambiguous actual class owner')
      const parent =
        relation.owner[0] === 'class'
          ? cls[0]
          : (cls[0].subclasses ?? []).filter(
              (row) =>
                norm(row.name) === relation.owner[3] && norm(row.source) === relation.owner[4],
            )[0]
      if (!parent) throw Error('Missing actual subclass owner')
      const kind = relation.owner[0] === 'class' ? 'classFeature' : 'subclassFeature'
      const declarations = api.declarations(
        parent[kind === 'classFeature' ? 'classFeatureRefs' : 'subclassFeatureRefs'] ?? [],
        kind,
      )
      const replacement = api.variant(feature)?.replacesFeatureName
      const names = replacement?.split(/\s+or\s+/i).map(norm)
      const candidates = names
        ? declarations.filter((row) => names.includes(norm(row.reference.name)))
        : []
      if (names && candidates.length !== 1)
        throw Error(
          'Replacement name does not identify exactly one actual declared target: ' +
            relation.target,
        )
      let original
      if (candidates.length) {
        const target = candidates[0].target
        const found = bodies.filter(
          (row) => row.target === target && row.kind === candidates[0].kind,
        )
        if (found.length !== 1) throw Error('Replacement original is missing/ambiguous: ' + target)
        original = { target, name: found[0].row.name, source: found[0].row.source }
        originals.set(target, { kind: found[0].kind, target, body: found[0].row })
      }
      const root = {
        owner: relation.owner,
        target: relation.target,
        name: feature.name,
        source: feature.source,
        level: relation.level,
        children: [],
        replaces: original ? [{ target: original.target }] : [],
        compatible: [],
        ...(original ? { family: 'replacement:' + original.target, original } : {}),
      }
      const members = []
      const scan = (value) => {
        if (Array.isArray(value)) {
          value.forEach(scan)
          return
        }
        if (!value || typeof value !== 'object') return
        if (value.type === 'refOptionalfeature') {
          if (typeof value.optionalfeature !== 'string')
            throw Error('Malformed native optional member')
          const parts = value.optionalfeature.split('|').map((value) => value.trim())
          if (parts.length < 1 || parts.length > 3 || !parts[0])
            throw Error('Malformed native optional member UID')
          const name = parts[0],
            source = parts[1] || 'PHB'
          const found = optionalFeatures.filter(
            (row) => norm(row.name) === norm(name) && norm(row.source) === norm(source),
          )
          if (found.length !== 1 || !Array.isArray(found[0].featureType))
            throw Error('Missing/ambiguous native optional member: ' + name)
          members.push({
            entityType: 'optionalFeature',
            name,
            source,
            featureType: found[0].featureType,
          })
          return
        }
        scan(value.entries)
      }
      scan(feature.entries)
      if (members.length) {
        const progressions = (parent.optionalfeatureProgression ?? []).filter(
          (row) =>
            Array.isArray(row.featureType) &&
            members.every((member) =>
              member.featureType.some((type) => row.featureType.includes(type)),
            ),
        )
        if (progressions.length !== 1)
          throw Error(
            'Native members must extend exactly one existing progression: ' + relation.target,
          )
        const progression = progressions[0]
        const field = `optionalfeatureProgression[${parent.optionalfeatureProgression.indexOf(progression)}]`
        const choices = (
          relation.owner[0] === 'class'
            ? api.classRules(cls[0], cls[0].classFeatureRefs ?? [])
            : api.subclassRules(cls[0], parent, parent.subclassFeatureRefs ?? [])
        ).choices.filter(
          (row) => row.source.kind === 'optional-feature-progression' && row.source.field === field,
        )
        if (choices.length !== 1) throw Error('Native pool has no unique canonical progression')
        const choice = choices[0]
        const grants = authority.standardDependencies.filter(
          (row) =>
            ownerKey(row.owner) === ownerKey(relation.owner) &&
            row.level === choice.level &&
            row.target.split('|')[1] === norm(choice.owner.featureName),
        )
        if (grants.length !== 1 || optionalTargets.has(grants[0].target))
          throw Error('Native pool has no unique standard granting dependency')
        pools.push({
          owner: relation.owner,
          target: relation.target,
          level: relation.level,
          dependency: grants[0],
          choiceId: choice.id,
          progressionField: field,
          progression,
          members: members.map(({ featureType: _, ...member }) => member),
        })
      }
      return root
    })
  return {
    version: 2,
    roots,
    originals: [...originals.values()].sort((a, b) => a.target.localeCompare(b.target)),
    pools,
  }
}
