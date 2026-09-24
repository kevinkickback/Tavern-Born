import { buildCreatureChoiceSummary, buildCreatureStatBlock } from '@/lib/5etools/creatureStatBlock'
import { ABILITY_FULL_TO_ABBREV } from '@/lib/calculations/abilityNames'
import type { AbilityName } from '@/lib/calculations/abilityScores'
import { ALL_SKILLS, getSkillAbility } from '@/lib/calculations/skills'
import { renderEntriesToText } from '@/lib/entryText'
import type { CharacterSheetViewModel } from './characterSheetViewModel'

/** Shared companion values for the bundled form and Tavern Born supplements. */
export function getCompanionSheetValues(
  viewModel: CharacterSheetViewModel,
  companion = viewModel.companions[0],
) {
  const stat = companion?.creature ? buildCreatureStatBlock(companion.creature) : undefined
  const summary = companion?.creature ? buildCreatureChoiceSummary(companion.creature) : undefined
  const classEntry = viewModel.character.classProgression.find(
    (entry) =>
      entry.name === companion?.className &&
      (!companion.classSource || entry.source === companion.classSource),
  )
  const armorFormula =
    /^(\d+)\s*(?:\+|plus)\s*(PB|your (strength|dexterity|constitution|intelligence|wisdom|charisma) modifier)$/iu.exec(
      (summary?.armorClass ?? '').replace(/\s*\(natural armor\)$/iu, ''),
    )
  const armorClass = armorFormula
    ? String(
        Number(armorFormula[1]) +
          (armorFormula[2].toUpperCase() === 'PB'
            ? viewModel.proficiencyBonus
            : viewModel.abilityModifiers[armorFormula[3].toLowerCase() as AbilityName]),
      )
    : (summary?.armorClass.match(/^\d+$/u)?.[0] ?? '')
  const hpFormula =
    /^(\d+)\s*(?:\+|plus)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten) times your (\w+) level\b/iu.exec(
      companion?.creature?.hp?.special ?? '',
    )
  const numberWords = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
  ]
  const multiplier = hpFormula
    ? Number(hpFormula[2]) || numberWords.indexOf(hpFormula[2].toLowerCase())
    : 0
  const maxHp =
    companion?.creature?.hp?.average != null
      ? String(companion.creature.hp.average)
      : hpFormula && classEntry?.name.toLowerCase() === hpFormula[3].toLowerCase() && multiplier > 0
        ? String(Number(hpFormula[1]) + multiplier * classEntry.levels)
        : ''
  const walkSpeed = companion?.creature?.speed?.walk
  const speed = typeof walkSpeed === 'number' ? `${walkSpeed} ft.` : (summary?.speed ?? '')
  const proficiency = /^equals your (?:proficiency )?bonus$/iu.test(
    String(companion?.creature?.pbNote ?? ''),
  )
    ? `+${viewModel.proficiencyBonus}`
    : (stat?.proficiencyBonus ?? '')
  const spellAttackBonus = viewModel.spellcastingDetails.find(
    (detail) => detail.className === classEntry?.name && detail.classSource === classEntry?.source,
  )?.spellAttackBonus
  const dice = /Hit Dice \[d(\d+)s\] equal to your (\w+) level/iu.exec(
    companion?.creature?.hp?.special ?? '',
  )
  const hitDice =
    dice && classEntry?.name.toLowerCase() === dice[2].toLowerCase()
      ? `${classEntry.levels}d${dice[1]}`
      : (companion?.creature?.hp?.formula ?? '')
  return { stat, summary, armorClass, maxHp, speed, proficiency, spellAttackBonus, hitDice }
}

