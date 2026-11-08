import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import {
  decodeOptionalDeclaration,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import { parseSpellToken } from './spellTokens'

const numberWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

function rulesText(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => {
    if (typeof entry === 'string')
      return [
        entry.replace(/\{@variantrule (Short Rest|Long Rest|Reaction)\|XPHB\}/g, (_, text) =>
          text.toLowerCase(),
        ),
      ]
    const row = record(entry)
    const children =
      row.type === 'list' ? row.items : row.type === 'entries' ? row.entries : undefined
    return Array.isArray(children) ? rulesText(children) : []
  })
}

export function getCurrentArtificerRules(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const owners = character.classProgression.filter((entry) => norm(entry.name) === 'artificer')
  const [owner] = owners
  if (
    owners.length !== 1 ||
    !catalogs ||
    !getSourceCompatibility(owner.source, character.originSystem).compatible ||
    (character.allowedSources?.length &&
      !getEffectiveSources(character.allowedSources, character.originSystem).some(
        (source) => norm(source) === norm(owner.source),
      ))
  )
    return undefined
  const classes = catalogs.classes?.filter((cls) => findClassReference(owner, [cls]))
  if (classes?.length !== 1) return undefined
  const [cls] = classes
  return {
    owner,
    cls,
    feature(name: string) {
      const refs = cls.classFeatureRefs?.filter((ref) => ref.name === name)
      const ref = refs?.length === 1 ? refs[0] : undefined
      const target = ref && getClassFeatureIdentity(ref)
      if (!ref?.level || ref.level > owner.levels || !target) return undefined
      const feature = getCurrentDirectClassFeature(cls, catalogs, target)
      return feature
        ? { name, target, level: ref.level, lines: rulesText(feature.entries ?? []) }
        : undefined
    },
  }
}

export function getArtificerItemCapacity(
  current: NonNullable<ReturnType<typeof getCurrentArtificerRules>>,
) {
  const { cls } = current
  const producer =
    cls.source === 'TCE'
      ? { edition: 'classic', name: 'Infuse Item', label: 'Infused Items', known: 'infusions' }
      : cls.source === 'EFA'
        ? { edition: 'one', name: 'Replicate Magic Item', label: 'Magic Items', known: 'plans' }
        : undefined
  if (!producer || (cls.edition !== undefined && cls.edition !== producer.edition)) return undefined
  const { name, label, known } = producer
  const feature = current.feature(name)
  if (
    !feature ||
    feature.target !==
      getClassFeatureIdentity({
        name,
        level: feature.level,
        className: cls.name,
        classSource: cls.source,
        source: cls.source,
      })
  )
    return undefined
  const columns = (current.cls.classTableGroups ?? []).flatMap((value) => {
    const group = record(value)
    if (!Array.isArray(group.colLabels) || !Array.isArray(group.rows)) return []
    return group.colLabels.flatMap((column, index) =>
      column === label ? [{ rows: group.rows as unknown[], index }] : [],
    )
  })
  if (columns.length !== 1) return undefined
  const { rows, index } = columns[0]
  const row = rows[current.owner.levels - 1]
  const amount = Array.isArray(row) ? Number(row[index]) : NaN
  return Number.isInteger(amount) && amount > 0
    ? { target: feature.target, label, amount, known }
    : undefined
}

export function getArtificerGrantedCantrip(current: ReturnType<typeof getCurrentArtificerRules>) {
  if (current?.cls.edition !== 'one') return undefined
  const feature = current.feature("Tinker's Magic")
  const spells = feature?.lines.flatMap((line) => {
    const match = /^You know the \{@spell ([^{}#]+)\} cantrip\.$/.exec(line)
    const reference = match && parseSpellToken(match[1]).name
    return reference ? [reference] : []
  })
  return feature && spells?.length === 1 ? { feature, reference: spells[0] } : undefined
}

export function getArtificerAttunementLimit(
  current: ReturnType<typeof getCurrentArtificerRules>,
  base: number,
) {
  const limits = ['Magic Item Adept', 'Magic Item Savant', 'Advanced Artifice', 'Magic Item Master']
    .flatMap((name) => current?.feature(name)?.lines ?? [])
    .flatMap((line) => {
      const match = /^You can (?:now )?attune to up to ([a-z]+) magic items at once\.$/.exec(line)
      return match ? [numberWords.indexOf(match[1]) + 1] : []
    })
  return Math.max(base, ...limits)
}

export function getArtificerAttunedSaveBonus(
  current: ReturnType<typeof getCurrentArtificerRules>,
  attunedCount: number,
) {
  if (!attunedCount || norm(current?.owner.source) !== 'tce') return undefined
  const feature = current?.feature('Soul of Artifice')
  const matches = feature?.lines.flatMap((line) => {
    const match =
      /^You gain a \+([1-9]) bonus to all saving throws per magic item you are currently attuned to\.$/.exec(
        line,
      )
    return match ? [Number(match[1])] : []
  })
  return feature && matches?.length === 1
    ? { feature, value: matches[0] * attunedCount }
    : undefined
}

export function getArtificerClassResources(
  character: Character,
  owner: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  intelligence: number | undefined,
): ClassResourceDef[] {
  if (norm(owner.name) !== 'artificer') return []
  const current = getCurrentArtificerRules(character, catalogs)
  if (!current || current.owner !== owner) return []
  const flash = current.feature('Flash of Genius')
  if (!flash) return []
  const count = flash.lines.filter((line) =>
    /^You can (?:use this feature|take this reaction) a number of times equal to your Intelligence modifier \(minimum of once\)\. You regain all expended uses when you finish a long rest\.$/.test(
      line,
    ),
  )
  if (count.length !== 1) return []
  const refersToFlash = (uid: string) =>
    decodeOptionalDeclaration(uid, 'classFeature')?.target === flash.target
  const refreshed = current.feature('Advanced Artifice')?.lines.some((line) => {
    const match =
      /^When you finish a short rest, you regain one expended use of your \{@classFeature ([^{}]+)\} feature\.$/.exec(
        line,
      )
    return match && refersToFlash(match[1])
  })
  const guidance = current.feature('Soul of Artifice')?.lines.some((line) => {
    const match =
      /^When you finish a short rest, you regain all expended uses of your \{@classFeature ([^{}]+)\} if you have \{@variantrule Attunement\|XPHB\} to at least one magic item\.$/.exec(
        line,
      )
    return match && refersToFlash(match[1])
  })
  const attuned = character.equipment?.some((item) => item.attuned)
  return [
    {
      id: 'artificer-flash-of-genius',
      label: flash.name,
      maxPerLevel: Array.from({ length: 20 }, (_, index) =>
        index + 1 >= flash.level ? Math.max(1, intelligence ?? 0) : 0,
      ),
      restType: refreshed || (guidance && attuned) ? 'short' : 'long',
      recovery: {
        longRest: 'all',
        ...(guidance && attuned ? { shortRest: 'all' } : refreshed ? { shortRest: 1 } : {}),
      },
      ...(guidance && {
        usageText:
          'Magical Guidance restores all uses on a Short Rest while attuned to at least one magic item.',
      }),
    },
  ]
}
