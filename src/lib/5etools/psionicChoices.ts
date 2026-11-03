import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, ClassFeature, Subclass5e } from '@/types/5etools'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import {
  getPsionicChoiceId,
  PSIONIC_CLASS_SOURCE,
  PSIONIC_ORDERS,
  PSIONIC_ROOT_REF,
  PSIONIC_ROOT_TARGET,
  type PsionicPool,
  psionicBonusRef,
} from './psionicIdentity'
import { isAuditedPsionicSource } from './psionicSources'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

type Owner = NormalizedCharacterChoice['owner']
type ClassInput = {
  name?: string
  source?: string
  sourceIdentityConflict?: true
  classFeatureRefs?: Class5e['classFeatureRefs']
  classTableGroups?: Class5e['classTableGroups']
}
type SubclassInput = Partial<
  Pick<Subclass5e, 'name' | 'source' | 'subclassFeatureRefs' | 'sourceIdentityConflict'>
>
const norm = (s: string | undefined) => s?.trim().toLowerCase() ?? ''
const introTarget = getClassFeatureIdentity(
  decodeClassFeatureReference(
    'Psionic Disciplines and Talents|Mystic|UATheMysticClass|1|UATheMysticClass',
  ),
)!

function currentSource(
  target: string,
  owner: Owner,
  declarations: ReturnType<typeof collectUnconditionalFeatureReferences>,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): ClassFeature | undefined {
  const matches = declarations.filter((row) => row.target === target && row.level === 1)
  if (matches.length !== 1 || !isAuditedPsionicSource(matches[0].reference.feature, target))
    return undefined
  const reference = matches[0].reference
  const actual = target.startsWith('subclass-feature|')
    ? getSubclassFeatureIdentity(reference)
    : getClassFeatureIdentity(reference)
  if (
    ('sourceIdentityConflict' in reference && reference.sourceIdentityConflict) ||
    actual !== target
  )
    return undefined
  if (!catalogs) return matches[0].reference.feature
  const candidates = target.startsWith('class-feature|')
    ? catalogs.classFeatureCandidates !== undefined
      ? (catalogs.classFeatureCandidates.get(target) ?? [])
      : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
    : catalogs.subclassTargets
      ? (catalogs.subclassTargets.candidatesByOwner
          .get(
            getFeatureOwnerKey(owner.name, owner.source, owner.subclassName, owner.subclassSource),
          )
          ?.get(target) ?? [])
      : catalogs.subclassFeatureCandidates !== undefined
        ? (catalogs.subclassFeatureCandidates.get(target) ?? [])
        : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target)
  // Filtering produces independent refs/level-group copies within one qualified owner.
  // Raw competitors already carry audit conflicts; every current copy must still prove this target.
  return candidates.length > 0 && candidates.every((row) => isAuditedPsionicSource(row, target))
    ? candidates[0]
    : undefined
}
function tableCounts(classData: ClassInput, type: 'T' | 'D'): number[] | undefined {
  const label = `{@filter ${type === 'T' ? 'Talents' : 'Disciplines'} Known|psionics|type=${type}}`
  const columns = (classData.classTableGroups ?? []).flatMap((group) => {
    if (!group || typeof group !== 'object') return []
    const row = group as { colLabels?: unknown; rows?: unknown }
    return Array.isArray(row.colLabels)
      ? row.colLabels.flatMap((v, i) => (v === label ? [{ rows: row.rows, column: i }] : []))
      : []
  })
  if (columns.length !== 1 || !Array.isArray(columns[0].rows) || columns[0].rows.length !== 20)
    return undefined
  const values = columns[0].rows.map((row) =>
    Array.isArray(row) ? row[columns[0].column] : undefined,
  )
  return values[0] === 1 &&
    values.every(
      (v, i) =>
        typeof v === 'number' &&
        Number.isSafeInteger(v) &&
        v >= 0 &&
        (i === 0 || v >= values[i - 1]),
    )
    ? (values as number[])
    : undefined
}
function choice(
  owner: Owner,
  pool: PsionicPool,
  counts: number[],
  ref: string,
  order?: string,
): NormalizedCharacterChoice {
  return {
    id: getPsionicChoiceId(owner, pool),
    label:
      pool === 'talent'
        ? 'Psionic Talents'
        : pool === 'discipline'
          ? 'Psionic Disciplines'
          : 'Bonus Disciplines',
    kind: 'psionic',
    owner: {
      ...owner,
      featureName: pool === 'bonus-discipline' ? 'Bonus Disciplines' : 'Psionics',
      featureSource: PSIONIC_CLASS_SOURCE,
    },
    level: 1,
    minimumSelections: Math.max(...counts),
    maximumSelections: Math.max(...counts),
    selectionCountByLevel: counts,
    options: [],
    optionFilter: {
      entityType: 'psionic',
      psionicTypes: [pool === 'talent' ? 'T' : 'D'],
      ...(order ? { psionicOrders: [order] } : {}),
    },
    repeatable: false,
    replacement: { cadence: 'never' },
    source: {
      kind: pool === 'bonus-discipline' ? 'class-feature-options' : 'class-table',
      field: `${pool === 'bonus-discipline' ? 'subclassFeatureRefs' : 'classFeatureRefs'}:${ref}:entries.psionic-${pool}`,
    },
  }
}
function diagnostic(owner: Owner, name: string, ref: string): ClassChoiceDiagnostic {
  return {
    code: 'unverified-required-choice',
    className: owner.name,
    classSource: owner.source,
    ...(owner.subclassName
      ? { subclassName: owner.subclassName, subclassSource: owner.subclassSource }
      : {}),
    featureName: name,
    level: 1,
    message: `${name} setup rules are unavailable, conflicting or changed. Restore the exact Mystic source.`,
    requiredChoice: {
      target: {
        entityType: owner.type === 'subclass' ? 'subclassFeature' : 'classFeature',
        name,
        source: PSIONIC_CLASS_SOURCE,
        ref,
      },
    },
  }
}
/** Narrow certified semantic association; current table values remain data-derived. */
export function normalizePsionicChoices(
  classData: ClassInput,
  subclass: SubclassInput | undefined,
  catalogs?: ClassChoiceFeatureCatalogs,
): { choices: NormalizedCharacterChoice[]; diagnostics: ClassChoiceDiagnostic[] } {
  const choices: NormalizedCharacterChoice[] = [],
    diagnostics: ClassChoiceDiagnostic[] = []
  if (norm(classData.name) !== 'mystic' || norm(classData.source) !== norm(PSIONIC_CLASS_SOURCE))
    return { choices, diagnostics }
  const owner: Owner = { type: 'class', name: classData.name!, source: classData.source! }
  const declarations = collectUnconditionalFeatureReferences(
    classData.classFeatureRefs ?? [],
    'classFeature',
  )
  const root = !classData.sourceIdentityConflict
    ? currentSource(PSIONIC_ROOT_TARGET, owner, declarations, catalogs)
    : undefined
  const intro = currentSource(introTarget, owner, declarations, catalogs)
  const talents = tableCounts(classData, 'T'),
    disciplines = tableCounts(classData, 'D')
  const capacity = (type: string) =>
    catalogs?.psionics?.filter((row) => row.type === type && !row.psionicSourceConflict).length ?? 0
  const bounded =
    talents &&
    disciplines &&
    (!capacity('T') || Math.max(...talents) <= capacity('T')) &&
    (!capacity('D') || Math.max(...disciplines) <= capacity('D'))
  if (root && intro && talents && disciplines && bounded)
    choices.push(
      choice(owner, 'talent', talents, PSIONIC_ROOT_REF),
      choice(owner, 'discipline', disciplines, PSIONIC_ROOT_REF),
    )
  else diagnostics.push(diagnostic(owner, 'Psionics', PSIONIC_ROOT_REF))
  if (!subclass?.name || !subclass.source) return { choices, diagnostics }
  const order = PSIONIC_ORDERS.find((o) => norm(`Order of the ${o}`) === norm(subclass.name))
  if (!order || norm(subclass.source) !== norm(PSIONIC_CLASS_SOURCE))
    return { choices, diagnostics }
  const subowner: Owner = {
    ...owner,
    type: 'subclass',
    subclassName: subclass.name,
    subclassSource: subclass.source,
  }
  const subdecl = collectUnconditionalFeatureReferences(
    subclass.subclassFeatureRefs ?? [],
    'subclassFeature',
  )
  const introRef = `Order of the ${order}|Mystic|${PSIONIC_CLASS_SOURCE}|${order}|${PSIONIC_CLASS_SOURCE}|1|${PSIONIC_CLASS_SOURCE}`
  const subintro = getSubclassFeatureIdentity(decodeSubclassFeatureReference(introRef))!
  const bonusRef = psionicBonusRef(order),
    bonus = getSubclassFeatureIdentity(decodeSubclassFeatureReference(bonusRef))!
  const validIntro = !subclass.sourceIdentityConflict
    ? currentSource(subintro, subowner, subdecl, catalogs)
    : undefined
  if (order === 'Soul Knife') {
    if (!validIntro) diagnostics.push(diagnostic(subowner, `Order of the ${order}`, introRef))
  } else if (root && intro && validIntro && currentSource(bonus, subowner, subdecl, catalogs)) {
    const feature = currentSource(bonus, subowner, subdecl, catalogs)!
    const text = JSON.stringify(feature.entries)
    const count = /learn (\w+) additional psionic disciplines/.exec(text)?.[1]
    if (count === 'two' && text.includes(`|type=D|order=${order}`))
      choices.push(choice(subowner, 'bonus-discipline', Array(20).fill(2), bonusRef, order))
    else diagnostics.push(diagnostic(subowner, 'Bonus Disciplines', bonusRef))
  } else diagnostics.push(diagnostic(subowner, 'Bonus Disciplines', bonusRef))
  return { choices, diagnostics }
}

/** Validity is a multiset relation, never a range check or first-row-wins allocation. */
export function psionicSlotIsCurrent(
  choice: NormalizedCharacterChoice,
  selected: readonly { slotLevel: number }[],
  slotLevel: number,
  classLevel: number,
): boolean {
  let previous = 0,
    available = 0
  for (let level = 1; level <= Math.min(classLevel, 20); level++) {
    const count = choice.selectionCountByLevel[level - 1] ?? 0
    if (level === slotLevel) available = count - previous
    previous = count
  }
  return (
    slotLevel <= classLevel &&
    available > 0 &&
    selected.filter((row) => row.slotLevel === slotLevel).length <= available
  )
}
