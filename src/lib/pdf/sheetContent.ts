import { getSpellNameKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import type { CharacterAction } from '@/types/actions'
import { CHARACTER_SHEET_CAPACITIES } from './characterSheetCapacities'
import { paginateOfficial2014SpellPages } from './characterSheetMapping2014Official'
import { getOptionalCharacterSheetPages } from './characterSheetPages'
import { getCharacterSheetTemplate } from './characterSheetTemplates'
import type { CharacterSheetSpellRow, CharacterSheetViewModel } from './characterSheetViewModel'
import { formatSheetResource } from './classResourceSheetRules'
import type {
  CharacterSheetPageOptions,
  CharacterSheetTemplateId,
  SheetContentChoices,
  SheetOverflowSection,
  SheetPresentationOptions,
} from './types'

export interface SheetContentGroup {
  id: string
  label: string
  capacity: number
  entries: { id: string; name: string; detail: string; text: string }[]
  selected: string[]
  automatic: boolean
}

/** Whitespace-only compaction never removes rules, costs, conditions, or exceptions. */
export function compactSheetText(text: string) {
  return text
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const actionText = (action: CharacterAction) =>
  [
    action.name,
    action.attackBonus == null
      ? ''
      : `Attack: ${action.attackBonus >= 0 ? '+' : ''}${action.attackBonus}`,
    action.attackDisadvantage,
    action.save ? `Save: DC ${action.save.dc} ${action.save.ability ?? ''}` : '',
    action.range,
    ...(action.damage ?? []).map(
      (damage) =>
        `${damage.dice ?? ''} ${damage.bonus >= 0 ? '+' : ''}${damage.bonus} ${damage.damageType ?? ''}`,
    ),
    action.resourceCost
      ? `Cost: ${action.resourceCost.amount} ${action.resourceCost.resourceId}`
      : '',
    action.recharge?.rest ? `${action.recharge.rest} rest` : '',
    action.recharge?.note,
    action.description,
  ]
    .filter(Boolean)
    .join('; ')

const spellLevel = (row: CharacterSheetSpellRow) =>
  row.level === 'C' ? 'Cantrip' : `Level ${row.level || '?'}`

const spellStatus = (row: CharacterSheetSpellRow) =>
  row.prepared ? 'Ready' : row.castOnly ? 'Feature cast' : 'Unprepared'

function formatSheetSpellOverflow(row: CharacterSheetSpellRow) {
  return [
    row.name,
    spellLevel(row),
    spellStatus(row),
    row.castingTimeAndDuration,
    row.notes,
    row.concentration ? 'Concentration' : '',
    row.ritual ? 'Ritual' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export function isCombinedSpellOverflow(id: string) {
  return id.startsWith('combined-spells:') || id === 'unsupported:pact-slots'
}

export function planSheetContent(
  vm: CharacterSheetViewModel,
  templateId: CharacterSheetTemplateId,
  choices: SheetContentChoices = {},
  pages: CharacterSheetPageOptions = {},
  spellLayout?: SheetPresentationOptions['spellLayout'],
) {
  const template = getCharacterSheetTemplate(templateId)
  const combined = spellLayout === 'combined'
  const spellcastingSources = combined
    ? [...vm.spellcastingSources].sort(
        (a, b) => (b.classDetail?.classLevel ?? 0) - (a.classDetail?.classLevel ?? 0),
      )
    : vm.spellcastingSources
  const mpmb = template.id === '2014-custom'
  const capacity =
    CHARACTER_SHEET_CAPACITIES[
      template.edition === '2024' ? '2024' : mpmb ? '2014-custom' : '2014-official'
    ]
  const groups: SheetContentGroup[] = []
  const overflow: SheetOverflowSection[] = []
  function select<T>(
    id: string,
    label: string,
    rows: readonly T[],
    limit: number,
    describe: (row: T, index: number) => SheetContentGroup['entries'][number],
    eligible: (row: T) => boolean = () => true,
  ) {
    const entries = rows.map(describe)
    const previous = choices[id]
    const saved =
      previous?.length && !entries.some((entry) => previous.includes(entry.id))
        ? undefined
        : previous
    const selected =
      saved === undefined
        ? entries
            .filter((_, index) => eligible(rows[index]))
            .slice(0, limit)
            .map((entry) => entry.id)
        : entries
            .filter((entry) => saved.includes(entry.id))
            .slice(0, limit)
            .map((entry) => entry.id)
    groups.push({ id, label, capacity: limit, entries, selected, automatic: saved === undefined })
    const remaining = entries.filter((entry) => !selected.includes(entry.id))
    if (remaining.length)
      overflow.push({
        id: `content:${id}`,
        groupId: id,
        title: label,
        text: remaining.map((entry) => entry.text).join('\n\n'),
      })
    return rows.filter((_, index) => selected.includes(entries[index].id))
  }
  const weaponRows = select(
    'weapons',
    'Attacks',
    [...vm.weaponRows].sort((a, b) => Number(b.active !== false) - Number(a.active !== false)),
    capacity.weapons,
    (row, index) => ({
      id: row.id ?? `${row.name}:${index}`,
      name: row.name,
      detail: row.active === false ? 'Not equipped' : 'Equipped / active',
      text: [
        row.name,
        `Attack ${row.attackBonus}`,
        `${row.damage} ${row.damageType}`,
        row.range,
        row.notes,
        row.description,
      ]
        .filter(Boolean)
        .join('; '),
    }),
  )
  const spellRows = [...vm.spellRows].sort(
    (a, b) => Number(b.prepared || b.castOnly) - Number(a.prepared || a.castOnly),
  )
  if (combined) {
    const names = new Set<string>()
    const duplicateNames = new Set<string>()
    for (const row of spellRows) {
      const name = getSpellNameKey(row.name)
      if (names.has(name)) duplicateNames.add(name)
      names.add(name)
    }
    for (const [index, row] of spellRows.entries()) {
      const source = row.id && parseSpellReference(row.id).source
      if (source && duplicateNames.has(getSpellNameKey(row.name))) {
        spellRows[index] = { ...row, name: `${row.name} (${source.toUpperCase()})` }
      }
    }
  }
  const selectedSpells = select(
    'spells',
    'Spells',
    spellRows,
    template.edition === '2024' ? CHARACTER_SHEET_CAPACITIES['2024'].spells : spellRows.length,
    (row, index) => ({
      id: row.id ?? `${row.name}:${index}`,
      name: row.name,
      detail: `${spellLevel(row)} · ${spellStatus(row)}${row.ritual ? ' · Ritual' : ''}`,
      text: formatSheetSpellOverflow(row),
    }),
    (row) =>
      combined ||
      template.edition === '2014' ||
      row.prepared ||
      row.castOnly ||
      row.level === 'C' ||
      !row.level,
  )
  let actions = vm.actions
  let feats = vm.feats
  let magicItems = vm.magicItems
  let equipment = vm.equipmentForSheet ?? vm.character.equipment
  if (mpmb) {
    const actionGroups = ['action', 'bonus-action', 'reaction'] as const
    actions = [...vm.actions.filter((action) => !actionGroups.some((kind) => kind === action.kind))]
    for (const kind of actionGroups) {
      const rows = vm.actions
        .filter((action) => action.kind === kind)
        .sort(
          (a, b) =>
            Number(b.active) - Number(a.active) ||
            Number(b.source.kind === 'manual') - Number(a.source.kind === 'manual'),
        )
      actions.push(
        ...select(
          kind,
          kind === 'action' ? 'Actions' : kind === 'bonus-action' ? 'Bonus actions' : 'Reactions',
          rows,
          6,
          (action) => ({
            id: action.id,
            name: action.name,
            detail: action.active ? 'Available' : 'Inactive',
            text: actionText(action),
          }),
          (action) => action.active,
        ).map((action) => ({ ...action, active: true })),
      )
    }
    feats = select('feats', 'Feat cards', vm.feats, 4, (feat) => ({
      id: feat.id,
      name: feat.name,
      detail: feat.source,
      text: `${feat.name}\n${feat.description}`,
    }))
    magicItems = select(
      'magic-items',
      'Magic item cards',
      [...vm.magicItems].sort(
        (a, b) => Number(b.attuned) - Number(a.attuned) || Number(b.equipped) - Number(a.equipped),
      ),
      5,
      (item) => ({
        id: item.id,
        name: item.name,
        detail: item.attuned ? 'Attuned' : item.equipped ? 'Equipped' : '',
        text: `${item.name}\n${item.description ?? ''}`,
      }),
    )
    equipment = select(
      'equipment',
      'Inventory',
      [...equipment].sort((a, b) => Number(b.equipped) - Number(a.equipped)),
      90,
      (item) => ({
        id: item.id,
        name: item.name,
        detail: item.equipped ? 'Equipped' : '',
        text: `${item.name} × ${item.quantity}${item.weight ? `; ${item.weight} lb. each` : ''}\n${item.description ?? ''}`,
      }),
    )
  }
  const automaticSpells = groups.find((group) => group.id === 'spells')?.automatic
  const spellOverflow = overflow.find((section) => section.id === 'content:spells')
  if (combined && automaticSpells && spellOverflow) spellOverflow.id = 'combined-spells:capacity'
  const spellPages =
    !combined && vm.spellcastingPages.length
      ? vm.spellcastingPages
      : [{ detail: undefined, spellRows: combined ? spellRows : vm.spellRows }]
  for (const page of spellPages) {
    const unknown = page.spellRows.filter(
      (row) =>
        row.level !== 'C' &&
        !/^[1-9]$/.test(row.level) &&
        (automaticSpells ||
          selectedSpells.some(
            (selected) => (selected.id ?? selected.name) === (row.id ?? row.name),
          )),
    )
    if (unknown.length)
      overflow.push({
        id: 'unknown-spell-levels:' + (page.detail?.profileId ?? 'unassigned'),
        groupId: 'spells',
        title: page.detail
          ? page.detail.sourceName + ': spells with unknown levels'
          : 'Spells with unknown levels',
        text: unknown.map((row) => row.name + ' — spell level unknown').join('\n'),
      })
  }
  const castingLimit = template.edition === '2024' ? 1 : mpmb ? 2 : Infinity
  if (spellcastingSources.length > castingLimit)
    overflow.push({
      id: 'capacity:spellcasting-profiles',
      title: 'Additional spellcasting abilities',
      text: spellcastingSources
        .slice(castingLimit)
        .map(
          (detail) =>
            `${detail.sourceName}: ${detail.spellcastingAbility ?? 'unselected ability'}; save DC ${detail.spellSaveDC ?? 'unknown'}; attack ${detail.spellAttackBonus ?? 'unknown'}`,
        )
        .join('\n'),
    })
  if (template.edition === '2024') {
    const attuned = vm.magicItems.filter((item) => item.attuned)
    if (attuned.length > 3)
      overflow.push({
        id: 'capacity:attunements',
        title: 'Additional attuned items',
        text: attuned
          .slice(3)
          .map((item) => item.name)
          .join('\n'),
      })
  }
  if (combined || template.edition === '2024') {
    const printsPact =
      template.edition === '2014' &&
      spellcastingSources[0]?.classDetail?.casterProgression === 'pact'
    const hiddenSlots = Object.entries(
      printsPact ? vm.spellSlots.mergedSharedWithUsage : vm.spellSlots.mergedPactWithUsage,
    ).filter(([, slot]) => slot?.max)
    if (hiddenSlots.length)
      overflow.push({
        id: printsPact ? 'combined-spells:slots' : 'unsupported:pact-slots',
        ...(combined && { groupId: 'spells' }),
        title: printsPact ? 'Spellcasting slots' : 'Pact Magic slots',
        text: hiddenSlots
          .map(([level, slot]) => `Level ${level}: ${slot?.max} total; ${slot?.used} expended`)
          .join('\n'),
      })
  }
  if (mpmb) {
    if (vm.hitDiceRows.length > 3)
      overflow.push({
        id: 'capacity:hit-dice',
        title: 'Additional Hit Dice',
        text: vm.hitDiceRows
          .slice(3)
          .map((row) => `${row.level}${row.die}; ${row.used ?? 0} used`)
          .join('\n'),
      })
    if (vm.classResourceRows.length > 8)
      overflow.push({
        id: 'capacity:class-resources',
        title: 'Additional resources',
        text: vm.classResourceRows
          .slice(8)
          .map((row) => formatSheetResource(row, vm.classResourceRows))
          .join('\n'),
      })
  }
  const selectedSpellIds = new Set(selectedSpells.map((row) => row.id ?? row.name))
  const spellsOmitted = getOptionalCharacterSheetPages(vm, templateId, pages).some(
    (page) => page.id === 'spells' && !page.included,
  )
  let printableSpells = selectedSpells
  if (combined && template.edition === '2014' && !spellsOmitted) {
    const [first, ...remaining] = paginateOfficial2014SpellPages({
      ...vm,
      spellcastingSources,
      spellcastingPages: [],
      spellRows: selectedSpells,
    })
    printableSpells = first.spellRows
    if (remaining.length)
      overflow.push({
        id: 'combined-spells:capacity',
        groupId: 'spells',
        title: 'Additional spells',
        text: remaining
          .flatMap((page) => page.spellRows.map(formatSheetSpellOverflow))
          .join('\n\n'),
      })
  }
  return {
    groups: groups.filter((group) => group.entries.length > 0),
    overflow: spellsOmitted
      ? overflow.filter(
          (section) =>
            section.groupId !== 'spells' && section.id !== 'capacity:spellcasting-profiles',
        )
      : overflow,
    viewModel: {
      ...vm,
      weaponRows,
      actions,
      feats,
      magicItems,
      equipmentForSheet: equipment,
      spellRows: printableSpells,
      spellRowsForSheet: printableSpells,
      markUnpreparedSpells: combined,
      spellcastingSources,
      spellcastingPages: (combined ? [] : vm.spellcastingPages).map((page) => ({
        ...page,
        spellRows: page.spellRows
          .filter((row) => selectedSpellIds.has(row.id ?? row.name))
          .sort((a, b) => Number(b.prepared) - Number(a.prepared)),
      })),
    } satisfies CharacterSheetViewModel,
  }
}
