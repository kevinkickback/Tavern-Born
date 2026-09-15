import type { Class5e, ClassFeatureReference } from '@/types/5etools'
import type {
  ClassResourceDef,
  ClassResourceRecovery,
  NormalizedClassRules,
} from '@/types/classRules'
import { normalizeClassChoices } from './classChoiceNormalization'

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

function getReferenceLevel(ref: ClassFeatureReference): number | undefined {
  const encodedLevel = Number.parseInt(ref.ref.split('|')[3] ?? '', 10)
  return Number.isNaN(encodedLevel) ? ref.level : encodedLevel
}

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
      maxPerLevel: [0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
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
  return `${className.toLowerCase()}-${label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')}`
}

function parseTableResources(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups'>,
  refs: readonly ClassFeatureReference[],
): ClassResourceDef[] {
  const resources: ClassResourceDef[] = []
  const supportedLabels =
    TABLE_RESOURCE_LABELS_BY_CLASS_SOURCE[`${classData.name}|${classData.source}`]
  for (const rawGroup of classData.classTableGroups ?? []) {
    if (!rawGroup || typeof rawGroup !== 'object') continue
    const group = rawGroup as Record<string, unknown>
    const labels = Array.isArray(group.colLabels) ? group.colLabels : []
    const rows = Array.isArray(group.rows) ? group.rows.filter(Array.isArray) : []
    if (rows.length === 0) continue

    labels.forEach((rawLabel, columnIndex) => {
      const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
      if (!supportedLabels?.has(label.toLowerCase())) return
      const parsedValues = rows.map((row) => parseResourceValue(row[columnIndex]))
      if (!parsedValues.every((value): value is number | 'unlimited' => value !== null)) return
      // An unlimited pool no longer needs a counter at that level, but it must not
      // invalidate the finite progression at every earlier level.
      const values = parsedValues.map((value) => (value === 'unlimited' ? 0 : value))
      if (values.every((value) => value === 0)) return
      const recovery = inferRecovery(label, refs)
      resources.push({
        id: normalizeId(classData.name, label),
        label,
        maxPerLevel: values as number[],
        restType: recovery.shortRest !== undefined ? 'short' : 'long',
        recovery,
      })
    })
  }
  return resources
}

export function normalizeClassRules(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups' | 'optionalfeatureProgression'>,
  refs: readonly ClassFeatureReference[],
): NormalizedClassRules {
  const resources = parseTableResources(classData, refs)
  const seen = new Set(resources.map((resource) => resource.id))
  for (const fixup of PROSE_RESOURCE_FIXUPS[`${classData.name}|${classData.source}`] ?? []) {
    if (!seen.has(fixup.id)) resources.push(fixup)
  }

  const asiLevels = refs
    .filter((ref) => ASI_FEATURE.test(ref.name))
    .map(getReferenceLevel)
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