/** Template-independent facts: a replacement layout can consume the same companion projection. */
export function buildCompanionSheetData(
  vm: CharacterSheetViewModel,
  companion: CharacterSheetViewModel['companions'][number],
) {
  const { stat, summary, armorClass, maxHp, proficiency, spellAttackBonus, hitDice } =
    getCompanionSheetValues(vm, companion)
  const creature = companion.creature
  const plain = (entries: readonly unknown[]) =>
    renderEntriesToText(entries)
      .replace(/\{@hitYourSpellAttack\}/gu, 'your spell attack modifier')
      .replace(/\bmw\b(?=\s+(?:\(|your|to hit))/gu, 'Melee Weapon Attack:')
      .replace(/\brw\b(?=\s+(?:\(|your|to hit))/gu, 'Ranged Weapon Attack:')
      .replace(/\bm\b(?=\s+(?:Bonus equals|your spell attack))/gu, 'Melee Attack Roll:')
      .replace(/\br\b(?=\s+(?:Bonus equals|your spell attack))/gu, 'Ranged Attack Roll:')
  const bonus = (value: unknown) =>
    typeof value === 'number'
      ? `${value >= 0 ? '+' : ''}${value}`
      : typeof value === 'string'
        ? value
        : ''
  const addsProficiencyToChecksAndSaves = (creature?.trait ?? []).some((trait) =>
    /add your proficiency bonus to any ability check or saving throw/iu.test(
      plain(trait.entries ?? []),
    ),
  )
  const checkBonus = (value: string) =>
    addsProficiencyToChecksAndSaves && /^[+-]?\d+$/u.test(value)
      ? bonus(Number(value) + vm.proficiencyBonus)
      : value
  const abilities = (stat?.abilities ?? []).map((ability) => ({
    ...ability,
    modifier: ability.score == null ? '' : ability.modifier,
    save: checkBonus(
      bonus(creature?.save?.[ability.key]) || (ability.score == null ? '' : ability.modifier),
    ),
    trained: creature?.save?.[ability.key] != null,
  }))
  const skills = ALL_SKILLS.map((name) => {
    const key = ABILITY_FULL_TO_ABBREV[getSkillAbility(name) ?? '']
    return {
      name,
      modifier: checkBonus(
        bonus(creature?.skill?.[name]) ||
          abilities.find((ability) => ability.key === key)?.modifier ||
          '',
      ),
      trained: creature?.skill?.[name] != null,
    }
  })
  const movement = Object.fromEntries(
    Object.entries(creature?.speed ?? {}).map(([mode, value]) => {
      const speed =
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
      return [
        mode,
        typeof value === 'number'
          ? String(value)
          : speed?.number != null
            ? `${speed.number}${speed.condition ? ` ${speed.condition}` : ''}`
            : '',
      ]
    }),
  )
  const actions = (creature?.action ?? []).map((action) => {
    const raw = JSON.stringify(action.entries ?? [])
    const hit = /\{@hit ([+-]?\d+)\}/u.exec(raw)?.[1]
    const damage =
      /\{@damage ([^}|]+)[^}]*\}(?: plus your (strength|dexterity|constitution|intelligence|wisdom|charisma) modifier)?(?: ([a-z]+) damage)?/iu.exec(
        raw,
      )
    const damageParts = damage
      ? [
          damage[1],
          damage[2]
            ? `${vm.abilityModifiers[damage[2].toLowerCase() as AbilityName] >= 0 ? '+' : '-'} ${Math.abs(vm.abilityModifiers[damage[2].toLowerCase() as AbilityName])}`
            : '',
          damage[3],
        ]
      : []
    return {
      name: action.name ?? '',
      bonus: hit
        ? bonus(Number(hit))
        : /\{@hitYourSpellAttack\b/u.test(raw)
          ? bonus(spellAttackBonus)
          : '',
      damage: damageParts.filter(Boolean).join(' '),
    }
  })
  const sections = stat?.sections ?? []
  const renderSection = (section: (typeof sections)[number]) =>
    `${section.title.toUpperCase()}\n${plain([...section.intro, ...section.entries])}`
  return {
    name: companion.name,
    creature: creature?.name ?? companion.name,
    boundTo: companion.name ? vm.character.name : '',
    size: summary?.sizes.join('/') ?? '',
    type: summary?.creatureType ?? '',
    alignment: summary?.subtitle.split(', ').slice(1).join(', ') ?? '',
    armorClass: armorClass || summary?.armorClass || '',
    maxHp: maxHp || summary?.hitPoints || '',
    hitDice,
    proficiency,
    passive:
      creature?.passive == null
        ? ''
        : String(
            typeof creature.passive === 'number' && addsProficiencyToChecksAndSaves
              ? creature.passive + vm.proficiencyBonus
              : creature.passive,
          ),
    abilities,
    skills,
    movement,
    actions,
    senses: (creature?.senses ?? []).filter((sense): sense is string => typeof sense === 'string'),
    defenses: {
      immune: creature?.immune ?? [],
      resist: creature?.resist ?? [],
      vulnerable: creature?.vulnerable ?? [],
      conditions: creature?.conditionImmune ?? [],
    },
    attacks: sections
      .filter((section) => section.id === 'actions')
      .map(renderSection)
      .join('\n\n'),
    traits: [
      companion.source ? `Source: ${companion.source}` : '',
      companion.className ? `Class: ${companion.className}` : '',
      ...(stat?.core ?? []).map((line) => `${line.label}: ${plain([line.value])}`),
      ...(stat?.details ?? []).map((line) => `${line.label}: ${plain([line.value])}`),
      ...sections.filter((section) => section.id !== 'actions').map(renderSection),
      ...(stat?.footer ?? []).map((line) => `${line.label}: ${plain([line.value])}`),
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
