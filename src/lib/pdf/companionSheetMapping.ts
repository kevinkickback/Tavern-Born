import type { buildCompanionSheetData } from './companionSheet'
import type { CharacterSheetFieldMap } from './types'

// Audited against widget positions in Companion_Sheet_Form.pdf, not field numbering.
const SKILLS = [
  'acrobatics',
  'animal handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight of hand',
  'stealth',
  'survival',
]
const DAMAGE = [
  'bludgeoning',
  'piercing',
  'slashing',
  'cold',
  'fire',
  'lightning',
  'poison',
  'acid',
  'psychic',
  'necrotic',
  'radiant',
  'thunder',
  'force',
]
const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'paralyzed',
  'poisoned',
  'petrified',
  'prone',
  'restrained',
  'stunned',
]

export function mapCompanionSheet(
  data: ReturnType<typeof buildCompanionSheetData>,
): CharacterSheetFieldMap {
  const textFields: Record<string, string> = {
    'companion name': data.name,
    'companion.0.0': data.creature,
    'companion.0.1': data.boundTo,
    'companion.0.2': data.size,
    'companion.1.0': data.alignment,
    'companion.1.2': data.type,
    AC: data.armorClass,
    'MAX HP': data.maxHp,
    'hit dice': data.hitDice,
    'Proficiency Bonus': data.proficiency,
    'passive wisdom (perception)': data.passive,
    Initiative: data.abilities.find((ability) => ability.key === 'dex')?.modifier ?? '',
    Speed: data.movement.walk ?? '',
    'swimming speed': data.movement.swim ?? '',
    'flying speed': data.movement.fly ?? '',
    'climbing speed': data.movement.climb ?? '',
    'burrowing speed': data.movement.burrow ?? '',
    'Attacks.3': data.attacks,
    'Feats & Traits': data.traits,
  }
  const checkboxFields: Record<string, boolean> = {}
  data.abilities.forEach((ability, index) => {
    textFields[`stat.${index}`] = ability.score == null ? '' : String(ability.score)
    textFields[index ? `stats.${index}` : 'stats modifier'] = ability.modifier
    textFields[`saves number.${index}`] = ability.save
    checkboxFields[`saves.${index}`] = ability.trained
  })
  SKILLS.forEach((name, index) => {
    const skill = data.skills.find((entry) => entry.name === name)
    textFields[`skills.${index}`] = skill?.modifier ?? ''
    checkboxFields[`skill checks.${index}`] = skill?.trained ?? false
  })
  ;['Blindsight', 'Darkvision', 'Truesight', 'Tremorsense'].forEach((name, index) => {
    const sense = data.senses.find((value) => value.toLowerCase().startsWith(name.toLowerCase()))
    textFields[name] = sense?.slice(name.length).trim() ?? ''
    checkboxFields[`Check Box${index + 1}`] = Boolean(sense)
  })
  data.actions.slice(0, 3).forEach((action, index) => {
    textFields[index ? `Attacks.${index}` : 'Attacks.0.0.0'] = action.name
    textFields[`Attacks.0.2.1.2.${index}`] = action.bonus
    textFields[`Attacks.0.${index}.2`] = action.damage
  })
  DAMAGE.forEach((name, index) => {
    checkboxFields[`irv.0.${index}`] = data.defenses.immune.includes(name)
    checkboxFields[`irv.1.${index}`] = data.defenses.resist.includes(name)
    checkboxFields[index === 12 ? 'irv.2.12' : `irv.2.${index}.0`] =
      data.defenses.vulnerable.includes(name)
  })
  CONDITIONS.forEach((name, index) => {
    checkboxFields[`irv.2.${index}.1`] = data.defenses.conditions.includes(name)
  })
  // Conditional defenses remain in prose: marking them as unconditional would be misleading.
  return { textFields, checkboxFields }
}
