import {
  type EntityLookupSet,
  resolveBackgroundReference,
  resolveClassReference,
  resolveRaceReference,
} from '@/lib/5etools/entityResolvers'
import { type AbilityName, formatModifier } from '@/lib/calculations/abilityScores'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { getRaceTraits } from '@/lib/calculations/raceUtils'
import { deriveAllSavingThrows, deriveAllSkills } from '@/lib/calculations/skills'
import { buildSpellcastingClassDetails } from '@/lib/calculations/spellProfiles.casting'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { CUSTOM_ORGANIZATION_KEY } from '@/lib/character/organizationConstants'
import {
  getCharacterClassEntries,
  getEffectiveMaxHP,
  getTotalCharacterLevel,
} from '@/lib/characterUtils'
import { renderEntry } from '@/lib/renderer'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

type ModifierResult = { modifier: number; proficient: boolean }

export interface CharacterSheetViewModel {
  character: Character
  level: number
  classLevelSummary: string
  raceSummary: string
  proficiencyBonus: number
  abilityModifiers: Record<AbilityName, number>
  skillByName: ReadonlyMap<string, ModifierResult>
  savingThrowByAbility: ReadonlyMap<AbilityName, ModifierResult>
  effectiveArmorClass: number
  maxHP: number
  remainingHitDice: number
  resolvedClasses: readonly Class5e[]
  mergedRace: Race5e | undefined
  background: Background5e | undefined
  spellcastingDetails: ReturnType<typeof buildSpellcastingClassDetails>
  visionSummary: string
  racialTraitsSummary: string
  backgroundFeature: { name: string; description: string }
  classFeaturesSummary2014: string
  featuresSummary: string
  equipmentSummary: string
  proficienciesSummary: string
  languagesSummary: string
  featsSummary: string
  customOrganizationSummary: string
  carriedWeight: string
}

function getClassLevelSummary(character: Character): string {
  if (!Array.isArray(character.classProgression) || character.classProgression.length === 0) {
    return character.class || ''
  }
  return character.classProgression
    .filter((entry) => entry.name)
    .map((entry) => {
      const subclass = entry.subclass ? ` (${entry.subclass})` : ''
      return `${entry.name} ${entry.levels}${subclass}`
    })
    .join(' / ')
}

function getRaceSummary(character: Character): string {
  if (!character.subrace) return character.race || ''
  return `${character.subrace} ${character.race}`.trim()
}

