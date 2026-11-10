import type { Class5e, ClassFeatureReference } from '@/types/5etools'
import type {
  ClassResourceDef,
  ClassResourceRecovery,
  NormalizedClassRules,
} from '@/types/classRules'
import { normalizeClassChoices } from './classChoiceNormalization'
import { getClassFeatureIdentity, getClassFeatureReferenceLevel } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import {
  EPIC_BOON_LEVEL,
  isEpicBoonFeatureReference,
  isRevisedEpicBoonOwner,
} from './epicBoonAdvancement'
import { getFeatureSourceDigest } from './featureSourceAudit'

const ASI_FEATURE = /ability score (?:improvement|increase)|epic boon/i
const TABLE_RESOURCE_LABELS_BY_CLASS_SOURCE: Readonly<Record<string, ReadonlySet<string>>> = {
  'Barbarian|PHB': new Set(['rages']),
  'Barbarian|XPHB': new Set(['rages']),
  'Cleric|XPHB': new Set(['channel divinity']),
  'Druid|XPHB': new Set(['wild shape']),
  'Fighter|XPHB': new Set(['second wind']),
  'Monk|PHB': new Set(['ki points']),
  'Monk|XPHB': new Set(['focus points']),
  'Mystic|UATheMysticClass': new Set(['psi points']),
  'Paladin|XPHB': new Set(['channel divinity']),
  'Ranger|XPHB': new Set(['favored enemy']),
  'Sorcerer|PHB': new Set(['sorcery points']),
  'Sorcerer|XPHB': new Set(['sorcery points']),
}

const LONG_REST_RECOVERY: ClassResourceRecovery = { longRest: 'all' }
const SHORT_REST_RECOVERY: ClassResourceRecovery = { shortRest: 'all', longRest: 'all' }

// Table headings such as "Focus Points" describe a pool only when the class also
// declares the exact rules for spending and recovering it.
const INHERITED_TABLE_RESOURCES: Readonly<Record<string, readonly string[]>> = {
  rages: ['class-feature|rage|barbarian|xphb|1|xphb'],
  'channel divinity': [
    'class-feature|channel divinity|cleric|xphb|2|xphb',
    'class-feature|channel divinity|paladin|xphb|3|xphb',
  ],
  'wild shape': ['class-feature|wild shape|druid|xphb|2|xphb'],
  'second wind': ['class-feature|second wind|fighter|xphb|1|xphb'],
  'focus points': ["class-feature|monk's focus|monk|xphb|2|xphb"],
  'favored enemy': ['class-feature|favored enemy|ranger|xphb|1|xphb'],
  'sorcery points': ['class-feature|font of magic|sorcerer|xphb|2|xphb'],
}

const SORCEROUS_RESTORATION = 'class-feature|sorcerous restoration|sorcerer|xphb|5|xphb'
const SORCEROUS_RESTORATION_DIGEST =
  '31a0086f8f9174edde65ac624fd0264ffb279b7e8de25925fd48cec5ad15c703'

const FIGHTER_PROSE_RESOURCE_FIXUPS: readonly ClassResourceDef[] = [
  {
    id: 'fighter-action-surge',
    label: 'Action Surge',
    maxPerLevel: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
    restType: 'short',
    recovery: SHORT_REST_RECOVERY,
  },
  {
    id: 'fighter-indomitable',
    label: 'Indomitable',
    maxPerLevel: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
    restType: 'long',
    recovery: LONG_REST_RECOVERY,
  },
]

function twenty(value: number): number[] {
  return Array.from({ length: 20 }, () => value)
}

