// This one prose schedule has no structured proficiency field in 5etools.
// Its complete declaration and parent pool already belong to the reviewed source certificate.
export function deriveOptionalClassProficiencyRules(documents, authority, api) {
  const target = 'class-feature|primal knowledge|barbarian|phb|3|tce'
  const expected = authority.relations.filter((row) => row.target === target)
  const actual = documents.flatMap((document) => api.collect(document, new Set([target])))
  if (expected.length !== 1 || actual.length !== 1 || api.digest(actual) !== api.digest(expected))
    throw Error('Primal Knowledge declaration authority changed; independent assessment required')
  const row = expected[0],
    feature = row.features.at(-1).body
  if (
    JSON.stringify(row.owner) !== JSON.stringify(['class', 'barbarian', 'phb']) ||
    row.level !== 3
  )
    throw Error('Unsupported optional proficiency owner')
  const sentence = feature.entries[1]
  const schedule =
    typeof sentence === 'string' &&
    sentence.match(
      /^When you reach (\d+)(?:rd|th) level and again at (\d+)(?:rd|th) level, you gain proficiency in one skill of your choice from the list of skills available to barbarians at 1st level\.$/,
    )
  if (!schedule || feature.entries.length !== 2 || feature.isClassFeatureVariant !== true)
    throw Error('Unsupported Primal Knowledge proficiency schedule')
  const gains = schedule.slice(1).map(Number)
  if (gains[0] !== row.level || gains[1] <= gains[0] || gains[1] > 20)
    throw Error('Invalid optional proficiency gains')
  const skills = row.parentMetadata.startingProficiencies.skills
  if (!Array.isArray(skills) || skills.length !== 1 || Object.keys(skills[0]).join() !== 'choose')
    throw Error('Unsupported barbarian skill pool')
  const choose = skills[0].choose
  if (Object.keys(choose).sort().join() !== 'count,from' || !Array.isArray(choose.from))
    throw Error('Unsupported barbarian skill choice')
  const pool = choose.from.map((name) =>
    typeof name === 'string' ? name.trim().toLowerCase() : '',
  )
  if (
    pool.some((name) => !api.skills.includes(name)) ||
    new Set(pool).size !== pool.length ||
    !pool.length
  )
    throw Error('Invalid barbarian skill names')
  return [
    {
      target,
      owner: row.owner,
      rootLevel: row.level,
      gains,
      name: feature.name,
      source: feature.source,
      digest: api.digest(row),
      fields: [],
      optional: true,
      domains: [{ domain: 'skills', count: 1, skillPool: pool, excludeExisting: true }],
    },
  ]
}
