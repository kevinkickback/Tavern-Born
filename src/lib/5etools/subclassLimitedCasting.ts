import { toAbilityName } from '@/lib/calculations/abilityNames'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getEarnedDirectClassFeature, permitsClassRuleSource } from './earnedClassFeatureSource'
import {
  decodeOptionalDeclaration,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'
import type { SubclassSpellGrant } from './subclassSpells'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

function spellKeys(value: string) {
  const matches = [...value.matchAll(/\{@spell ([^|#{}]+\|[^|#{}]+)\}/g)]
  const tags = matches.map(([tag]) => tag)
  const list =
    tags.length < 3
      ? tags.join(' or ')
      : `${tags.slice(0, -1).join(', ')}, or ${tags[tags.length - 1]}`
  return value === list
    ? matches.map(([, reference]) => getSpellReferenceKey(reference)).sort()
    : undefined
}

export function getLimitedSubclassCasts(
  cls: Class5e,
  subclass: Subclass5e,
  entry: CharacterClassEntry,
  level: number,
  character: Character | undefined,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): SubclassSpellGrant[] {
  if (
    !character ||
    !catalogs ||
    !permitsClassRuleSource(character, entry.source) ||
    !permitsClassRuleSource(character, subclass.source)
  )
    return []
  const blocks = subclass.additionalSpells
  if (blocks?.length !== 1 || !blocks[0] || blocks[0].name) return []
  const block = blocks[0]
  const ability = typeof block.ability === 'string' && toAbilityName(block.ability)
  if (!ability) return []
  const abilityLabel = ability[0].toUpperCase() + ability.slice(1)
  const abilityClause = `${abilityLabel} is your spellcasting ability for these spells.`
  const refs = collectUnconditionalFeatureReferences(
    subclass.subclassFeatureRefs ?? [],
    'subclassFeature',
  )
  return Object.entries(record(block.innate)).flatMap(([rawLevel, usage]) => {
    if (!/^(?:[1-9]|1[0-9]|20)$/.test(rawLevel) || Number(rawLevel) > level) return []
    const cast = record(usage)
    const [mode] = Object.keys(cast)
    if (Object.keys(cast).length !== 1 || (mode !== 'rest' && mode !== 'resource')) return []
    const uses = record(cast[mode])
    const spells = uses['1']
    if (
      Object.keys(uses).length !== 1 ||
      !Array.isArray(spells) ||
      !spells.length ||
      !spells.every((spell) => typeof spell === 'string' && /^[^|#{}]+\|[^|#{}]+$/.test(spell))
    )
      return []
    const expected = spells.map((spell) => getSpellReferenceKey(spell)).sort()
    if (new Set(expected).size !== expected.length) return []
    const declarations = refs
      .filter((ref) => ref.level === Number(rawLevel))
      .flatMap((ref) => {
        const source = getOwnedSubclassFeature(cls, subclass, ref.target, catalogs)
        if (
          !source ||
          ![source.feature.source, source.feature.classSource, source.feature.subclassSource].every(
            (value) => permitsClassRuleSource(character, value),
          )
        )
          return []
        const entries = source.feature.entries ?? []
        const clause = entries[0]
        if (typeof clause !== 'string') return []
        const sentences = clause.split(/(?<=\.) /)
        if (sentences.pop() !== abilityClause) return []
        if (mode === 'resource') {
          const resource =
            /^(?:You|In addition, you) can expend a use of your \{@classFeature ([^{}]+)\} to cast (.+)\.$/.exec(
              sentences[sentences.length - 1] ?? '',
            )
          const target = resource && decodeOptionalDeclaration(resource[1], 'classFeature')?.target
          const cost = target && getEarnedDirectClassFeature(character, entry, catalogs, target)
          if (
            !resource ||
            !cost ||
            record(source.feature.consumes).name !== cost.feature.name ||
            record(block).resourceName !== cost.feature.name ||
            JSON.stringify(spellKeys(resource[2])) !== JSON.stringify(expected)
          )
            return []
          return [
            {
              source,
              note: `Spend one use of ${cost.feature.name} to cast without a spell slot. ${abilityClause}`,
            },
          ]
        }
        const casts = sentences.flatMap(
          (sentence) =>
            /^(?:You|When you do so, you) cast the (.+) spell without expending a spell slot or needing Material components\.$/.exec(
              sentence,
            )?.[1] ?? [],
        )
        const recovery = entries[1]
        if (
          expected.length !== 2 ||
          casts.length !== 1 ||
          JSON.stringify(spellKeys(casts[0])) !== JSON.stringify(expected) ||
          typeof recovery !== 'string' ||
          !/^After you cast either spell in this way, you can't use this feature again until you finish a \{@variantrule Short Rest\|[^{}]+\} or \{@variantrule Long Rest\|[^{}]+\}\.$/.test(
            recovery,
          )
        )
          return []
        return [
          {
            source,
            note: `One shared use per Short or Long Rest, without a spell slot or Material components. ${abilityClause}`,
          },
        ]
      })
    if (declarations.length !== 1) return []
    const [{ source, note }] = declarations
    return spells.map(
      (spell): SubclassSpellGrant => ({
        spellName: spell,
        level: source.level,
        isCantrip: false,
        mode: 'cast-only',
        requiresVisibleSpellRank: true,
        castOnly: mode === 'rest' ? { ignoresMaterial: true } : {},
        feature: {
          name: source.feature.name,
          target: source.target,
          castingNote: `${source.feature.name}: ${note}`,
        },
      }),
    )
  })
}
