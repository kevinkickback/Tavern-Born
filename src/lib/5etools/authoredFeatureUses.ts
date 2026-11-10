import { toAbilityName } from '@/lib/calculations/abilityNames'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import {
  getCurrentSelectedClass,
  getEarnedDirectClassFeature,
  permitsClassRuleSource,
} from './earnedClassFeatureSource'
import { decodeOptionalDeclaration } from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

const ability = '(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)'
const long = '\\{@variantrule Long Rest\\|XPHB\\}'
const short = '\\{@variantrule Short Rest\\|XPHB(?:\\|Short)?\\}'
const modifierUses = new RegExp(
  `^You can use this feature a number of times equal to your ${ability} modifier \\(minimum of once\\), and you regain all expended uses when you finish a ${long}\\.$`,
)
const singleUse = new RegExp(
  `^Once you use this feature, you can't use it again until you finish a (${short} or (?:a )?)?${long}\\.$`,
)
const dicePool = new RegExp(
  `(?:^|\\. )You have a pool of (d(?:4|6|8|10|12|20))s to fuel this ability\\. The number of dice in the pool equals (one plus )?your ${ability} modifier \\(minimum of one die\\)\\.$`,
)
const diceLimit = new RegExp(
  `(?:^|\\. )The maximum number of dice you can expend at once equals your ${ability} modifier \\(minimum of one die\\)\\.`,
)
const diceRecovery = new RegExp(
  `(?:^|\\. )Your pool regains all expended dice when you finish a ${long}\\.$`,
)

function readUses(entries: unknown[] | undefined) {
  if (!entries?.length) return undefined
  const end = entries[entries.length - 1]
  if (typeof end !== 'string') return undefined
  const variable = modifierUses.exec(end)
  if (variable) return { ability: toAbilityName(variable[1]), offset: 0, short: false }
  const single = singleUse.exec(end)
  if (single) return { offset: 1, short: !!single[1] }
  if (!diceRecovery.test(end)) return undefined
  const pools = entries.flatMap((entry) =>
    typeof entry === 'string' ? (dicePool.exec(entry) ?? []) : [],
  )
  const limit = diceLimit.exec(end)
  const poolAbility = toAbilityName(pools[3] ?? '')
  return pools.length === 4 && poolAbility && limit && toAbilityName(limit[1]) === poolAbility
    ? { ability: poolAbility, offset: pools[2] ? 1 : 0, short: false, die: pools[1] }
    : undefined
}

/** Derive simple standalone counters from exact earned declarations, with existing trackers taking precedence. */
export function getAuthoredFeatureUses(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  modifiers: AbilityScores | undefined,
  existing: readonly ClassResourceDef[],
): ClassResourceDef[] {
  if (!catalogs || !permitsClassRuleSource(character, 'XPHB')) return []
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  if (!cls) return []
  const names = new Set(existing.map((row) => norm(row.label.replace(/ \([^)]*\)$/, ''))))
  const define = (
    target: string,
    level: number,
    feature: { name: string; entries?: unknown[] },
  ): ClassResourceDef[] => {
    const rule = readUses(feature.entries)
    if (!rule || names.has(norm(feature.name)) || level > entry.levels) return []
    const modifier = rule.ability ? modifiers?.[rule.ability] : 0
    if (modifier === undefined) return []
    const maximum = Math.max(1, modifier + rule.offset)
    const owner = [norm(entry.name), norm(entry.source)]
    if (target.startsWith('subclass-feature|'))
      owner.push(norm(entry.subclass), norm(entry.subclassSource))
    return [
      {
        id: `feature-uses:${JSON.stringify([owner, target])}`,
        label: feature.name,
        maxPerLevel: Array.from({ length: 20 }, (_, index) => (index + 1 >= level ? maximum : 0)),
        restType: rule.short ? 'short' : 'long',
        inheritedFeature: true,
        ...(rule.die && {
          recovery: { longRest: 'all', unit: 'dice' },
          usageText: `Up to ${Math.max(1, modifier)} ${rule.die}${modifier > 1 ? 's' : ''} per use`,
        }),
      },
    ]
  }
  const classUses = (cls.classFeatureRefs ?? []).flatMap((ref) => {
    if (!ref.feature || !readUses(ref.feature.entries)) return []
    const target = getClassFeatureIdentity(ref)
    const current = target
      ? getEarnedDirectClassFeature(character, entry, catalogs, target)
      : undefined
    return current?.feature.level
      ? define(current.target, current.feature.level, current.feature)
      : []
  })
  const subclasses = cls.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  if (subclasses?.length !== 1 || !permitsClassRuleSource(character, entry.subclassSource))
    return classUses
  const [subclass] = subclasses
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
  )
  const subclassUses = collectUnconditionalFeatureReferences(
    subclass.subclassFeatureRefs ?? [],
    'subclassFeature',
  ).flatMap(({ target, level, reference }) => {
    if (level > entry.levels || !readUses(reference.feature?.entries)) return []
    const current = getOwnedSubclassFeature(cls, subclass, target, scoped)
    const decoded =
      current && decodeOptionalDeclaration(current.refs[current.refs.length - 1], 'subclassFeature')
    return current &&
      decoded &&
      'subclassSource' in decoded.decoded &&
      [decoded.decoded.source, decoded.decoded.classSource, decoded.decoded.subclassSource].every(
        (source) => permitsClassRuleSource(character, source),
      )
      ? define(target, current.level, current.feature)
      : []
  })
  return [...new Map([...classUses, ...subclassUses].map((row) => [row.id, row])).values()]
}
