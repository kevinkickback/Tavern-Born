import type {
  Class5e,
  ClassFeature,
  ClassFeatureReference,
  SubclassFeatureReference,
} from '@/types/5etools'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import type { UnconditionalFeatureReference } from './unconditionalFeatureReferences'

type FeatureKind = 'classFeature' | 'subclassFeature'
type FeatureReference = ClassFeatureReference | SubclassFeatureReference

interface RequiredSetupRule {
  kind: FeatureKind
  ref: string
  markers: readonly string[]
  message: string
  replacedBy?: string
  replaces?: string
}

// Bounded, source-audited unsupported setup; not a census or a prose/count inference rule.
// Sources: configured 5etools data/class/class-{barbarian,sorcerer,ranger,mystic}.json.
const RULES: readonly RequiredSetupRule[] = [
  {
    kind: 'subclassFeature',
    ref: 'Storm Aura|Barbarian|PHB|Storm Herald|XGE|3|XGE',
    markers: ['choose desert, sea, or tundra'],
    message:
      'Storm Aura requires an environment choice. Tavern Born does not yet support this setup or its dependent benefits.',
  },
  {
    kind: 'classFeature',
    ref: 'Favored Enemy|Ranger|PHB|1|PHB',
    markers: ['choose a type of favored enemy:', 'you choose one additional favored enemy'],
    message:
      'Favored Enemy requires enemy and associated language choices. Tavern Born does not yet support this setup.',
    replacedBy: 'Favored Foe|Ranger|PHB|1|TCE',
  },
  {
    kind: 'classFeature',
    ref: 'Natural Explorer|Ranger|PHB|1|PHB',
    markers: ['choose one type of favored terrain:', 'you choose additional favored terrain types'],
    message:
      'Natural Explorer requires favored terrain choices. Tavern Born does not yet support this setup.',
    replacedBy: 'Deft Explorer|Ranger|PHB|1|TCE',
  },
  {
    kind: 'classFeature',
    ref: 'Psionics|Mystic|UATheMysticClass|1|UATheMysticClass',
    markers: [
      'you know one psionic talent of your choice',
      'you know one psionic discipline of your choice',
    ],
    message:
      'Psionics requires talent and discipline choices. Tavern Born does not yet support this setup.',
  },
  {
    kind: 'classFeature',
    ref: 'Deft Explorer|Ranger|PHB|1|TCE',
    markers: ['choose one of your skill proficiencies', 'two additional languages of your choice'],
    message:
      'Deft Explorer requires Canny expertise and language choices. Tavern Born does not yet support this setup.',
    replaces: 'Natural Explorer|Ranger|PHB|1|PHB',
  },
]

function decode(ref: string, kind: FeatureKind) {
  return kind === 'classFeature'
    ? decodeClassFeatureReference(ref)
    : decodeSubclassFeatureReference(ref)
}

function identity(feature: FeatureReference | ClassFeature, kind: FeatureKind) {
  return kind === 'classFeature'
    ? getClassFeatureIdentity(feature)
    : getSubclassFeatureIdentity(feature)
}

const RULE_BY_TARGET = new Map(
  RULES.map((rule) => [identity(decode(rule.ref, rule.kind), rule.kind), rule]),
)

function sourceText(entries: unknown): string {
  try {
    return (
      JSON.stringify(entries, (key, value) =>
        key === 'feature' ? undefined : value,
      )?.toLowerCase() ?? ''
    )
  } catch {
    return ''
  }
}

function confirmed(rule: RequiredSetupRule, feature: FeatureReference['feature']): boolean {
  if (!feature || identity(feature, rule.kind) !== identity(decode(rule.ref, rule.kind), rule.kind))
    return false
  if (!Array.isArray(feature.entries)) return false
  const text = sourceText(feature.entries)
  if (!rule.markers.every((marker) => text.includes(marker))) return false
  if (
    rule.replaces &&
    (feature.isClassFeatureVariant !== true ||
      !text.includes(
        `which replaces the ${decodeClassFeatureReference(rule.replaces).name.toLowerCase()} feature`,
      ))
  )
    return false
  if (rule.ref.startsWith('Storm Aura|')) {
    const options = (feature.entries ?? []).find(
      (entry) =>
        !!entry &&
        typeof entry === 'object' &&
        (entry as Record<string, unknown>).type === 'options',
    ) as Record<string, unknown> | undefined
    if (!Array.isArray(options?.entries)) return false
    const targets = new Set(
      options.entries.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const record = entry as Record<string, unknown>
        return record.type === 'refSubclassFeature' && typeof record.subclassFeature === 'string'
          ? [getSubclassFeatureIdentity(decodeSubclassFeatureReference(record.subclassFeature))]
          : []
      }),
    )
    return ['Desert', 'Sea', 'Tundra'].every((name) =>
      targets.has(
        getSubclassFeatureIdentity(
          decodeSubclassFeatureReference(`${name}|Barbarian|PHB|Storm Herald|XGE|3|XGE`),
        ),
      ),
    )
  }
  return true
}

