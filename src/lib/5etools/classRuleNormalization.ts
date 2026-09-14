import type { Class5e, ClassFeatureReference } from '@/types/5etools'

export type ClassResourceMaxFormula = 'cha-mod'

export interface ClassResourceDef {
  id: string
  label: string
  maxPerLevel: readonly number[]
  restType: 'short' | 'long'
  restTypeByLevel?: readonly ('short' | 'long')[]
  maxFormula?: ClassResourceMaxFormula
}

export interface NormalizedClassRules {
  resources: ClassResourceDef[]
  asiLevels: number[]
  ritualCasting: boolean
}

const NON_RESOURCE_LABEL =
  /bonus|damage|dice?|movement|speed|range|known|prepared|spell slots?|slot level/i
const ASI_FEATURE = /ability score (?:improvement|increase)|epic boon/i

function getReferenceLevel(ref: ClassFeatureReference): number | undefined {
  const encodedLevel = Number.parseInt(ref.ref.split('|')[3] ?? '', 10)
  return Number.isNaN(encodedLevel) ? ref.level : encodedLevel
}

function twenty(value: number): number[] {
  return Array.from({ length: 20 }, () => value)
}

/** Source-qualified fixups for legacy resources not represented in class tables. */
const LEGACY_RESOURCE_FIXUPS: Readonly<Record<string, ClassResourceDef[]>> = {
  'Bard|PHB': [
    {
      id: 'bard-bardic-inspiration',
      label: 'Bardic Inspiration',
      maxPerLevel: twenty(1),
      maxFormula: 'cha-mod',
      restTypeByLevel: [...Array(4).fill('long'), ...Array(16).fill('short')],
      restType: 'long',
    },
  ],
  'Bard|XPHB': [
    {
      id: 'bard-bardic-inspiration',
      label: 'Bardic Inspiration',
      maxPerLevel: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6],
      restType: 'short',
    },
  ],
  'Wizard|PHB': [
    {
      id: 'wizard-arcane-recovery',
      label: 'Arcane Recovery',
      maxPerLevel: twenty(1),
      restType: 'long',
    },
  ],
  'Wizard|XPHB': [
    {
      id: 'wizard-arcane-recovery',
      label: 'Arcane Recovery',
      maxPerLevel: twenty(1),
      restType: 'short',
    },
  ],
  'Fighter|PHB': [
    {
      id: 'fighter-second-wind',
      label: 'Second Wind',
      maxPerLevel: twenty(1),
      restType: 'short',
    },
    {
      id: 'fighter-action-surge',
      label: 'Action Surge',
      maxPerLevel: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
      restType: 'short',
    },
    {
      id: 'fighter-indomitable',
      label: 'Indomitable',
      maxPerLevel: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
      restType: 'long',
    },
  ],
  'Paladin|PHB': [
    {
      id: 'paladin-channel-divinity',
      label: 'Channel Divinity',
      maxPerLevel: [0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
      restType: 'short',
    },
    {
      id: 'paladin-lay-on-hands',
      label: 'Lay on Hands (HP)',
      maxPerLevel: Array.from({ length: 20 }, (_, index) => (index + 1) * 5),
      restType: 'long',
    },
  ],
  'Cleric|PHB': [
    {
      id: 'cleric-channel-divinity',
      label: 'Channel Divinity',
      maxPerLevel: [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3],
      restType: 'short',
    },
  ],
  'Druid|PHB': [
    {
      id: 'druid-wild-shape',
      label: 'Wild Shape',
      maxPerLevel: [0, ...Array(19).fill(2)],
      restType: 'short',
    },
  ],
}

function parseResourceValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim().toLowerCase() === 'unlimited') return null
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

function inferRestType(label: string, refs: readonly ClassFeatureReference[]): 'short' | 'long' {
  const labelLower = label.toLowerCase()
  const matching = refs.find((ref) => {
    const name = ref.name.toLowerCase()
    return name.includes(labelLower) || labelLower.includes(name)
  })
  const text = matching ? featureText(matching) : ''
  if (/short rest/.test(text)) return 'short'
  return 'long'
}

function normalizeId(className: string, label: string): string {
  return `${className.toLowerCase()}-${label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')}`
}

function parseTableResources(
  classData: Pick<Class5e, 'name' | 'classTableGroups'>,
  refs: readonly ClassFeatureReference[],
): ClassResourceDef[] {
  const resources: ClassResourceDef[] = []
  for (const rawGroup of classData.classTableGroups ?? []) {
    if (!rawGroup || typeof rawGroup !== 'object') continue
    const group = rawGroup as Record<string, unknown>
    const labels = Array.isArray(group.colLabels) ? group.colLabels : []
    const rows = Array.isArray(group.rows) ? group.rows.filter(Array.isArray) : []
    if (rows.length === 0) continue

    labels.forEach((rawLabel, columnIndex) => {
      const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
      if (!label || label.includes('{@') || NON_RESOURCE_LABEL.test(label)) return
      const values = rows.map((row) => parseResourceValue(row[columnIndex]))
      if (values.some((value) => value === null) || values.every((value) => value === 0)) return
      resources.push({
        id: normalizeId(classData.name, label),
        label,
        maxPerLevel: values as number[],
        restType: inferRestType(label, refs),
      })
    })
  }
  return resources
}

export function normalizeClassRules(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups'>,
  refs: readonly ClassFeatureReference[],
): NormalizedClassRules {
  const resources = parseTableResources(classData, refs)
  const seen = new Set(resources.map((resource) => resource.id))
  for (const fixup of LEGACY_RESOURCE_FIXUPS[`${classData.name}|${classData.source}`] ?? []) {
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

  return { resources, asiLevels, ritualCasting }
}
