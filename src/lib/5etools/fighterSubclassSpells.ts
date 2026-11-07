import {
  formatSpellReference,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import {
  getDirectSubclassFeatureReference,
  getNativeSubclassIntroFeature,
  isInheritedFighterSubclass,
} from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import type { SubclassSpellGrant } from './subclassSpells'

export function getPsiWarriorTelekineticGrants(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant[] | undefined {
  if (norm(cls.name) !== 'fighter' || norm(subclass.shortName) !== 'psi warrior') return undefined
  const revised = norm(subclass.source) === 'xphb'
  const inherited = !revised && norm(cls.source) === 'xphb'
  const printing = revised ? 'XPHB' : 'PHB'
  if (
    !['tce', 'xphb'].includes(norm(subclass.source)) ||
    !['phb', 'xphb'].includes(norm(cls.source)) ||
    (revised && norm(cls.source) !== 'xphb') ||
    subclass.sourceIdentityConflict ||
    (inherited ? !isInheritedFighterSubclass(subclass) : '_copy' in subclass)
  )
    return []
  try {
    const [block, ...others] = parseAdditionalSpellBlocks(
      subclass.additionalSpells as AdditionalSpellBlock[],
    )
    const grant = block?.grants[0]
    if (
      !block ||
      others.length ||
      block.abilityOptions ||
      (block.ability && block.ability !== 'int') ||
      block.choices.length ||
      block.expanded?.length ||
      block.grants.length !== 1 ||
      !grant ||
      grant.level > classLevel ||
      !getCurrentNativeSubclassGain(cls, grant.level) ||
      grant.isCantrip ||
      grant.source !== 'innate' ||
      grant.dailyUses !== 1 ||
      block.scheduleIdentity.length !== 1 ||
      !block.scheduleIdentity[0].startsWith('["innate",' + grant.level + ',"daily:1",')
    )
      return []
    const target = getSubclassFeatureIdentity({
      name: 'Telekinetic Master',
      className: cls.name,
      classSource: printing,
      subclassShortName: subclass.shortName,
      subclassSource: subclass.source,
      source: subclass.source,
      level: grant.level,
    })
    const feature = target && getDirectSubclassFeatureReference(subclass, target)?.feature
    if (
      !target ||
      !feature ||
      feature.sourceIdentityConflict ||
      feature.featureOptionSourceConflict ||
      feature.isClassFeatureVariant ||
      getSubclassFeatureIdentity(feature) !== target ||
      !Array.isArray(feature.entries) ||
      feature.entries.length !== (revised ? 2 : 3)
    )
      return []
    const spellClause = feature.entries[revised ? 0 : 1]
    const useClause = feature.entries[revised ? 1 : 2]
    if (typeof spellClause !== 'string' || typeof useClause !== 'string') return []
    const spell = revised
      ? /^You always have the \{@spell ([^{}|]+\|[^{}|]+)\} spell prepared\. With this feature, you can cast it without a spell slot or components, and your spellcasting ability for it is Intelligence\./.exec(
          spellClause,
        )
      : /^Your ability to move creatures and objects with your mind is matched by few\. You can cast the \{@spell ([^{}|]+)\} spell, requiring no components, and your spellcasting ability for the spell is Intelligence\./.exec(
          spellClause,
        )
    const recovery = revised
      ? "Once you cast the spell with this feature, you can't do so in this way again until you finish a {@variantrule Long Rest|XPHB} unless you expend a Psionic Energy Die (no action required) to restore your use of it."
      : "Once you cast the spell with this feature, you can't do so again until you finish a long rest, unless you expend a Psionic Energy die to cast it again."
    const reference = (value: string) =>
      formatSpellReference(value, parseSpellReference(value).source ?? printing)
    if (
      !spell ||
      useClause !== recovery ||
      getSpellReferenceKey(reference(spell[1])) !== getSpellReferenceKey(reference(grant.spellName))
    )
      return []
    return [
      {
        spellName: inherited
          ? formatSpellReference(grant.spellName, 'XPHB')
          : reference(grant.spellName),
        level: grant.level,
        isCantrip: false,
        mode: revised ? 'prepared' : 'cast-only',
        ...(!revised && { castOnly: { ignoresComponents: true } }),
        ...(inherited && { requiresClassicReprint: true }),
        feature: {
          name: feature.name,
          target,
          castingNote:
            'Telekinetic Master: Cast without a spell slot or components using Intelligence. One use per Long Rest, with another use available by expending a Psionic Energy Die.',
        },
      },
    ]
  } catch {
    return []
  }
}

export function getFighterBanneretRitualGrants(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant[] | undefined {
  if (
    norm(cls.name) !== 'fighter' ||
    norm(cls.source) !== 'xphb' ||
    norm(subclass.name) !== 'banneret' ||
    norm(subclass.source) !== 'frhof'
  )
    return undefined
  const level = getCurrentNativeSubclassGain(cls)?.level
  if (
    !level ||
    level > classLevel ||
    subclass.sourceIdentityConflict ||
    '_copy' in subclass ||
    norm(subclass.shortName) !== 'banneret' ||
    norm(subclass.className) !== 'fighter' ||
    norm(subclass.classSource) !== 'xphb' ||
    (subclass.spellcastingAbility !== undefined && subclass.spellcastingAbility !== 'cha')
  )
    return []
  const feature = getNativeSubclassIntroFeature(cls, subclass, level, 'Knightly Envoy')
  const entries = feature?.entries
  if (!feature || !Array.isArray(entries)) return []
  const sections = entries.map(record).filter((row) => row.name === 'Comprehension')
  const [section] = sections
  if (
    sections.length !== 1 ||
    section.type !== 'entries' ||
    !Array.isArray(section.entries) ||
    section.entries.length !== 1 ||
    typeof section.entries[0] !== 'string'
  )
    return []
  const clause =
    /^You can cast the \{@spell ([^{}|]+\|[^{}|]+)\} spell but only as a \{@variantrule Ritual\|XPHB\}\. Charisma is your spellcasting ability for it\.$/.exec(
      section.entries[0],
    )
  if (!clause) return []
  try {
    const blocks = parseAdditionalSpellBlocks(subclass.additionalSpells as AdditionalSpellBlock[])
    if (blocks.length !== 1) return []
    const [block] = blocks
    const [grant] = block.grants
    if (
      block.ability !== 'cha' ||
      block.abilityOptions ||
      block.choices.length ||
      block.expanded?.length ||
      block.grants.length !== 1 ||
      grant.isCantrip ||
      block.scheduleIdentity.length !== 1 ||
      !block.scheduleIdentity[0].startsWith(`["innate",${level},"ritual",`) ||
      getSpellReferenceKey(grant.spellName) !== getSpellReferenceKey(clause[1])
    )
      return []
    return [
      {
        spellName: grant.spellName,
        level,
        isCantrip: false,
        mode: 'cast-only',
        castOnly: { castingTime: 'Ritual only' },
        feature: {
          name: 'Knightly Envoy',
          target: feature.target,
          castingNote:
            'Knightly Envoy: Cast only as a ritual. Charisma is your spellcasting ability.',
        },
      },
    ]
  } catch {
    return []
  }
}
