const toolTag = /{@item ([^{}|]+)\|([^{}|]+)}/g
const fail = (feature) => {
  throw new Error(
    `Unsupported Artificer training producer: ${feature.name}|${feature.subclassSource}`,
  )
}

export function hasArtificerTrainingReferenceSources(feature) {
  const sources = feature.otherSources
  return (
    feature.className === 'Artificer' &&
    feature.classSource === 'TCE' &&
    feature.source === 'TCE' &&
    (feature.name === feature.subclassShortName ||
      ['Battle Ready', 'Tool Proficiency'].includes(feature.name)) &&
    Array.isArray(sources) &&
    sources.length === 1 &&
    sources[0]?.source === 'ERLW' &&
    Number.isInteger(sources[0].page) &&
    sources[0].page > 0 &&
    Object.keys(sources[0]).every((key) => key === 'source' || key === 'page')
  )
}

/** Decode the proficiency clauses used by both the fixed grant and historical fallback. */
export function readArtificerTraining(feature) {
  if (feature.className !== 'Artificer' || feature.source !== feature.subclassSource)
    return undefined
  const classic = feature.classSource === 'TCE' && feature.source === 'TCE'
  const revised = feature.classSource === 'EFA' && ['EFA', 'RHW'].includes(feature.source)
  if (!classic && !revised) return undefined
  const entries = feature.entries
  const section = (name, kind = 'entries') =>
    entries
      .filter((row) => row?.type === kind && row.name === name)
      .flatMap((row) => row.entries ?? row.items ?? [])
  if (feature.name === 'Battle Ready' && feature.subclassShortName === 'Battle Smith') {
    const line = classic
      ? entries.filter((row) => row?.type === 'list').flatMap((row) => row.items ?? [])[0]
      : section('Weapon Knowledge')[0]
    if (
      typeof line !== 'string' ||
      !/^You gain proficiency with {@filter martial weapons\|items\|type=martial weapon}\.(?: You can use a weapon with which you have proficiency as a {@variantrule Spellcasting Focus\|XPHB} for your Artificer spells\.)?$/i.test(
        line,
      )
    )
      fail(feature)
    return { training: { weapons: ['martial'] } }
  }
  const names = classic
    ? ['Tool Proficiency', 'Tools of the Trade']
    : feature.source === 'RHW'
      ? ["Reanimator's Skill Set"]
      : ['Tools of the Trade']
  if (!names.includes(feature.name)) return undefined
  const source = classic ? 'PHB' : 'XPHB'
  const candidates = classic
    ? entries.filter((row) => typeof row === 'string')
    : section(feature.source === 'RHW' ? "Reanimator's Tools" : 'Tool Proficiency')
  const clauses = candidates.flatMap((line) => {
    if (typeof line !== 'string') return []
    const clause =
      /(?:^|[.,] )you (?:also )?gain proficiency with ([^.]+?)\. If you already have (this(?: tool)? proficiency|one of these proficiencies), you gain proficiency with one other type of {@item ([^{}|]+)\|([^{}|]+)} of your choice( \(or with two other types if you have both\))?\.$/i.exec(
        line,
      )
    return clause ? [clause] : []
  })
  if (clauses.length !== 1) fail(feature)
  const [, text, existing, group, groupSource, second] = clauses[0]
  const toolRefs = [...text.matchAll(toolTag)].map(([, name, source]) => ({
    name: name.toLowerCase(),
    source: source.toUpperCase(),
  }))
  const shape = text.replace(toolTag, 'T').toLowerCase()
  if (
    (second
      ? !/^t and (?:the )?t$/.test(shape) || existing !== 'one of these proficiencies'
      : shape !== 't' || existing === 'one of these proficiencies') ||
    toolRefs.some((tool) => tool.source !== source) ||
    new Set(toolRefs.map((tool) => tool.name)).size !== toolRefs.length ||
    group.toLowerCase() !== "artisan's tools" ||
    groupSource.toUpperCase() !== source
  )
    fail(feature)
  const armor = classic
    ? candidates.some((line) => line.startsWith('You gain proficiency with heavy armor.'))
    : section('Armor Training').includes('You gain training with Heavy armor.')
  const martialRanged = section('Ranged Weaponry').includes(
    'You gain proficiency with {@filter Martial Ranged weapons|items|type=martial weapon;ranged weapon=sand}.',
  )
  return {
    toolRefs,
    toolGroup: `Artisan's Tools|${source}`,
    training: {
      tools: toolRefs.map((tool) => tool.name),
      ...(armor && { armor: ['heavy'] }),
      ...(martialRanged && { weapons: ['martial ranged weapons'] }),
    },
  }
}
