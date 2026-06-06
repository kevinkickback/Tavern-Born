import { PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib'
import { type AbilityName, formatModifier } from '@/lib/calculations/abilityScores'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { getRaceTraits, mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import { deriveAllSavingThrows, deriveAllSkills } from '@/lib/calculations/skills'
import { buildSpellcastingClassDetails } from '@/lib/calculations/spellProfiles.casting'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { CUSTOM_ORGANIZATION_KEY } from '@/lib/character/organizationConstants'
import {
  getEffectiveMaxHP,
  getTotalCharacterLevel,
  matchesGameDataEntry,
} from '@/lib/characterUtils'
import {
  type AcroWidget,
  asFieldWithInternals,
  type FieldWithInternals,
  getPageRefTag,
} from '@/lib/pdf/pdfFieldInternals'
import { resolvePortraitSrc } from '@/lib/portraitConstants'
import { renderEntry } from '@/lib/renderer'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export type CharacterSheetTemplateId = '2014' | '2024'

type CharacterSheetTemplate = {
  id: CharacterSheetTemplateId
  name: string
  fileName: string
  assetPath: string
}

export const CHARACTER_SHEET_TEMPLATES: readonly CharacterSheetTemplate[] = [
  {
    id: '2014',
    name: '2014 Character Sheet',
    fileName: '2014_Character_Sheet.pdf',
    assetPath: '/pdf/2014_Character_Sheet.pdf',
  },
  {
    id: '2024',
    name: '2024 Character Sheet',
    fileName: '2024_Character_Sheet.pdf',
    assetPath: '/pdf/2024_Character_Sheet.pdf',
  },
] as const

const CHARACTER_SHEET_TEMPLATE_BY_ID: Record<CharacterSheetTemplateId, CharacterSheetTemplate> = {
  '2014': CHARACTER_SHEET_TEMPLATES[0],
  '2024': CHARACTER_SHEET_TEMPLATES[1],
}

export const DEFAULT_CHARACTER_SHEET_TEMPLATE = CHARACTER_SHEET_TEMPLATE_BY_ID['2024']

const MPMB_2014_SKILL_FIELD_MAP: Record<string, { modifier: string; proficiency: string }> = {
  acrobatics: { modifier: 'Acr', proficiency: 'Acr Prof' },
  'animal handling': { modifier: 'Ani', proficiency: 'Ani Prof' },
  arcana: { modifier: 'Arc', proficiency: 'Arc Prof' },
  athletics: { modifier: 'Ath', proficiency: 'Ath Prof' },
  deception: { modifier: 'Dec', proficiency: 'Dec Prof' },
  history: { modifier: 'His', proficiency: 'His Prof' },
  insight: { modifier: 'Ins', proficiency: 'Ins Prof' },
  intimidation: { modifier: 'Inti', proficiency: 'Inti Prof' },
  investigation: { modifier: 'Inv', proficiency: 'Inv Prof' },
  medicine: { modifier: 'Med', proficiency: 'Med Prof' },
  nature: { modifier: 'Nat', proficiency: 'Nat Prof' },
  perception: { modifier: 'Perc', proficiency: 'Perc Prof' },
  performance: { modifier: 'Perf', proficiency: 'Perf Prof' },
  persuasion: { modifier: 'Pers', proficiency: 'Pers Prof' },
  religion: { modifier: 'Rel', proficiency: 'Rel Prof' },
  'sleight of hand': { modifier: 'Sle', proficiency: 'Sle Prof' },
  stealth: { modifier: 'Ste', proficiency: 'Ste Prof' },
  survival: { modifier: 'Sur', proficiency: 'Sur Prof' },
}

const MPMB_2014_SAVE_FIELD_MAP: Record<AbilityName, { modifier: string; proficiency: string }> = {
  strength: { modifier: 'Str ST Mod', proficiency: 'Str ST Prof' },
  dexterity: { modifier: 'Dex ST Mod', proficiency: 'Dex ST Prof' },
  constitution: { modifier: 'Con ST Mod', proficiency: 'Con ST Prof' },
  intelligence: { modifier: 'Int ST Mod', proficiency: 'Int ST Prof' },
  wisdom: { modifier: 'Wis ST Mod', proficiency: 'Wis ST Prof' },
  charisma: { modifier: 'Cha ST Mod', proficiency: 'Cha ST Prof' },
}

const MPMB_2014_ABILITY_FIELD_MAP: Record<AbilityName, { score: string; modifier: string }> = {
  strength: { score: 'Str', modifier: 'Str Mod' },
  dexterity: { score: 'Dex', modifier: 'Dex Mod' },
  constitution: { score: 'Con', modifier: 'Con Mod' },
  intelligence: { score: 'Int', modifier: 'Int Mod' },
  wisdom: { score: 'Wis', modifier: 'Wis Mod' },
  charisma: { score: 'Cha', modifier: 'Cha Mod' },
}

const WOTC_2024_SKILL_FIELD_MAP: Record<string, { modifier: string; proficiency: string }> = {
  acrobatics: { modifier: 'Text_31', proficiency: 'Checkbox_31' },
  'animal handling': { modifier: 'Text_32', proficiency: 'Checkbox_19' },
  arcana: { modifier: 'Text_33', proficiency: 'Checkbox_20' },
  athletics: { modifier: 'Text_34', proficiency: 'Checkbox_21' },
  deception: { modifier: 'Text_35', proficiency: 'Checkbox_22' },
  history: { modifier: 'Text_36', proficiency: 'Checkbox_23' },
  insight: { modifier: 'Text_47', proficiency: 'Checkbox_30' },
  intimidation: { modifier: 'Text_37', proficiency: 'Checkbox_14' },
  investigation: { modifier: 'Text_38', proficiency: 'Checkbox_15' },
  medicine: { modifier: 'Text_39', proficiency: 'Checkbox_16' },
  nature: { modifier: 'Text_40', proficiency: 'Checkbox_17' },
  perception: { modifier: 'Text_41', proficiency: 'Checkbox_18' },
  performance: { modifier: 'Text_42', proficiency: 'Checkbox_24' },
  persuasion: { modifier: 'Text_43', proficiency: 'Checkbox_25' },
  religion: { modifier: 'Text_44', proficiency: 'Checkbox_26' },
  'sleight of hand': { modifier: 'Text_45', proficiency: 'Checkbox_27' },
  stealth: { modifier: 'Text_46', proficiency: 'Checkbox_28' },
  survival: { modifier: 'Text_52', proficiency: 'Checkbox_29' },
}

const WOTC_2024_SAVE_FIELD_MAP: Record<AbilityName, { modifier: string; proficiency: string }> = {
  strength: { modifier: 'Text_54', proficiency: 'Checkbox_8' },
  dexterity: { modifier: 'Text_53', proficiency: 'Checkbox_9' },
  constitution: { modifier: 'Text_51', proficiency: 'Checkbox_10' },
  intelligence: { modifier: 'Text_48', proficiency: 'Checkbox_11' },
  wisdom: { modifier: 'Text_49', proficiency: 'Checkbox_12' },
  charisma: { modifier: 'Text_50', proficiency: 'Checkbox_13' },
}

type FieldMap = {
  textFields: Record<string, string>
  checkboxFields: Record<string, boolean>
}

// Keep visual assets that are implemented as button widgets in the 2014 MPMB template.
const MPMB_BUTTON_KEEP_PATTERNS = [
  /^Portrait$/i,
  /^Symbol$/i,
  /^HeaderIcon$/i,
  /^Image\./i,
  /^Weight /i,
]

const AMMO_CHECKBOX_PATTERN = /^Ammo(Left|Right)\.(Top|Base|Bullet|Icon)\./
const CALCULATED_FIELDS = ['AC', 'Proficiency Bonus', 'HP Max'] as const

function getLevel(character: Character): number {
  return getTotalCharacterLevel(character) || 1
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

const SIZE_CODE_TO_FULL: Record<string, string> = {
  G: 'Gargantuan',
  H: 'Huge',
  L: 'Large',
  M: 'Medium',
  S: 'Small',
  T: 'Tiny',
}

function normalizeSizeForPdf(code: string | undefined): string {
  if (!code) return ''
  return SIZE_CODE_TO_FULL[code.toUpperCase()] ?? code
}

function lookupMergedRace(character: Character, racesData: Race5e[]): Race5e | undefined {
  const parent = racesData.find((r) =>
    matchesGameDataEntry(character.race, character.raceSource, r),
  )
  if (!parent) return undefined
  if (!character.subrace) return parent
  const subrace = (parent.subraces as Race5e[] | undefined)?.find((sr) =>
    matchesGameDataEntry(character.subrace, character.subraceSource, sr),
  )
  return subrace ? mergeRaceWithSubrace(parent, subrace) : parent
}

function buildVisionSummary(character: Character, mergedRace?: Race5e): string {
  if (character.visions?.length) {
    return character.visions
      .map((v) => {
        const label = v.type.charAt(0).toUpperCase() + v.type.slice(1)
        return v.range != null ? `${label} ${v.range} ft.` : label
      })
      .join(', ')
  }
  // Fallback: derive darkvision from race data for characters without stored visions
  if (mergedRace?.darkvision) {
    return `Darkvision ${mergedRace.darkvision} ft.`
  }
  return ''
}

function renderEntriesToText(entries: unknown[]): string {
  return entries
    .map((e) => {
      const html = renderEntry(e)
      return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
    })
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

function buildRacialTraitsSummary(character: Character, mergedRace?: Race5e): string {
  const provenanceFeatures = character.provenance?.features ?? {}
  const racialFeatureNames = new Set(
    Object.entries(provenanceFeatures)
      .filter(([, tags]) =>
        tags.some((tag) => tag.sourceType === 'race' || tag.sourceType === 'subrace'),
      )
      .map(([name]) => name),
  )
  const racialFeatures = character.features.filter((f) => racialFeatureNames.has(f.name))
  if (racialFeatures.length > 0) {
    return racialFeatures
      .map((f) => {
        const body = f.description?.trim()
        return body ? `${f.name}: ${body}` : f.name
      })
      .join('\n\n')
  }
  // Fall back to parsing traits from game data for 2014 characters
  if (mergedRace) {
    const traits = getRaceTraits(mergedRace)
    if (traits.length > 0) {
      return traits
        .map((t) => {
          const text = renderEntriesToText(t.entries)
          return text ? `${t.name}: ${text}` : t.name
        })
        .join('\n\n')
    }
  }
  return character.race || ''
}

function getBackgroundFeatureForPdf(
  character: Character,
  backgroundsData: Background5e[],
): { name: string; description: string } {
  // Prefer provenance-tracked features (set for 2024-style or manually-tracked features)
  const provenanceFeatures = character.provenance?.features ?? {}
  const provenanceName =
    Object.entries(provenanceFeatures).find(([, tags]) =>
      tags.some((tag) => tag.sourceType === 'background'),
    )?.[0] ?? ''
  if (provenanceName) {
    const feature = character.features.find((f) => f.name === provenanceName)
    return {
      name: provenanceName,
      description: feature?.description?.trim() ?? '',
    }
  }
  // Fall back to parsing the feature from background game data (2014 characters)
  const bg = backgroundsData.find((b) =>
    matchesGameDataEntry(character.background, character.backgroundSource, b),
  )
  if (!bg?.entries) return { name: '', description: '' }
  const featureBlock = extractBackgroundFeatureBlock(bg.entries as unknown[])
  if (!featureBlock) return { name: '', description: '' }
  return {
    name: featureBlock.name,
    description: renderEntriesToText(featureBlock.entries),
  }
}

function buildClassFeaturesSummary2014(character: Character): string {
  const provenanceFeatures = character.provenance?.features ?? {}
  if (Object.keys(provenanceFeatures).length === 0) {
    return buildFeaturesSummary(character)
  }
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
  const features = character.features.filter(
    (f) => classFeatureNames.has(f.name) || !knownNames.has(f.name),
  )
  return features
    .map((f) => {
      const body = f.description?.trim()
      return body ? `${f.name}: ${body}` : f.name
    })
    .join('\n\n')
}

function buildFeaturesSummary(character: Character): string {
  return character.features
    .map((feature) => {
      const body = feature.description?.trim()
      return body ? `${feature.name}: ${body}` : feature.name
    })
    .join('\n\n')
}

function buildEquipmentSummary(character: Character): string {
  return character.equipment
    .map((item) => {
      const quantity = item.quantity > 1 ? ` x${item.quantity}` : ''
      return `${item.name}${quantity}`
    })
    .join('\n')
}

function buildProficienciesSummary(character: Character): string {
  const rows: string[] = []
  if (character.proficiencies.armor.length > 0) {
    rows.push(`Armor: ${character.proficiencies.armor.join(', ')}`)
  }
  if (character.proficiencies.weapons.length > 0) {
    rows.push(`Weapons: ${character.proficiencies.weapons.join(', ')}`)
  }
  if (character.proficiencies.tools.length > 0) {
    rows.push(`Tools: ${character.proficiencies.tools.join(', ')}`)
  }
  if (character.proficiencies.languages.length > 0) {
    rows.push(`Languages: ${character.proficiencies.languages.join(', ')}`)
  }
  return rows.join('\n')
}

function buildLanguagesSummary(character: Character): string {
  if (character.proficiencies.languages.length === 0) return ''
  return character.proficiencies.languages.join(', ')
}

function buildFeatsSummary(character: Character): string {
  if (character.feats.length === 0) return ''
  return character.feats
    .map((feat) => {
      const body = feat.description?.trim()
      return body ? `${feat.name}: ${body}` : feat.name
    })
    .join('\n\n')
}

function deriveCalculatedValues(character: Character) {
  const level = getLevel(character)
  const proficiencyBonus = getProficiencyBonus(level)

  const abilityModifiers: Record<AbilityName, number> = {
    strength: getAbilityModifier(character.abilityScores.strength),
    dexterity: getAbilityModifier(character.abilityScores.dexterity),
    constitution: getAbilityModifier(character.abilityScores.constitution),
    intelligence: getAbilityModifier(character.abilityScores.intelligence),
    wisdom: getAbilityModifier(character.abilityScores.wisdom),
    charisma: getAbilityModifier(character.abilityScores.charisma),
  }

  const expertiseSkills = Object.entries(character.skills)
    .filter(([, value]) => value?.expertise)
    .map(([name]) => name.toLowerCase())

  const skills = deriveAllSkills(
    abilityModifiers,
    character.proficiencies.skills,
    expertiseSkills,
    proficiencyBonus,
  )

  const savingThrows = deriveAllSavingThrows(
    abilityModifiers,
    character.proficiencies.savingThrows,
    proficiencyBonus,
  )

  return {
    level,
    proficiencyBonus,
    abilityModifiers,
    skillByName: new Map(skills.map((skill) => [skill.name, skill] as const)),
    savingThrowByAbility: new Map(savingThrows.map((save) => [save.ability, save] as const)),
  }
}

function buildCharacterSheetFieldMap2024(character: Character, classesData?: Class5e[]): FieldMap {
  const values = deriveCalculatedValues(character)
  const effectiveArmorClass = computeEffectiveCharacterArmorClass(character)
  const maxHP = getEffectiveMaxHP(character, classesData)
  const hitDiceUsed = Math.max(0, character.hitDiceUsed ?? 0)
  const remainingHitDice = Math.max(0, values.level - hitDiceUsed)
  const textFields: Record<string, string> = {
    Text_1: character.name || '',
    Text_2: getClassLevelSummary(character),
    Text_3: getRaceSummary(character),
    Text_4: character.background || '',
    Text_5: character.details.alignment || '',
    Text_6: String(values.level),

    Text_22: String(character.abilityScores.strength),
    Text_25: formatModifier(values.abilityModifiers.strength),
    Text_23: String(character.abilityScores.dexterity),
    Text_26: formatModifier(values.abilityModifiers.dexterity),
    Text_24: String(character.abilityScores.constitution),
    Text_27: formatModifier(values.abilityModifiers.constitution),
    Text_15: String(character.abilityScores.intelligence),
    Text_30: formatModifier(values.abilityModifiers.intelligence),
    Text_20: String(character.abilityScores.wisdom),
    Text_28: formatModifier(values.abilityModifiers.wisdom),
    Text_21: String(character.abilityScores.charisma),
    Text_29: formatModifier(values.abilityModifiers.charisma),

    Text_14: String(effectiveArmorClass),
    Text_7: formatModifier(values.proficiencyBonus),
    Text_8: formatModifier(values.abilityModifiers.dexterity),
    Text_9: `${character.speed || 30} ft`,
    Text_10: String(maxHP || ''),
    Text_11: String(character.hitPoints.current || ''),
    Text_12: String(character.hitPoints.temporary || ''),
    Text_13: String(remainingHitDice),

    Text_55: buildProficienciesSummary(character),
    Text_56: buildLanguagesSummary(character),
    Text_57: buildFeaturesSummary(character),
    Text_58: buildFeatsSummary(character),
    Text_59: buildEquipmentSummary(character),
    Text_60:
      character.details.backstory || character.details.lifeEvents || character.details.origin || '',
  }

  const checkboxFields: Record<string, boolean> = {
    Checkbox_1: !!character.inspiration,
    Checkbox_2: (character.deathSaves?.successes ?? 0) >= 1,
    Checkbox_3: (character.deathSaves?.successes ?? 0) >= 2,
    Checkbox_4: (character.deathSaves?.successes ?? 0) >= 3,
    Checkbox_5: (character.deathSaves?.failures ?? 0) >= 1,
    Checkbox_6: (character.deathSaves?.failures ?? 0) >= 2,
    Checkbox_7: (character.deathSaves?.failures ?? 0) >= 3,
  }

  for (const [ability, mapping] of Object.entries(WOTC_2024_SAVE_FIELD_MAP) as Array<
    [AbilityName, { modifier: string; proficiency: string }]
  >) {
    const save = values.savingThrowByAbility.get(ability)
    textFields[mapping.modifier] = formatModifier(save?.modifier ?? 0)
    checkboxFields[mapping.proficiency] = !!save?.proficient
  }

  for (const [skillName, mapping] of Object.entries(WOTC_2024_SKILL_FIELD_MAP)) {
    const skill = values.skillByName.get(skillName)
    textFields[mapping.modifier] = formatModifier(skill?.modifier ?? 0)
    checkboxFields[mapping.proficiency] = !!skill?.proficient
  }

  return { textFields, checkboxFields }
}

function buildCharacterSheetFieldMap2014(
  character: Character,
  classesData?: Class5e[],
  racesData?: Race5e[],
  backgroundsData?: Background5e[],
): FieldMap {
  const values = deriveCalculatedValues(character)
  const effectiveArmorClass = computeEffectiveCharacterArmorClass(character)
  const maxHP = getEffectiveMaxHP(character, classesData)

  const classesById = new Map(
    (classesData ?? []).map((cls) => [toClassProfileId(cls.name, cls.source), cls]),
  )
  const spellcastingDetails = buildSpellcastingClassDetails(character, classesById)
  const mergedRace = racesData ? lookupMergedRace(character, racesData) : undefined

  const customOrganizationSummary = [
    character.details.organizationCustomName,
    character.details.organizationCustomDescription,
  ]
    .filter((part) => !!part && part.trim().length > 0)
    .join('\n')

  const languages = character.proficiencies.languages
  const tools = character.proficiencies.tools
  const armorLower = character.proficiencies.armor.map((a) => a.toLowerCase())
  const weaponsLower = character.proficiencies.weapons.map((w) => w.toLowerCase())
  const otherWeapons = character.proficiencies.weapons.filter(
    (w) => !w.toLowerCase().includes('simple') && !w.toLowerCase().includes('martial'),
  )

  const textFields: Record<string, string> = {
    'PC Name': character.name || '',
    'Player Name': character.details.playerName || '',
    'Class and Levels': getClassLevelSummary(character),
    'Character Level': String(values.level),
    Race: getRaceSummary(character),
    Background: character.background || '',
    'Proficiency Bonus': formatModifier(values.proficiencyBonus),
    'Passive Perception': String(
      10 + (values.skillByName.get('perception')?.modifier ?? values.abilityModifiers.wisdom),
    ),
    'Initiative bonus': formatModifier(values.abilityModifiers.dexterity),
    Speed: `${character.speed || 30} ft`,
    AC: String(effectiveArmorClass),
    'HP Max': String(maxHP),
    'HP Current': String(character.hitPoints.current),
    'HP Temp': String(character.hitPoints.temporary),
    'Total Experience': String(character.experiencePoints || ''),
    'Copper Pieces': character.currency?.cp != null ? String(character.currency.cp) : '',
    'Silver Pieces': character.currency?.sp != null ? String(character.currency.sp) : '',
    'Electrum Pieces': character.currency?.ep != null ? String(character.currency.ep) : '',
    'Gold Pieces': character.currency?.gp != null ? String(character.currency.gp) : '',
    'Platinum Pieces': character.currency?.pp != null ? String(character.currency.pp) : '',
    'Weight Carried': String(
      character.equipment
        .reduce((sum, item) => sum + (item.weight ?? 0) * (item.quantity ?? 1), 0)
        .toFixed(1),
    ),
    Sex: character.details.gender || '',
    Height: character.details.height || '',
    Weight: character.details.weight || '',
    Alignment: character.details.alignment || '',
    Age: String(character.details.age ?? ''),
    'Eyes colour': character.details.eyes || '',
    'Skin colour': character.details.skin || '',
    'Hair colour': character.details.hair || '',
    'Personality Trait': character.details.personalityTraits || character.details.personality || '',
    Ideal: character.details.ideals || '',
    Bond: character.details.bonds || '',
    Flaw: character.details.flaws || '',
    Background_History:
      character.details.backstory || character.details.lifeEvents || character.details.origin || '',
    'Class Features': buildClassFeaturesSummary2014(character),
    'Racial Traits': buildRacialTraitsSummary(character, mergedRace),
    ...(() => {
      const bgFeature = getBackgroundFeatureForPdf(character, backgroundsData ?? [])
      return {
        'Background Feature': bgFeature.name,
        'Background Feature Description': bgFeature.description,
      }
    })(),
    'Background_Organisation.Left':
      character.details.organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
        ? customOrganizationSummary || character.details.alliesAndOrganizations || ''
        : character.details.alliesAndOrganizations || '',
    Background_Appearance:
      character.details.appearance || character.details.physicalDescription || '',
    Background_Enemies: character.details.nemesis || '',
    Vision: buildVisionSummary(character, mergedRace),
    'Size Category': normalizeSizeForPdf(mergedRace?.size?.[0]),
    'Spell save DC 1':
      spellcastingDetails[0]?.spellSaveDC != null ? String(spellcastingDetails[0].spellSaveDC) : '',
    'Spell save DC 2':
      spellcastingDetails[1]?.spellSaveDC != null ? String(spellcastingDetails[1].spellSaveDC) : '',
    'Language 1': languages[0] ?? '',
    'Language 2': languages[1] ?? '',
    'Language 3': languages[2] ?? '',
    'Language 4': languages[3] ?? '',
    'Language 5': languages[4] ?? '',
    'Language 6': languages[5] ?? '',
    'Tool 1': tools[0] ?? '',
    'Tool 2': tools[1] ?? '',
    'Tool 3': tools[2] ?? '',
    'Tool 4': tools[3] ?? '',
    'Tool 5': tools[4] ?? '',
    'Tool 6': tools[5] ?? '',
    'Proficiency Weapon Other Description': otherWeapons.join(', '),
    'Feat Name 1': character.feats[0]?.name ?? '',
    'Feat Name 2': character.feats[1]?.name ?? '',
    'Feat Name 3': character.feats[2]?.name ?? '',
    'Feat Name 4': character.feats[3]?.name ?? '',
    'Feat Description 1': character.feats[0]?.description ?? '',
    'Feat Description 2': character.feats[1]?.description ?? '',
    'Feat Description 3': character.feats[2]?.description ?? '',
    'Feat Description 4': character.feats[3]?.description ?? '',
    'Feat Note 1': character.feats[0]?.prerequisites ?? '',
    'Feat Note 2': character.feats[1]?.prerequisites ?? '',
    'Feat Note 3': character.feats[2]?.prerequisites ?? '',
    'Feat Note 4': character.feats[3]?.prerequisites ?? '',
  }

  for (let i = 0; i < Math.min(character.equipment.length, 54); i++) {
    const item = character.equipment[i]
    if (!item) continue
    const n = i + 1
    textFields[`Adventuring Gear Row ${n}`] = item.name
    textFields[`Adventuring Gear Amount ${n}`] = String(item.quantity)
    textFields[`Adventuring Gear Weight ${n}`] = item.weight != null ? String(item.weight) : ''
  }

  for (const [ability, mapping] of Object.entries(MPMB_2014_ABILITY_FIELD_MAP) as Array<
    [AbilityName, { score: string; modifier: string }]
  >) {
    textFields[mapping.score] = String(character.abilityScores[ability])
    textFields[mapping.modifier] = formatModifier(values.abilityModifiers[ability])
  }

  const checkboxFields: Record<string, boolean> = {
    Inspiration: !!character.inspiration,
    'Death Save Success1': (character.deathSaves?.successes ?? 0) >= 1,
    'Death Save Success2': (character.deathSaves?.successes ?? 0) >= 2,
    'Death Save Success3': (character.deathSaves?.successes ?? 0) >= 3,
    'Death Save Fail1': (character.deathSaves?.failures ?? 0) >= 1,
    'Death Save Fail2': (character.deathSaves?.failures ?? 0) >= 2,
    'Death Save Fail3': (character.deathSaves?.failures ?? 0) >= 3,
    'Proficiency Armor Light': armorLower.some((a) => a.includes('light')),
    'Proficiency Armor Medium': armorLower.some((a) => a.includes('medium')),
    'Proficiency Armor Heavy': armorLower.some((a) => a.includes('heavy')),
    'Proficiency Shields': armorLower.some((a) => a.includes('shield')),
    'Proficiency Weapon Simple': weaponsLower.some((w) => w.includes('simple')),
    'Proficiency Weapon Martial': weaponsLower.some((w) => w.includes('martial')),
    'Proficiency Weapon Other': otherWeapons.length > 0,
  }

  for (const [ability, mapping] of Object.entries(MPMB_2014_SAVE_FIELD_MAP) as Array<
    [AbilityName, { modifier: string; proficiency: string }]
  >) {
    const save = values.savingThrowByAbility.get(ability)
    textFields[mapping.modifier] = formatModifier(save?.modifier ?? 0)
    checkboxFields[mapping.proficiency] = !!save?.proficient
  }

  for (const [skillName, mapping] of Object.entries(MPMB_2014_SKILL_FIELD_MAP)) {
    const skill = values.skillByName.get(skillName)
    textFields[mapping.modifier] = formatModifier(skill?.modifier ?? 0)
    checkboxFields[mapping.proficiency] = !!skill?.proficient
  }

  return { textFields, checkboxFields }
}

export function buildCharacterSheetFieldMap(
  character: Character,
  templateId: CharacterSheetTemplateId = DEFAULT_CHARACTER_SHEET_TEMPLATE.id,
  classesData?: Class5e[],
  racesData?: Race5e[],
  backgroundsData?: Background5e[],
): FieldMap {
  if (templateId === '2014') {
    return buildCharacterSheetFieldMap2014(character, classesData, racesData, backgroundsData)
  }
  return buildCharacterSheetFieldMap2024(character, classesData)
}

export function getCharacterSheetTemplate(
  templateId: CharacterSheetTemplateId,
): CharacterSheetTemplate {
  return CHARACTER_SHEET_TEMPLATE_BY_ID[templateId]
}

export async function generateFilledCharacterSheetPdf(
  character: Character,
  templateBytes: ArrayBuffer | Uint8Array,
  templateId: CharacterSheetTemplateId = DEFAULT_CHARACTER_SHEET_TEMPLATE.id,
  classesData?: Class5e[],
  racesData?: Race5e[],
  backgroundsData?: Background5e[],
): Promise<Uint8Array> {
  const input = templateBytes instanceof Uint8Array ? templateBytes : new Uint8Array(templateBytes)
  const pdfDoc = await PDFDocument.load(input, { ignoreEncryption: false })
  const form = pdfDoc.getForm()
  const { textFields, checkboxFields } = buildCharacterSheetFieldMap(
    character,
    templateId,
    classesData,
    racesData,
    backgroundsData,
  )

  for (const [fieldName, value] of Object.entries(textFields)) {
    try {
      form.getTextField(fieldName).setText(value)
      continue
    } catch {
      // Some templates expose select fields as dropdowns.
    }

    try {
      const dropdown = form.getDropdown(fieldName)
      const options = dropdown.getOptions()
      if (value && !options.includes(value)) {
        dropdown.addOptions([value])
      }
      if (value) {
        dropdown.select(value)
      }
    } catch {
      // Ignore missing fields to keep template compatibility.
    }
  }

  for (const [fieldName, checked] of Object.entries(checkboxFields)) {
    try {
      const checkbox = form.getCheckBox(fieldName)
      if (checked) {
        checkbox.check()
      } else {
        checkbox.uncheck()
      }
    } catch {
      // Ignore missing fields to keep template compatibility.
    }
  }

  if (templateId === '2014') {
    hideUnwantedFields(form)
    clearAttackModDropdowns(form)
    stripCalculationActions(form)
    makeCalculatedFieldsEditable(form)
  }

  form.updateFieldAppearances()

  if (templateId === '2014') {
    stripCheckboxOffAppearances(form)
    if (character.portrait) {
      await embedPortraitImage(pdfDoc, form, character.portrait)
    }
  }

  return pdfDoc.save({ updateFieldAppearances: false })
}

async function embedPortraitImage(
  pdfDoc: PDFDocument,
  form: ReturnType<PDFDocument['getForm']>,
  portrait: string,
): Promise<void> {
  let button: FieldWithInternals
  try {
    const raw = form.getButton('Portrait')
    const internals = asFieldWithInternals(raw)
    if (!internals) return
    button = internals
  } catch {
    return
  }

  const widgets = button.acroField.getWidgets() as AcroWidget[]
  if (widgets.length === 0) return

  let rect: { x: number; y: number; width: number; height: number }
  try {
    rect = widgets[0].getRectangle()
  } catch {
    return
  }

  try {
    let bytes: Uint8Array
    let isPng: boolean

    if (portrait.startsWith('data:')) {
      const commaIdx = portrait.indexOf(',')
      const base64 = commaIdx >= 0 ? portrait.slice(commaIdx + 1) : portrait
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      isPng = portrait.includes('image/png')
    } else if (
      portrait.startsWith('/') ||
      portrait.startsWith('./') ||
      portrait.startsWith('../')
    ) {
      // Relative / absolute asset paths from the app bundle — safe to fetch.
      // Normalize legacy absolute paths to BASE_URL-relative for file:// compat.
      const response = await fetch(resolvePortraitSrc(portrait))
      if (!response.ok) throw new Error('Failed to fetch portrait')
      const contentType = response.headers.get('content-type') ?? ''
      isPng = contentType.includes('png') || portrait.toLowerCase().endsWith('.png')
      bytes = new Uint8Array(await response.arrayBuffer())
    } else {
      // Any other scheme (file://, http://, etc.) is not a supported portrait source.
      return
    }

    const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
    const pages = pdfDoc.getPages()
    if (pages.length > 0) {
      // Resolve the page that actually owns this widget via its /P entry
      const pageRefTag = widgets[0].P?.()?.tag
      const targetPage = pageRefTag
        ? (pages.find((p) => getPageRefTag(p) === pageRefTag) ?? pages[0])
        : pages[0]

      const dims = image.scaleToFit(rect.width, rect.height)
      const drawX = rect.x + (rect.width - dims.width) / 2
      const drawY = rect.y + (rect.height - dims.height) / 2
      targetPage.drawImage(image, { x: drawX, y: drawY, width: dims.width, height: dims.height })
    }

    // Collapse the Portrait widget so it doesn't occlude the image drawn on the page
    hideFieldWidgets(button)
  } catch {
    // Portrait embedding is best-effort; skip silently on any failure.
  }
}

function hideFieldWidgets(field: FieldWithInternals) {
  for (const widget of field.acroField.getWidgets() as AcroWidget[]) {
    widget.setRectangle({ x: 0, y: 0, width: 0, height: 0 })
    widget.dict.delete(PDFName.of('AP'))
    widget.dict.delete(PDFName.of('A'))
    widget.dict.delete(PDFName.of('AA'))
    widget.dict.set(PDFName.of('F'), PDFNumber.of(34))
  }
}

function isPushButtonField(form: ReturnType<PDFDocument['getForm']>, fieldName: string) {
  try {
    form.getButton(fieldName)
    return true
  } catch {
    return false
  }
}

function hideUnwantedFields(form: ReturnType<PDFDocument['getForm']>) {
  for (const field of form.getFields()) {
    const name = field.getName()
    const isInteractiveButton =
      isPushButtonField(form, name) &&
      !MPMB_BUTTON_KEEP_PATTERNS.some((pattern) => pattern.test(name))
    const isAmmoCheckbox = AMMO_CHECKBOX_PATTERN.test(name)

    if (!isInteractiveButton && !isAmmoCheckbox) continue

    const fieldWithInternals = asFieldWithInternals(field)
    if (!fieldWithInternals) continue

    try {
      hideFieldWidgets(fieldWithInternals)
    } catch {
      // Ignore template-specific widget failures.
    }
  }
}

function clearAttackModDropdowns(form: ReturnType<PDFDocument['getForm']>) {
  for (let i = 1; i <= 5; i += 1) {
    try {
      const dropdown = form.getDropdown(`Attack.${i}.Mod`)
      dropdown.clear()
    } catch {
      // Field may not exist in all template revisions.
    }
  }
}

function stripCalculationActions(form: ReturnType<PDFDocument['getForm']>) {
  const aaKey = PDFName.of('AA')
  for (const field of form.getFields()) {
    const fieldWithInternals = asFieldWithInternals(field)
    if (!fieldWithInternals) continue

    if (fieldWithInternals.acroField.dict.has(aaKey)) {
      fieldWithInternals.acroField.dict.delete(aaKey)
    }
  }
}

function makeCalculatedFieldsEditable(form: ReturnType<PDFDocument['getForm']>) {
  const ffKey = PDFName.of('Ff')

  for (const fieldName of CALCULATED_FIELDS) {
    try {
      const raw = form.getTextField(fieldName)
      const field = asFieldWithInternals(raw)
      if (!field) continue

      const flags = field.acroField.dict.get(ffKey) as { numberValue?: number } | undefined
      if (typeof flags?.numberValue === 'number') {
        field.acroField.dict.set(ffKey, PDFNumber.of(flags.numberValue & ~1))
      }
    } catch {
      // Field may not exist for some template variations.
    }
  }
}

function stripCheckboxOffAppearances(form: ReturnType<PDFDocument['getForm']>) {
  for (const field of form.getFields()) {
    const fieldWithInternals = asFieldWithInternals(field)
    if (!fieldWithInternals) continue

    try {
      form.getCheckBox(fieldWithInternals.getName())
    } catch {
      continue
    }

    for (const widget of fieldWithInternals.acroField.getWidgets() as AcroWidget[]) {
      const appearance = widget.dict.get(PDFName.of('AP')) as
        | {
            get: (
              name: unknown,
            ) => { has: (n: unknown) => boolean; delete: (n: unknown) => void } | undefined
          }
        | undefined
      const normalAppearance = appearance?.get(PDFName.of('N'))
      if (normalAppearance?.has(PDFName.of('Off'))) {
        normalAppearance.delete(PDFName.of('Off'))
      }
    }
  }
}