/** Reports only known, retained, unconditionally reachable declarations; never invents choices. */
export function normalizeRequiredSetupDiagnostics(
  owner: NormalizedCharacterChoice['owner'],
  declarations: readonly UnconditionalFeatureReference[],
): ClassChoiceDiagnostic[] {
  const found = new Map<string, ClassChoiceDiagnostic>()
  for (const { reference: ref, kind, target: key, level } of declarations) {
    const target = decode(ref.ref!, kind)
    const rule = RULE_BY_TARGET.get(key)
    if (!rule) continue
    const isConfirmed = confirmed(rule, ref.feature)
    const diagnostic: ClassChoiceDiagnostic = {
      code: isConfirmed ? 'unsupported-required-choice' : 'unverified-required-choice',
      className: owner.name,
      classSource: owner.source,
      ...(owner.subclassName
        ? { subclassName: owner.subclassName, subclassSource: owner.subclassSource }
        : {}),
      featureName: target.name,
      level,
      message: isConfirmed
        ? rule.message
        : target.name +
          ' has known required setup, but its exact source declaration is unavailable or changed. Restore or verify the source; this setup cannot be confirmed.',
      requiredChoice: {
        target: { entityType: kind, ref: ref.ref, name: target.name, source: target.source },
        ...(rule.replacedBy ? { replacedBy: rule.replacedBy } : {}),
        ...(rule.replaces ? { replaces: rule.replaces } : {}),
      },
    }
    const prior = found.get(key)
    if (
      !prior ||
      level < (prior.level ?? Infinity) ||
      diagnostic.code === 'unverified-required-choice'
    ) {
      found.set(key, {
        ...diagnostic,
        level: Math.min(level, prior?.level ?? Infinity),
        ...(prior?.code === 'unverified-required-choice'
          ? { code: prior.code, message: prior.message }
          : {}),
      })
    }
  }
  return [...found.values()].sort(
    (a, b) => (a.level ?? 0) - (b.level ?? 0) || a.featureName.localeCompare(b.featureName),
  )
}

function confirmsReplacement(feature: ClassFeature | undefined, marker: string): boolean {
  return (
    feature?.isClassFeatureVariant === true &&
    Array.isArray(feature.entries) &&
    sourceText(feature.entries).includes(marker)
  )
}

/** Selects active known diagnostics using the same authoritative catalog as feature choices. */
export function getActiveRequiredSetupDiagnostics(
  diagnostics: readonly ClassChoiceDiagnostic[],
  classData: Pick<Class5e, 'classFeatureRefs'>,
  includeVariants: boolean,
  features: readonly ClassFeature[] | undefined,
  ambiguousTargets?: ReadonlySet<string>,
): ClassChoiceDiagnostic[] {
  const known = diagnostics.filter((diagnostic) => diagnostic.requiredChoice)
  if (known.length === 0) return []
  const activeReplacements = new Set<string>()
  if (includeVariants && features) {
    for (const rule of RULES) {
      if (!rule.replacedBy) continue
      const target = decodeClassFeatureReference(rule.replacedBy)
      const key = getClassFeatureIdentity(target)
      if (!key || ambiguousTargets?.has(key)) continue
      const marker = `which replaces the ${decodeClassFeatureReference(rule.ref).name.toLowerCase()} feature`
      const declared = classData.classFeatureRefs?.some(
        (ref) =>
          typeof ref.ref === 'string' &&
          getClassFeatureIdentity(decodeClassFeatureReference(ref.ref)) === key &&
          ref.feature &&
          getClassFeatureIdentity(ref.feature) === key &&
          confirmsReplacement(ref.feature, marker),
      )
      if (!declared) continue
      const matches = features.filter((feature) => getClassFeatureIdentity(feature) === key)
      const feature = matches.length === 1 ? matches[0] : undefined
      if (confirmsReplacement(feature, marker)) {
        activeReplacements.add(rule.replacedBy)
      }
    }
  }
  return known.filter((diagnostic) => {
    const requirement = diagnostic.requiredChoice
    if (!requirement) return false
    if (requirement.replaces) {
      const key =
        requirement.target.ref &&
        getClassFeatureIdentity(decodeClassFeatureReference(requirement.target.ref))
      return RULES.some(
        (rule) =>
          rule.replacedBy &&
          activeReplacements.has(rule.replacedBy) &&
          getClassFeatureIdentity(decodeClassFeatureReference(rule.replacedBy)) === key,
      )
    }
    return !requirement.replacedBy || !activeReplacements.has(requirement.replacedBy)
  })
}