/** Source-qualified fixups for resources represented only in class-feature prose. */
const PROSE_RESOURCE_FIXUPS: Readonly<Record<string, ClassResourceDef[]>> = {
  'Bard|PHB': [
    {
      id: 'bard-bardic-inspiration',
      label: 'Bardic Inspiration',
      maxPerLevel: twenty(1),
      maxFormula: 'cha-mod',
      restTypeByLevel: [...Array(4).fill('long'), ...Array(16).fill('short')],
      recoveryByLevel: [
        ...Array(4).fill(LONG_REST_RECOVERY),
        ...Array(16).fill(SHORT_REST_RECOVERY),
      ],
      restType: 'long',
    },
  ],
  'Bard|XPHB': [
    {
      id: 'bard-bardic-inspiration',
      label: 'Bardic Inspiration',
      maxPerLevel: twenty(1),
      maxFormula: 'cha-mod',
      restTypeByLevel: [...Array(4).fill('long'), ...Array(16).fill('short')],
      recoveryByLevel: [
        ...Array(4).fill(LONG_REST_RECOVERY),
        ...Array(16).fill(SHORT_REST_RECOVERY),
      ],
      restType: 'long',
    },
  ],
  'Wizard|PHB': [
    {
      id: 'wizard-arcane-recovery',
      label: 'Arcane Recovery',
      maxPerLevel: twenty(1),
      restType: 'long',
      recovery: LONG_REST_RECOVERY,
    },
  ],
  'Wizard|XPHB': [
    {
      id: 'wizard-arcane-recovery',
      label: 'Arcane Recovery',
      maxPerLevel: twenty(1),
      restType: 'long',
      recovery: LONG_REST_RECOVERY,
    },
  ],
  'Fighter|PHB': [
    {
      id: 'fighter-second-wind',
      label: 'Second Wind',
      maxPerLevel: twenty(1),
      restType: 'short',
      recovery: SHORT_REST_RECOVERY,
    },
    ...FIGHTER_PROSE_RESOURCE_FIXUPS,
  ],
  'Fighter|XPHB': [...FIGHTER_PROSE_RESOURCE_FIXUPS],
  'Paladin|PHB': [
    {
      id: 'paladin-channel-divinity',
      label: 'Channel Divinity',
      maxPerLevel: [0, 0, ...Array(18).fill(1)],
      restType: 'short',
      recovery: SHORT_REST_RECOVERY,
    },
    {
      id: 'paladin-lay-on-hands',
      label: 'Lay on Hands (HP)',
      maxPerLevel: Array.from({ length: 20 }, (_, index) => (index + 1) * 5),
      restType: 'long',
      recovery: LONG_REST_RECOVERY,
    },
  ],
  'Cleric|PHB': [
    {
      id: 'cleric-channel-divinity',
      label: 'Channel Divinity',
      maxPerLevel: [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
      restType: 'short',
      recovery: SHORT_REST_RECOVERY,
    },
  ],
  'Druid|PHB': [
    {
      id: 'druid-wild-shape',
      label: 'Wild Shape',
      maxPerLevel: [0, ...Array(19).fill(2)],
      restType: 'short',
      recovery: SHORT_REST_RECOVERY,
    },
  ],
  'Paladin|XPHB': [
    {
      id: 'paladin-lay-on-hands',
      label: 'Lay on Hands (HP)',
      maxPerLevel: Array.from({ length: 20 }, (_, index) => (index + 1) * 5),
      restType: 'long',
      recovery: LONG_REST_RECOVERY,
    },
  ],
}

// These keys are the explicit, source-qualified whitelist declared above.
const CLASS_RESOURCE_RULES = [
  ...new Set([
    ...Object.keys(TABLE_RESOURCE_LABELS_BY_CLASS_SOURCE),
    ...Object.keys(PROSE_RESOURCE_FIXUPS),
  ]),
].map((key) => {
  const [name, source] = key.split('|')
  return {
    name,
    source,
    labels: TABLE_RESOURCE_LABELS_BY_CLASS_SOURCE[key],
    fixups: PROSE_RESOURCE_FIXUPS[key] ?? [],
  }
})

function parseResourceValue(value: unknown): number | 'unlimited' | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  if (value.trim().toLowerCase() === 'unlimited') return 'unlimited'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function featureText(ref: ClassFeatureReference): string {
  try {
    return JSON.stringify(ref.feature?.entries ?? '').toLowerCase()
  } catch {
    return ''
  }
}

function inferRecovery(
  label: string,
  refs: readonly ClassFeatureReference[],
): ClassResourceRecovery {
  const labelLower = label.toLowerCase()
  const matching =
    refs.find((ref) => {
      const name = ref.name.toLowerCase()
      return name.includes(labelLower) || labelLower.includes(name)
    }) ?? refs.find((ref) => featureText(ref).includes(labelLower))
  const text = matching ? featureText(matching) : ''
  return inferRecoveryFromText(text)
}

function inferRecoveryFromText(text: string): ClassResourceRecovery {
  const recovery: ClassResourceRecovery = { longRest: 'all' }
  if (/regain (?:one|1|a single)[^.]{0,240}short rest/.test(text)) {
    recovery.shortRest = 1
  } else if (
    /regain all[^.]{0,240}short rest/.test(text) ||
    (/short rest/.test(text) && /long rest/.test(text) && /regain all/.test(text))
  ) {
    recovery.shortRest = 'all'
  }

  return recovery
}

export function getClassResourceRecoveryAtLevel(
  definition: ClassResourceDef,
  levelIndex: number,
): ClassResourceRecovery {
  const explicit = definition.recoveryByLevel?.[levelIndex] ?? definition.recovery
  if (explicit) return explicit
  const restType = definition.restTypeByLevel?.[levelIndex] ?? definition.restType
  return restType === 'short' ? SHORT_REST_RECOVERY : LONG_REST_RECOVERY
}

export function formatClassResourceRecovery(recovery: ClassResourceRecovery): string {
  const shortAmount = recovery.shortRest
  const longAmount = recovery.longRest
  if (recovery.unit === 'dice' && longAmount === 'all' && shortAmount === undefined)
    return 'Restores all dice on a long rest'
  if (recovery.unit === 'points' && longAmount === 'all') {
    if (recovery.shortRestOncePerLongRest) {
      return `Restores up to ${shortAmount} points on a short rest (once per long rest). Restores all points on a long rest`
    }
    return shortAmount === undefined
      ? 'Restores all points on a long rest'
      : `Restores ${shortAmount} points on a short rest and all points on a long rest`
  }
  if (shortAmount === 'all' && longAmount === 'all') {
    return 'Restores all uses on a short or long rest'
  }

  const parts: string[] = []
  if (shortAmount !== undefined) {
    parts.push(
      `${shortAmount === 'all' ? 'all uses' : `${shortAmount} use${shortAmount === 1 ? '' : 's'}`} on a short rest`,
    )
  }
  if (longAmount !== undefined) {
    parts.push(
      `${longAmount === 'all' ? 'all uses' : `${longAmount} use${longAmount === 1 ? '' : 's'}`} on a long rest`,
    )
  }
  return `Restores ${parts.join('; ')}`
}

function normalizeId(className: string, label: string): string {
  return `${className.trim().toLowerCase()}-${label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')}`
}

export function parseTableResources(
  classData: Pick<
    Class5e,
    'name' | 'source' | 'classTableGroups' | 'classFeatures' | 'sourceIdentityConflict'
  >,
  refs: readonly ClassFeatureReference[],
): ClassResourceDef[] {
  const resources: ClassResourceDef[] = []
  const supportedLabels = findClassReference(classData, CLASS_RESOURCE_RULES)?.labels
  const inheritedRecovery = inheritedTableRecovery(classData, refs)
  const inheritedLabels = new Map<string, number>()
  for (const group of classData.classTableGroups ?? []) {
    if (
      !group ||
      typeof group !== 'object' ||
      !('colLabels' in group) ||
      !Array.isArray(group.colLabels)
    )
      continue
    for (const label of group.colLabels) {
      if (typeof label !== 'string') continue
      const key = label.trim().toLowerCase()
      inheritedLabels.set(key, (inheritedLabels.get(key) ?? 0) + 1)
    }
  }
  for (const rawGroup of classData.classTableGroups ?? []) {
    if (!rawGroup || typeof rawGroup !== 'object') continue
    const group = rawGroup as Record<string, unknown>
    const labels = Array.isArray(group.colLabels) ? group.colLabels : []
    const rows = Array.isArray(group.rows) ? group.rows.filter(Array.isArray) : []
    if (rows.length === 0) continue

    labels.forEach((rawLabel, columnIndex) => {
      const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
      const key = label.toLowerCase()
      const native = supportedLabels?.has(key)
      const inherited =
        !native && inheritedLabels.get(key) === 1 ? inheritedRecovery(key) : undefined
      if (!native && !inherited) return
      const parsedValues = rows.map((row) => parseResourceValue(row[columnIndex]))
      if (!parsedValues.every((value): value is number | 'unlimited' => value !== null)) return
      // An unlimited pool no longer needs a counter at that level, but it must not
      // invalidate the finite progression at every earlier level.
      const values = parsedValues.map((value) => (value === 'unlimited' ? 0 : value))
      if (
        values.every((value) => value === 0) ||
        (inherited &&
          (values.length !== 20 ||
            !values.every(
              (value, index) =>
                Number.isInteger(value) &&
                value >= 0 &&
                (index + 1 >= inherited.level || value === 0),
            )))
      )
        return
      const recovery = inherited?.recovery ?? inferRecovery(label, refs)
      resources.push({
        id: inherited
          ? `class-table:${JSON.stringify([classData.name.trim().toLowerCase(), classData.source.trim().toLowerCase(), key])}`
          : normalizeId(classData.name, label),
        label,
        maxPerLevel: values as number[],
        restType: recovery.shortRest !== undefined ? 'short' : 'long',
        recovery,
        ...(inherited && { declarationTarget: inherited.target }),
        ...(inherited?.recoveryByLevel && { recoveryByLevel: inherited.recoveryByLevel }),
      })
    })
  }
  return resources
}

function inheritedTableRecovery(
  cls: Pick<Class5e, 'name' | 'source' | 'classFeatures' | 'sourceIdentityConflict'>,
  refs: readonly ClassFeatureReference[],
) {
  const owner = { ...cls, classFeatureRefs: [...refs] } as Class5e
  const catalog = { classFeatures: refs.flatMap((ref) => (ref.feature ? [ref.feature] : [])) }
  const direct = (target: string) => getCurrentDirectClassFeature(owner, catalog, target)
  return (
    label: string,
  ):
    | {
        level: number
        target: string
        recovery: ClassResourceRecovery
        recoveryByLevel?: ClassResourceRecovery[]
      }
    | undefined => {
    const candidates = INHERITED_TABLE_RESOURCES[label]?.map(direct).filter((feature) => !!feature)
    if (candidates?.length !== 1) return undefined
    const [feature] = candidates
    const level = feature.level
    const target = getClassFeatureIdentity(feature)
    if (!level || !target) return undefined
    const text = JSON.stringify(feature.entries ?? '').toLowerCase()
    const recovery = inferRecoveryFromText(text)
    if (label === 'focus points') {
      if (!/it is unavailable until you finish a [^.]+short rest[^.]+ or [^.]+long rest/.test(text))
        return undefined
      return { level, target, recovery: SHORT_REST_RECOVERY }
    }
    if (!/regain all[^.]+long rest/.test(text)) return undefined
    if (label === 'sorcery points') {
      recovery.unit = 'points'
      const restoration = direct(SORCEROUS_RESTORATION)
      const recoveryByLevel =
        restoration?.entries &&
        getFeatureSourceDigest(restoration.entries, false) === SORCEROUS_RESTORATION_DIGEST
          ? Array.from(
              { length: 20 },
              (_, index): ClassResourceRecovery =>
                index < 4
                  ? recovery
                  : {
                      ...recovery,
                      shortRest: Math.floor((index + 1) / 2),
                      shortRestOncePerLongRest: true,
                    },
            )
          : undefined
      return { level, target, recovery, recoveryByLevel }
    }
    return { level, target, recovery }
  }
}

export function normalizeClassRules(
  classData: Pick<
    Class5e,
    | 'name'
    | 'source'
    | 'edition'
    | 'sourceIdentityConflict'
    | 'classTableGroups'
    | 'classFeatures'
    | 'optionalfeatureProgression'
  >,
  refs: readonly ClassFeatureReference[],
): NormalizedClassRules {
  const resources = parseTableResources(classData, refs)
  const seen = new Set(resources.map((resource) => resource.id))
  for (const fixup of findClassReference(classData, CLASS_RESOURCE_RULES)?.fixups ?? []) {
    if (!seen.has(fixup.id)) resources.push(fixup)
  }

  const asiLevels = refs
    .filter((ref) =>
      isRevisedEpicBoonOwner(classData) && isEpicBoonFeatureReference(ref)
        ? getClassFeatureReferenceLevel(ref) === EPIC_BOON_LEVEL
        : ASI_FEATURE.test(ref.name),
    )
    .map(getClassFeatureReferenceLevel)
    .filter((level): level is number => typeof level === 'number')
    .filter((level, index, levels) => levels.indexOf(level) === index)
    .sort((left, right) => left - right)
  const ritualCasting = refs.some(
    (ref) => /ritual casting/i.test(ref.name) || /ritual/.test(featureText(ref)),
  )
  const normalizedChoices = normalizeClassChoices(classData, refs)

  return {
    resources,
    asiLevels,
    ritualCasting,
    choices: normalizedChoices.choices,
    choiceDiagnostics: normalizedChoices.diagnostics,
  }
}
