import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { parseSpellToken } from './spellTokens'
import type { SubclassSpellGrant } from './subclassSpells'

const uses = ['once', 'twice', 'three times']

function currentFeature(cls: Class5e, subclass: Subclass5e, name: string, level: number) {
  const refs = subclass.subclassFeatureRefs?.filter((row) => row.name === name)
  const ref = refs?.[0]
  if (
    refs?.length !== 1 ||
    !ref?.level ||
    ref.level > level ||
    !getCurrentNativeSubclassGain(cls, ref.level)
  )
    return undefined
  const target = getSubclassFeatureIdentity({
    name,
    className: cls.name,
    classSource: cls.source,
    subclassShortName: subclass.shortName,
    subclassSource: subclass.source,
    source: subclass.source,
    level: ref.level,
  })
  if (!target) return undefined
  const feature = getDirectSubclassFeatureReference(subclass, target)?.feature
  return feature?.entries &&
    !('_copy' in feature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target
    ? { name, target, level: ref.level, entries: feature.entries }
    : undefined
}

function voiceOfDeath(
  cls: Class5e,
  subclass: Subclass5e,
  level: number,
): SubclassSpellGrant | undefined {
  const rule = currentFeature(cls, subclass, 'Voice of Death', level)
  const text = rule?.entries[0]
  const cast =
    typeof text === 'string' &&
    /^You can cast \{@spell ([^{}|]+\|XPHB)\} (once|twice|three times) without a spell slot, requiring no spell components and using Dexterity as the spellcasting modifier\. You regain the ability to cast it this way when you finish a Short or Long Rest\.$/.exec(
      text,
    )
  if (
    !rule ||
    !cast ||
    rule.entries.length !== 2 ||
    rule.entries[1] !==
      'When you cast the spell, you can target one of your soul trinkets from Tokens of the Departed instead of a corpse, allowing the spirit of the creature associated with the trinket to answer.'
  )
    return undefined
  const spellName = parseSpellToken(cast[1]).name
  const count = uses.indexOf(cast[2]) + 1
  const identity = JSON.stringify([
    'innate',
    rule.level,
    `rest:${count}`,
    [JSON.stringify([getSpellReferenceKey(spellName), null])],
  ])
  try {
    const [block, ...others] = parseAdditionalSpellBlocks(
      subclass.additionalSpells as AdditionalSpellBlock[],
    )
    if (
      !block ||
      others.length ||
      block.ability !== 'dex' ||
      block.abilityOptions ||
      block.choices.length ||
      block.expanded?.length ||
      block.scheduleIdentity.length !== 1 ||
      block.scheduleIdentity[0] !== identity
    )
      return undefined
    return {
      spellName,
      level: rule.level,
      isCantrip: false,
      mode: 'cast-only',
      castOnly: { ignoresComponents: true },
      feature: {
        name: rule.name,
        target: rule.target,
        castingNote: `Voice of Death: ${count} slot-free ${count === 1 ? 'cast' : 'casts'} per Short or Long Rest. Use Dexterity. You can target a soul trinket instead of a corpse.`,
      },
    }
  } catch {
    return undefined
  }
}

function spiritQuery(
  cls: Class5e,
  subclass: Subclass5e,
  level: number,
): SubclassSpellGrant | undefined {
  const rule = currentFeature(cls, subclass, 'Tokens of the Departed', level)
  const sections = rule?.entries
    .map(record)
    .filter(
      (row) =>
        row.type === 'entries' && row.name === 'Using Soul Trinkets' && Array.isArray(row.entries),
    )
  if (!rule || sections?.length !== 1 || !Array.isArray(sections[0].entries)) return undefined
  const clauses = sections[0].entries
    .map(record)
    .flatMap((row) =>
      row.type === 'list' && Array.isArray(row.items)
        ? row.items
            .map(record)
            .filter((item) => item.type === 'item' && item.name === 'Spirit Query')
        : [],
    )
  const text = clauses[0]?.entry
  const cast =
    typeof text === 'string' &&
    /^You can take a \{@action Magic\|XPHB\} action to destroy one soul trinket and immediately cast the \{@spell ([^{}|]+\|XPHB)\} spell, requiring no spell components and using Constitution as the spellcasting modifier\./.exec(
      text,
    )
  if (clauses.length !== 1 || !cast) return undefined
  return {
    spellName: parseSpellToken(cast[1]).name,
    level: rule.level,
    isCantrip: false,
    mode: 'cast-only',
    castOnly: { castingTime: 'Magic Action', ignoresComponents: true },
    feature: {
      name: 'Spirit Query',
      target: rule.target,
      castingNote:
        'Spirit Query: As a Magic Action, destroy one soul trinket to cast without a spell slot or components. Use Constitution.',
    },
  }
}

export function getRoguePhantomSpellGrants(cls: Class5e, subclass: Subclass5e, level: number) {
  if (
    cls.name !== 'Rogue' ||
    cls.source !== 'XPHB' ||
    subclass.shortName !== 'Phantom' ||
    subclass.source !== 'RHW'
  )
    return undefined
  if (cls.sourceIdentityConflict || subclass.sourceIdentityConflict || '_copy' in subclass)
    return []
  return [voiceOfDeath(cls, subclass, level), spiritQuery(cls, subclass, level)].filter(
    (grant) => grant !== undefined,
  )
}
