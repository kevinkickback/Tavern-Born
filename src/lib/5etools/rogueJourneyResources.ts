import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import {
  getCurrentDirectSubclassSource,
  getCurrentRetainedSubclassSource,
} from './directSubclassSource'
import { classResourceProse, readPsionicPowerResource } from './fighterSubclassResources'
import { decodeOptionalDeclaration } from './optionalClassDeclarationStructure'

const maxAtGain = (level: number, max: number) =>
  Array.from({ length: 20 }, (_, index) => (index + 1 >= level ? max : 0))

export function getRogueJourneyResources(
  character: Character,
  owner: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  modifiers: AbilityScores | undefined,
  proficiency: number,
): ClassResourceDef[] {
  if (
    !catalogs ||
    character.classProgression.filter((entry) => findClassReference(owner, [entry])).length !== 1
  )
    return []
  const classes = catalogs.classes?.filter((row) => findClassReference(owner, [row]))
  if (classes?.length !== 1) return []
  const [cls] = classes
  const result: ClassResourceDef[] = []
  const stroke =
    norm(owner.name) === 'rogue'
      ? cls.classFeatureRefs?.find((row) => row.name === 'Stroke of Luck')
      : undefined
  const strokeTarget = stroke && getClassFeatureIdentity(stroke)
  if (strokeTarget && stroke.level && stroke.level <= owner.levels) {
    const feature = getCurrentDirectClassFeature(cls, catalogs, strokeTarget)
    if (
      classResourceProse(feature?.entries ?? []).includes(
        "Once you use this feature, you can't use it again until you finish a short or long rest.",
      )
    )
      result.push({
        id: 'rogue-stroke-of-luck',
        label: 'Stroke of Luck',
        maxPerLevel: maxAtGain(stroke.level, 1),
        restType: 'short',
      })
  }
  const current =
    getCurrentDirectSubclassSource(character, owner, classes, 'Rogue') ??
    getCurrentRetainedSubclassSource(character, owner, catalogs, 'Rogue')
  if (!current) return result
  const { getFeature } = current
  const rules = [
    ['Soulknife', 'Psionic Power'],
    ['Soulknife', 'Psychic Veil'],
    ['Soulknife', 'Rend Mind'],
    ['Phantom', 'Wails from the Grave'],
    ['Inquisitive', 'Unerring Eye'],
    ['Swashbuckler', 'Master Duelist'],
    ['Scion of the Three', 'Bloodthirst'],
  ] as const
  for (const [printing, name] of rules) {
    const feature = getFeature(name, printing)
    if (!feature) continue
    const id =
      feature.id === feature.target
        ? feature.target.replace(/^subclass-feature\|/, 'rogue-resource|')
        : `rogue-resource|${feature.id}`
    if (name === 'Psionic Power') {
      const def = readPsionicPowerResource(
        feature.source,
        feature.level,
        feature.entries,
        proficiency,
        {
          caption: 'Soulknife Energy Dice',
          levelColumn: 'Rogue Level',
        },
      )
      if (def) result.push({ id, ...def })
      continue
    }
    const text = classResourceProse(feature.entries).join(' ')
    const recovery =
      /You can use this feature a number of times equal to your (proficiency bonus|(Dexterity|Intelligence|Wisdom) modifier \(minimum of once\)), and you regain all expended uses(?: of it)? when you finish a long rest\./.exec(
        text,
      )
    const single =
      /(?:Once you use this feature|Once you do so), you can't use (?:it|this feature) again until you finish a short or long rest\./.test(
        text,
      )
    const psionic =
      /Once you use this feature, you can't do so again until you finish a long rest,? unless you expend (a Psionic Energy die|three Psionic Energy dice)(?: \(no action required\) to restore your use of it| to use (?:this feature|it) again)\./i.exec(
        text,
      )
    const modifier = recovery?.[2]?.toLowerCase() as keyof AbilityScores | undefined
    const uses = recovery
      ? modifier
        ? Math.max(1, modifiers?.[modifier] ?? 0)
        : proficiency
      : single || psionic
        ? 1
        : 0
    if (!uses) continue
    const upgrade = name === 'Bloodthirst' ? getFeature('Dread Incarnate', printing) : undefined
    const cutthroat = classResourceProse(upgrade?.entries ?? [])
      .map((line) =>
        /^You regain one expended use of \{@subclassFeature ([^{}]+)\} when you finish a short rest\.$/.exec(
          line,
        ),
      )
      .filter(
        (match) =>
          match &&
          decodeOptionalDeclaration(match[1], 'subclassFeature')?.target === feature.target,
      )
    const partial = cutthroat.length === 1
    result.push({
      id,
      label: name,
      maxPerLevel: maxAtGain(feature.level, uses),
      restType: single || partial ? 'short' : 'long',
      ...(partial && { recovery: { shortRest: 1, longRest: 'all' } }),
      ...(psionic && { usageText: `Spend ${psionic[1].toLowerCase()} to use this again.` }),
    })
  }
  return result
}
