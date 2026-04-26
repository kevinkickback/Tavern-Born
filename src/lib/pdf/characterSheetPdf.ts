import { PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib'
import { type AbilityName, formatModifier } from '@/lib/calculations/abilityScores'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { deriveAllSavingThrows, deriveAllSkills } from '@/lib/calculations/skills'
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
    name: 'MPMB 2014 Character Sheet',
    fileName: '2014_Character_Sheet.pdf',
    assetPath: '/pdf/2014_Character_Sheet.pdf',
  },
  {
    id: '2024',
    name: 'WotC 2024 Character Sheet',
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
  if (Array.isArray(character.classProgression) && character.classProgression.length > 0) {
    return character.classProgression.reduce((sum, cls) => sum + (cls.levels || 0), 0) || 1
  }
  return character.level || 1
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

function getBackgroundFeatDescription(character: Character): string {
  const provenanceFeats = character.provenance?.feats ?? {}
  const backgroundFeatName = Object.entries(provenanceFeats).find(([, tags]) =>
    tags.some((tag) => tag.sourceType === 'background'),
  )?.[0]
  if (!backgroundFeatName) return ''
  const feat = character.feats.find((f) => f.name === backgroundFeatName)
  if (!feat) return ''
  return feat.description ? `${feat.name}: ${feat.description}` : feat.name
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

function buildCharacterSheetFieldMap2024(character: Character): FieldMap {
  const values = deriveCalculatedValues(character)
  const effectiveArmorClass = computeEffectiveCharacterArmorClass(character)
  const textFields: Record<string, string> = {
    Text_1: character.name || '',
    Text_2: getClassLevelSummary(character),
    Text_3: getRaceSummary(character),
    Text_4: character.background || '',
    Text_5: '',

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
    Text_10: String(character.hitPoints.max || ''),
    Text_11: String(character.hitPoints.current || ''),
    Text_12: String(character.hitPoints.temporary || ''),

    Text_55: buildProficienciesSummary(character),
    Text_57: buildFeaturesSummary(character),
    Text_59: buildEquipmentSummary(character),
    Text_60:
      character.details.backstory || character.details.lifeEvents || character.details.origin || '',
  }

  const checkboxFields: Record<string, boolean> = {}

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

function buildCharacterSheetFieldMap2014(character: Character): FieldMap {
  const values = deriveCalculatedValues(character)
  const effectiveArmorClass = computeEffectiveCharacterArmorClass(character)

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
    'HP Max': String(character.hitPoints.max),
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
    MoreProficiencies: buildProficienciesSummary(character),
    'Class Features': buildFeaturesSummary(character),
    'Racial Traits': character.race || '',
    'Background Feature Description': getBackgroundFeatDescription(character),
    'Background_Organisation.Left': character.details.alliesAndOrganizations || '',
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
): FieldMap {
  if (templateId === '2014') {
    return buildCharacterSheetFieldMap2014(character)
  }
  return buildCharacterSheetFieldMap2024(character)
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
): Promise<Uint8Array> {
  const input = templateBytes instanceof Uint8Array ? templateBytes : new Uint8Array(templateBytes)
  const pdfDoc = await PDFDocument.load(input, { ignoreEncryption: false })
  const form = pdfDoc.getForm()
  const { textFields, checkboxFields } = buildCharacterSheetFieldMap(character, templateId)

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
  let button: { acroField: { getWidgets: () => unknown[] } } | null = null
  try {
    button = form.getButton('Portrait') as unknown as {
      acroField: { getWidgets: () => unknown[] }
    }
  } catch {
    return
  }

  const widgets = button.acroField.getWidgets() as Array<{
    getRectangle: () => { x: number; y: number; width: number; height: number }
  }>
  if (widgets.length === 0) return

  let rect: { x: number; y: number; width: number; height: number }
  try {
    rect = widgets[0].getRectangle()
  } catch {
    return
  }

  try {
    const commaIdx = portrait.indexOf(',')
    const base64 = commaIdx >= 0 ? portrait.slice(commaIdx + 1) : portrait
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const image = portrait.includes('image/png')
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes)
    const pages = pdfDoc.getPages()
    if (pages.length > 0) {
      pages[0].drawImage(image, { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    }
  } catch {
    // Portrait embedding is best-effort; skip silently on any failure.
  }
}

function hideFieldWidgets(field: { acroField: { getWidgets: () => unknown[] } }) {
  for (const widget of field.acroField.getWidgets() as Array<{
    setRectangle: (value: { x: number; y: number; width: number; height: number }) => void
    dict: {
      delete: (name: unknown) => void
      set: (name: unknown, value: unknown) => void
    }
  }>) {
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
    const fieldWithInternals = field as unknown as {
      acroField: { getWidgets: () => unknown[] }
      getName: () => string
    }

    const name = field.getName()
    const isInteractiveButton =
      isPushButtonField(form, name) &&
      !MPMB_BUTTON_KEEP_PATTERNS.some((pattern) => pattern.test(name))
    const isAmmoCheckbox = AMMO_CHECKBOX_PATTERN.test(name)

    if (!isInteractiveButton && !isAmmoCheckbox) continue

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
    const fieldWithInternals = field as unknown as {
      acroField: {
        dict: {
          has: (name: unknown) => boolean
          delete: (name: unknown) => void
        }
      }
    }

    if (fieldWithInternals.acroField.dict.has(aaKey)) {
      fieldWithInternals.acroField.dict.delete(aaKey)
    }
  }
}

function makeCalculatedFieldsEditable(form: ReturnType<PDFDocument['getForm']>) {
  const ffKey = PDFName.of('Ff')

  for (const fieldName of CALCULATED_FIELDS) {
    try {
      const field = form.getTextField(fieldName) as unknown as {
        acroField: {
          dict: {
            get: (name: unknown) => unknown
            set: (name: unknown, value: unknown) => void
          }
        }
      }

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
    const fieldWithInternals = field as unknown as {
      acroField: { getWidgets: () => unknown[] }
      getName: () => string
    }

    try {
      form.getCheckBox(fieldWithInternals.getName())
    } catch {
      continue
    }

    for (const widget of fieldWithInternals.acroField.getWidgets() as Array<{
      dict: {
        get: (name: unknown) =>
          | {
              get: (name: unknown) =>
                | {
                    has: (name: unknown) => boolean
                    delete: (name: unknown) => void
                  }
                | undefined
            }
          | undefined
      }
    }>) {
      const appearance = widget.dict.get(PDFName.of('AP'))
      const normalAppearance = appearance?.get(PDFName.of('N'))
      if (normalAppearance?.has(PDFName.of('Off'))) {
        normalAppearance.delete(PDFName.of('Off'))
      }
    }
  }
}
