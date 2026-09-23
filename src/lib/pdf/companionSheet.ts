import { buildCreatureChoiceSummary, buildCreatureStatBlock } from '@/lib/5etools/creatureStatBlock'
import { ABILITY_FULL_TO_ABBREV } from '@/lib/calculations/abilityNames'
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
  const armorClass = summary?.armorClass.match(/^13\s*\+\s*PB\b/iu)
    ? String(13 + viewModel.proficiencyBonus)
    : (summary?.armorClass.match(/^\d+$/u)?.[0] ?? '')
  const classLevel = viewModel.character.classProgression.find(
    (entry) => entry.name === companion?.className,
  )?.levels
  const maxHp =
    companion?.creature?.hp?.average != null
      ? String(companion.creature.hp.average)
      : companion?.className === 'Ranger' &&
          classLevel != null &&
          /^5\s*\+\s*five times your ranger level\b/iu.test(companion.creature?.hp?.special ?? '')
        ? String(5 + 5 * classLevel)
        : ''
  const walkSpeed = companion?.creature?.speed?.walk
  const speed = typeof walkSpeed === 'number' ? `${walkSpeed} ft.` : (summary?.speed ?? '')
  return { stat, summary, armorClass, maxHp, speed }
}

/** Template-independent facts: a replacement layout can consume the same companion projection. */
export function buildCompanionSheetData(
  vm: CharacterSheetViewModel,
  companion: CharacterSheetViewModel['companions'][number],
) {
  const { stat, summary, armorClass, maxHp } = getCompanionSheetValues(vm, companion)
  const creature = companion.creature
  const plain = (entries: readonly unknown[]) =>
    renderEntriesToText(entries)
      .replace(/\{@hitYourSpellAttack\}/gu, 'your spell attack modifier')
      .replace(/\bmw\b(?=\s+(?:\(|your|to hit))/gu, 'Melee Weapon Attack:')
      .replace(/\brw\b(?=\s+(?:\(|your|to hit))/gu, 'Ranged Weapon Attack:')
  const bonus = (value: unknown) =>
    typeof value === 'number'
      ? `${value >= 0 ? '+' : ''}${value}`
      : typeof value === 'string'
        ? value
        : ''
  const abilities = (stat?.abilities ?? []).map((ability) => ({
    ...ability,
    modifier: ability.score == null ? '' : ability.modifier,
    save: bonus(creature?.save?.[ability.key]) || (ability.score == null ? '' : ability.modifier),
    trained: creature?.save?.[ability.key] != null,
  }))
  const skills = ALL_SKILLS.map((name) => {
    const key = ABILITY_FULL_TO_ABBREV[getSkillAbility(name) ?? '']
    return {
      name,
      modifier:
        bonus(creature?.skill?.[name]) ||
        abilities.find((ability) => ability.key === key)?.modifier ||
        '',
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
    return {
      name: action.name ?? '',
      bonus: hit ? bonus(Number(hit)) : '',
      damage:
        /\{@damage ([^}|]+)[^}]*\}(?: ([a-z]+) damage)?/u
          .exec(raw)
          ?.slice(1)
          .filter(Boolean)
          .join(' ') ?? '',
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
    hitDice: creature?.hp?.formula ?? '',
    proficiency:
      creature?.pbNote === 'equals your bonus'
        ? bonus(vm.proficiencyBonus)
        : (stat?.proficiencyBonus ?? ''),
    passive: creature?.passive == null ? '' : String(creature.passive),
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