function renderEntriesToText(entries: unknown[]): string {
  return entries
    .map((entry) =>
      (renderEntry(entry) ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ')
}

function extractBackgroundFeatureBlock(
  entries: unknown[],
): { name: string; entries: unknown[] } | null {
  const featureBlock = entries.find((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const record = entry as { name?: unknown; entries?: unknown[] }
    return (
      typeof record.name === 'string' &&
      /^feature\b/i.test(record.name) &&
      Array.isArray(record.entries)
    )
  })
  if (!featureBlock || typeof featureBlock !== 'object') return null
  const featureName = (featureBlock as { name?: unknown }).name
  const featureEntries = (featureBlock as { entries?: unknown[] }).entries
  return {
    name:
      typeof featureName === 'string' && featureName.trim().length > 0
        ? featureName.replace(/^feature\s*:?\s*/i, '').trim()
        : 'Unnamed Feature',
    entries: Array.isArray(featureEntries) ? featureEntries : [],
  }
}

function buildVisionSummary(character: Character, mergedRace?: Race5e): string {
  if (character.visions?.length) {
    return character.visions
      .map((vision) => {
        const label = vision.type.charAt(0).toUpperCase() + vision.type.slice(1)
        return vision.range != null ? `${label} ${vision.range} ft.` : label
      })
      .join(', ')
  }
  return mergedRace?.darkvision ? `Darkvision ${mergedRace.darkvision} ft.` : ''
}

function buildRacialTraitsSummary(character: Character, mergedRace?: Race5e): string {
  const provenanceFeatures = character.provenance?.features ?? {}
  const racialFeatureNames = new Set(
    Object.entries(provenanceFeatures)
      .filter(([, tags]) =>
        tags.some((tag) => tag.sourceType === 'race' || tag.sourceType === 'subrace'),
      )
      .map(([name]) => name),
  )
  const racialFeatures = character.features.filter((feature) =>
    racialFeatureNames.has(feature.name),
  )
  if (racialFeatures.length > 0) {
    return racialFeatures
      .map((feature) => {
        const body = feature.description?.trim()
        return body ? `${feature.name}: ${body}` : feature.name
      })
      .join('\n\n')
  }
  if (mergedRace) {
    const traits = getRaceTraits(mergedRace)
    if (traits.length > 0) {
      return traits
        .map((trait) => {
          const text = renderEntriesToText(trait.entries)
          return text ? `${trait.name}: ${text}` : trait.name
        })
        .join('\n\n')
    }
  }
  return character.race || ''
}

function getBackgroundFeature(
  character: Character,
  background?: Background5e,
): { name: string; description: string } {
  const provenanceFeatures = character.provenance?.features ?? {}
  const provenanceName =
    Object.entries(provenanceFeatures).find(([, tags]) =>
      tags.some((tag) => tag.sourceType === 'background'),
    )?.[0] ?? ''
  if (provenanceName) {
    const feature = character.features.find((entry) => entry.name === provenanceName)
    return { name: provenanceName, description: feature?.description?.trim() ?? '' }
  }
  if (!background?.entries) return { name: '', description: '' }
  const featureBlock = extractBackgroundFeatureBlock(background.entries)
  if (!featureBlock) return { name: '', description: '' }
  return {
    name: featureBlock.name,
    description: renderEntriesToText(featureBlock.entries),
  }
}

function buildFeaturesSummary(character: Character): string {
  return character.features
    .map((feature) => {
      const body = feature.description?.trim()
      return body ? `${feature.name}: ${body}` : feature.name
    })
    .join('\n\n')
}

function buildClassFeaturesSummary(character: Character): string {
  const provenanceFeatures = character.provenance?.features ?? {}
  if (Object.keys(provenanceFeatures).length === 0) return buildFeaturesSummary(character)
  const classFeatureNames = new Set(
    Object.entries(provenanceFeatures)
      .filter(([, tags]) =>
        tags.some(
          (tag) =>
            tag.sourceType === 'class' ||
            tag.sourceType === 'subclass' ||
            tag.sourceType === 'optionalFeature',
        ),
      )
      .map(([name]) => name),
  )
  const knownNames = new Set(Object.keys(provenanceFeatures))
  return character.features
    .filter((feature) => classFeatureNames.has(feature.name) || !knownNames.has(feature.name))
    .map((feature) => {
      const body = feature.description?.trim()
      return body ? `${feature.name}: ${body}` : feature.name
    })
    .join('\n\n')
}

function buildProficienciesSummary(character: Character): string {
  const rows: string[] = []
  if (character.proficiencies.armor.length)
    rows.push(`Armor: ${character.proficiencies.armor.join(', ')}`)
  if (character.proficiencies.weapons.length)
    rows.push(`Weapons: ${character.proficiencies.weapons.join(', ')}`)
  if (character.proficiencies.tools.length)
    rows.push(`Tools: ${character.proficiencies.tools.join(', ')}`)
  if (character.proficiencies.languages.length)
    rows.push(`Languages: ${character.proficiencies.languages.join(', ')}`)
  return rows.join('\n')
}

export function createCharacterSheetViewModel(
  character: Character,
  rawLookups: EntityLookupSet,
): CharacterSheetViewModel {
  const level = getTotalCharacterLevel(character) || 1
  const proficiencyBonus = getProficiencyBonus(level)
  const abilityModifiers = Object.fromEntries(
    (['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map(
      (ability) => [ability, getAbilityModifier(character.abilityScores[ability])],
    ),
  ) as Record<AbilityName, number>
  const expertiseSkills = Object.entries(character.skills)
    .filter(([, value]) => value?.expertise)
    .map(([name]) => name.toLowerCase())
  const skillByName = new Map(
    deriveAllSkills(
      abilityModifiers,
      character.proficiencies.skills,
      expertiseSkills,
      proficiencyBonus,
    ).map((skill) => [skill.name, skill] as const),
  )
  const savingThrowByAbility = new Map(
    deriveAllSavingThrows(
      abilityModifiers,
      character.proficiencies.savingThrows,
      proficiencyBonus,
    ).map((save) => [save.ability, save] as const),
  )
  const resolvedClasses = getCharacterClassEntries(character).flatMap((entry) => {
    const resolved = resolveClassReference(entry, rawLookups)
    return resolved ? [resolved] : []
  })
  const raceResolution = resolveRaceReference(
    {
      name: character.race,
      source: character.raceSource,
      subraceName: character.subrace,
      subraceSource: character.subraceSource,
    },
    rawLookups,
  )
  const background = resolveBackgroundReference(
    { name: character.background, source: character.backgroundSource },
    rawLookups,
  )
  const classesById = new Map(
    resolvedClasses.map((classData) => [
      toClassProfileId(classData.name, classData.source),
      classData,
    ]),
  )

  return {
    character,
    level,
    classLevelSummary: getClassLevelSummary(character),
    raceSummary: getRaceSummary(character),
    proficiencyBonus,
    abilityModifiers,
    skillByName,
    savingThrowByAbility,
    effectiveArmorClass: computeEffectiveCharacterArmorClass(character),
    maxHP: getEffectiveMaxHP(character, resolvedClasses),
    remainingHitDice: Math.max(0, level - Math.max(0, character.hitDiceUsed ?? 0)),
    resolvedClasses,
    mergedRace: raceResolution.mergedRace,
    background,
    spellcastingDetails: buildSpellcastingClassDetails(character, classesById),
    visionSummary: buildVisionSummary(character, raceResolution.mergedRace),
    racialTraitsSummary: buildRacialTraitsSummary(character, raceResolution.mergedRace),
    backgroundFeature: getBackgroundFeature(character, background),
    classFeaturesSummary2014: buildClassFeaturesSummary(character),
    featuresSummary: buildFeaturesSummary(character),
    equipmentSummary: character.equipment
      .map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
      .join('\n'),
    proficienciesSummary: buildProficienciesSummary(character),
    languagesSummary: character.proficiencies.languages.join(', '),
    featsSummary: character.feats
      .map((feat) => {
        const body = feat.description?.trim()
        return body ? `${feat.name}: ${body}` : feat.name
      })
      .join('\n\n'),
    customOrganizationSummary: [
      character.details.organizationCustomName,
      character.details.organizationCustomDescription,
    ]
      .filter((part) => !!part && part.trim().length > 0)
      .join('\n'),
    carriedWeight: character.equipment
      .reduce((sum, item) => sum + (item.weight ?? 0) * (item.quantity ?? 1), 0)
      .toFixed(1),
  }
}

export function formatViewModelModifier(value: number): string {
  return formatModifier(value)
}

export function usesCustomOrganization(viewModel: CharacterSheetViewModel): boolean {
  return viewModel.character.details.organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
}
