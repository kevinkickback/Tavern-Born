import { getItemTypeCodes, isSelectableEquipmentItem } from '@/lib/calculations/itemClassification'
import { matchesClassChoiceFilter } from '@/lib/character/classChoiceFilters'
import {
  sameStartingReference,
  startingEquipmentLotKey,
} from '@/lib/character/startingEquipmentGrants'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Item5e } from '@/types/5etools'
import type { Character, StartingItemReference } from '@/types/character'
import { parseFilterTags } from './choiceFilterTags'
import { filterCharacterItems } from './playerItemAvailability'
import { buildSuppressedKeys } from './reprints'
import {
  type StartingEquipmentSlotAddress,
  startingEquipmentTextFragments,
  startingFilterRule,
  startingGroupRule,
} from './startingEquipmentClauses'
import { startingItemKey, startingItemUid } from './startingEquipmentIdentity'

export { startingItemKey, startingItemUid } from './startingEquipmentIdentity'

export interface StartingEquipmentPolicy {
  raw: ReadonlyMap<string, Item5e>
  available: ReadonlyMap<string, Item5e>
  itemTypes: Readonly<Record<string, string>>
  character: Pick<Character, 'proficiencies' | 'provenance' | 'startingEquipmentGrants'>
  owner: StartingItemReference & {
    kind: 'class' | 'background'
    entries?: unknown[]
    sourceIdentityConflict?: boolean
  }
  ownerAvailable: boolean
  startingEquipment: unknown
}

/** Relevant setup changes invalidate an open picker; unrelated wallet/runtime edits may proceed. */
export function startingEquipmentSetupHandle(
  character: Character,
  role: 'class' | 'background',
): string {
  return JSON.stringify([
    role === 'class' ? character.initialClass : [character.background, character.backgroundSource],
    role === 'class' ? character.classEquipmentChoices : character.backgroundEquipmentChoices,
    role === 'class'
      ? character.classEquipmentItemChoices
      : character.backgroundEquipmentItemChoices,
    character.proficiencies.tools,
    character.provenance.choices.filter((choice) => choice.domain === 'tools'),
  ])
}

/** Starting authority preserves ambiguity, independently of the general-purpose last-wins lookup. */
function buildStartingItemLookup(items: readonly Item5e[]): Map<string, Item5e> {
  const lookup = new Map<string, Item5e>()
  const ambiguous = new Set<string>()
  for (const item of items) {
    const key = startingItemKey(item)
    if (lookup.has(key)) ambiguous.add(key)
    else lookup.set(key, item)
  }
  for (const key of ambiguous) lookup.delete(key)
  return lookup
}

export function createStartingEquipmentPolicy(
  character: Character,
  owner: StartingEquipmentPolicy['owner'],
  startingEquipment: unknown,
  rawItems: readonly Item5e[],
  availableItems?: readonly Item5e[],
  itemTypes: Readonly<Record<string, string>> = {},
  ownerAvailable?: boolean,
): StartingEquipmentPolicy {
  const allowedSources = character.allowedSources
    ? getEffectiveSources(character.allowedSources, character.originSystem)
    : undefined
  const suppressedKeys =
    character.variantRules?.preferNewerPrintings || character.originSystem === '2024'
      ? buildSuppressedKeys([...rawItems], new Set(allowedSources ?? []))
      : undefined
  return {
    raw: buildStartingItemLookup(rawItems),
    available: buildStartingItemLookup(
      availableItems ??
        filterCharacterItems([...rawItems], {
          allowedSources,
          originSystem: character.originSystem,
          suppressedKeys,
        }),
    ),
    itemTypes,
    character,
    owner,
    ownerAvailable:
      ownerAvailable ??
      (!allowedSources ||
        allowedSources.some(
          (source) => source.trim().toLowerCase() === owner.source.trim().toLowerCase(),
        )),
    startingEquipment,
  }
}

function equipmentText(policy: StartingEquipmentPolicy, block: number): string {
  return startingEquipmentTextFragments(
    policy.owner.kind,
    policy.startingEquipment,
    policy.owner.entries,
    block,
  ).join('\n')
}

function filterTagKey(tag: ReturnType<typeof parseFilterTags>[number]): string {
  return JSON.stringify([
    Object.entries(tag.filter)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value
              .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : entry))
              .sort()
          : typeof value === 'string'
            ? value.trim().toLowerCase()
            : value,
      ]),
    tag.unsupportedClauses,
  ])
}

const tokenRules: Record<
  string,
  { types?: string[]; group?: string; code?: string; weapon?: string; melee?: boolean }
> = {
  weaponsimple: { types: ['simple weapon'], weapon: 'simple' },
  weaponsimplemelee: { types: ['simple weapon'], weapon: 'simple', melee: true },
  weaponmartial: { types: ['martial weapon'], weapon: 'martial' },
  weaponmartialmelee: { types: ['martial weapon'], weapon: 'martial', melee: true },
  instrumentmusical: {
    types: ['instrument', 'musical instrument'],
    code: 'INS',
    group: 'musical instrument',
  },
  toolartisan: { types: ["artisan's tools"], code: 'AT', group: "artisan's tools" },
  setgaming: { types: ['gaming set'], code: 'GS', group: 'gaming set' },
  focusspellcastingarcane: { group: 'arcane focus' },
  focusspellcastingholy: { group: 'holy symbol' },
  focusspellcastingdruidic: { group: 'druidic focus' },
}

function matchesToken(item: Item5e, rule: (typeof tokenRules)[string]): boolean {
  const types = getItemTypeCodes(item.type)
  return (
    (!rule.code || types.includes(rule.code)) &&
    (!rule.weapon || item.weaponCategory?.toLowerCase() === rule.weapon) &&
    (!rule.melee || types.includes('M'))
  )
}

function proficient(policy: StartingEquipmentPolicy, item: Item5e, text: string): boolean {
  if (policy.owner.kind !== 'background') return true
  const backgroundChoice =
    /same as above|tool you choose for this background|matching your chosen proficiency/i.test(text)
  const effective = /(?:with which|you are) proficient|you are proficient with/i.test(text)
  if (!backgroundChoice && !effective) return true
  const matchesName = (name: string) => {
    const uid = name.includes('|') ? startingItemUid(name) : undefined
    return uid
      ? sameStartingReference(uid, item)
      : normalizeKey(stripItemTag(name)) === normalizeKey(item.name)
  }
  if (!policy.character.proficiencies.tools.some(matchesName)) return false
  if (!backgroundChoice) return true
  return policy.character.provenance.choices.some(
    (choice) =>
      choice.domain === 'tools' &&
      choice.sourceTag.sourceType === 'background' &&
      sameStartingReference(
        { name: choice.sourceTag.sourceName, source: choice.sourceTag.sourceRef ?? '' },
        policy.owner,
      ) &&
      choice.selected.some(matchesName) &&
      (!choice.selectedRefs?.length ||
        choice.selectedRefs.some(
          (ref) =>
            ref.source && sameStartingReference({ name: ref.name, source: ref.source }, item),
        )) &&
      (policy.character.provenance.proficiencies.tools[normalizeKey(item.name)] ?? []).some(
        (tag) =>
          tag.sourceType === 'background' &&
          tag.grantType === 'choice' &&
          sameStartingReference(
            { name: tag.sourceName, source: tag.sourceRef ?? '' },
            policy.owner,
          ),
      ),
  )
}

const druidicFocus = { name: 'Druidic Focus', source: 'XPHB' }
const quarterstaffFocus = {
  display: 'Druidic Focus (Quarterstaff)',
  member: { name: 'Wooden Staff', source: 'XPHB' },
}

const entryRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const itemReference = (value: unknown) =>
  typeof value === 'string' ? startingItemUid(value) : undefined

/** SRD 5.2.1 pp. 41 and 97 bind this exact package qualifier to the Wooden Staff focus. */
export function resolveFixedStartingEquipmentMember(
  policy: StartingEquipmentPolicy,
  block: number,
  option: string,
  entries: readonly unknown[],
):
  | {
      reference: StartingItemReference
      entry: number
      replacesEntry: boolean
      item?: Item5e
      diagnostic?: string
    }
  | undefined {
  if (
    policy.owner.kind !== 'class' ||
    !sameStartingReference(policy.owner, { name: 'Druid', source: 'XPHB' }) ||
    block !== 0 ||
    option.toLowerCase() !== 'a'
  )
    return undefined

  const entry = 3
  const reference = quarterstaffFocus.member
  const groupEntry = (value: unknown) =>
    sameStartingReference(itemReference(entryRecord(value)?.item ?? value), druidicFocus)
  const currentEntry = entries[entry]
  const declaresGroup = groupEntry(currentEntry)
  const directMember = sameStartingReference(
    itemReference(entryRecord(currentEntry)?.item ?? currentEntry),
    reference,
  )
  const replacesEntry = declaresGroup || directMember
  const fragments = startingEquipmentTextFragments(
    'class',
    policy.startingEquipment,
    policy.owner.entries,
    block,
  )
  const declaredInText =
    fragments.length === 1 &&
    !startingGroupRule(
      fragments,
      druidicFocus,
      [`${reference.name}|${reference.source}`],
      { option, entry },
      quarterstaffFocus,
    ).diagnostic
  const prior = policy.character.startingEquipmentGrants?.class
  const key = startingEquipmentLotKey(block, 'a', entry, { kind: 'item', ...reference })
  const retained =
    prior &&
    sameStartingReference(prior.owner, policy.owner) &&
    prior.items.some(
      (lot) =>
        lot.key === key &&
        lot.reference.kind === 'item' &&
        sameStartingReference(lot.reference, reference),
    )
  if (!declaresGroup && !declaredInText && (directMember || !retained)) return undefined

  const unavailable = {
    reference,
    entry,
    replacesEntry,
    diagnostic: 'Restore the exact Wooden Staff starting focus rules.',
  }
  const packageData = entryRecord(policy.startingEquipment)?.defaultData
  const currentBlock = Array.isArray(packageData) && entryRecord(packageData[block])
  const packageKeys = currentBlock
    ? Object.keys(currentBlock).filter((key) => key.toLowerCase() === 'a')
    : []
  const packageA =
    currentBlock && packageKeys.length === 1 ? currentBlock[packageKeys[0]] : undefined
  const entryMatches = (value: unknown) => {
    const row = entryRecord(value)
    return (
      row &&
      Object.keys(row).every((key) => ['item', 'quantity', 'displayName'].includes(key)) &&
      (row.quantity === undefined || row.quantity === 1) &&
      (row.displayName === undefined ||
        (typeof row.displayName === 'string' &&
          row.displayName.trim().toLowerCase() === quarterstaffFocus.display.toLowerCase())) &&
      sameStartingReference(itemReference(row.item), druidicFocus)
    )
  }
  if (
    !policy.ownerAvailable ||
    policy.owner.sourceIdentityConflict ||
    !Array.isArray(packageA) ||
    !entryMatches(entries[entry]) ||
    !entryMatches(packageA[entry]) ||
    packageA.filter(groupEntry).length !== 1 ||
    !declaredInText
  )
    return unavailable

  const group = policy.raw.get(startingItemKey(druidicFocus))
  const item = policy.raw.get(startingItemKey(reference))
  const isDruidicFocus = (row: Item5e | undefined) =>
    !!row &&
    !row.sourceIdentityConflict &&
    typeof row.type === 'string' &&
    row.type.toLowerCase() === 'scf|xphb' &&
    row.scfType === 'druid'
  if (
    !isDruidicFocus(group) ||
    !Array.isArray(group?.items) ||
    !item ||
    !isDruidicFocus(item) ||
    !isSelectableEquipmentItem(item) ||
    !Array.isArray(item.group) ||
    !item.group.some(
      (name) => typeof name === 'string' && name.trim().toLowerCase() === 'druidic focus',
    ) ||
    !item.dmg1 ||
    !item.dmg2 ||
    !item.dmgType ||
    item.weaponCategory !== 'simple'
  )
    return unavailable

  const memberUids = group.items.filter((uid): uid is string => typeof uid === 'string')
  if (
    memberUids.filter((uid) => sameStartingReference(startingItemUid(uid), reference)).length !== 1
  )
    return unavailable
  return { reference, entry, replacesEntry, item }
}

export interface StartingEquipmentCandidates {
  candidates: Item5e[]
  diagnostic?: string
}

/** The same declaration-derived pool authorizes presentation, commit and current-state validation. */
export function getStartingEquipmentCandidates(
  policy: StartingEquipmentPolicy,
  block: number,
  token: string | undefined,
  declaredGroup?: StartingItemReference,
  address?: StartingEquipmentSlotAddress,
): StartingEquipmentCandidates {
  if (!policy.ownerAvailable)
    return { candidates: [], diagnostic: 'Restore the selected owner’s source rules.' }
  const text = equipmentText(policy, block)
  const rule = token ? tokenRules[token.toLowerCase()] : undefined
  if (token && !rule)
    return { candidates: [], diagnostic: 'This starting item category is not supported.' }
  const itemTags = [...text.matchAll(/\{@item\s+([^|}]+)(?:\|([^|}]*))?(?:\|[^}]*)?}/gi)].map(
    (match) => ({ name: match[1].trim(), source: match[2]?.trim() || 'PHB' }),
  )
  const groups = declaredGroup
    ? [declaredGroup]
    : itemTags.filter((ref) => rule?.group === ref.name.toLowerCase())
  if (groups.length > 0) {
    const unique = new Map(groups.map((ref) => [startingItemKey(ref), ref]))
    if (unique.size !== 1)
      return { candidates: [], diagnostic: 'The starting item group declaration is ambiguous.' }
    const group = policy.raw.get([...unique.keys()][0])
    if (!group || !Array.isArray(group.items))
      return { candidates: [], diagnostic: 'Restore the exact starting item group.' }
    const localRule = startingGroupRule(
      startingEquipmentTextFragments(
        policy.owner.kind,
        policy.startingEquipment,
        policy.owner.entries,
        block,
      ),
      group,
      group.items.filter((uid): uid is string => typeof uid === 'string'),
      address,
    )
    if (localRule.diagnostic) return { candidates: [], diagnostic: localRule.diagnostic }
    const relationText =
      localRule.relation === 'background'
        ? 'same as above'
        : localRule.relation === 'effective'
          ? 'you are proficient with'
          : ''
    const members = new Map<string, Item5e>()
    for (const uid of group.items) {
      const ref = typeof uid === 'string' ? startingItemUid(uid) : undefined
      const item = ref && policy.raw.get(startingItemKey(ref))
      if (
        item &&
        (!localRule.members ||
          localRule.members.some((member) => sameStartingReference(member, item))) &&
        isSelectableEquipmentItem(item) &&
        (!rule || matchesToken(item, rule)) &&
        proficient(policy, item, relationText)
      )
        members.set(startingItemKey(item), item)
    }
    return {
      candidates: [...members.values()].sort(
        (a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
      ),
    }
  }
  const filters = parseFilterTags(text).filter(
    (tag) =>
      tag.entityType === 'item' &&
      tag.filter.itemTypes?.some((type) => rule?.types?.includes(type.toLowerCase())),
  )
  const unique = new Map(filters.map((tag) => [filterTagKey(tag), tag]))
  if (unique.size !== 1)
    return {
      candidates: [],
      diagnostic: 'The starting item eligibility rule is missing or ambiguous.',
    }
  const tag = [...unique.values()][0]
  if (tag.unsupportedClauses?.length)
    return { candidates: [], diagnostic: 'A starting item rule needs manual review.' }
  const localRule = startingFilterRule(
    startingEquipmentTextFragments(
      policy.owner.kind,
      policy.startingEquipment,
      policy.owner.entries,
      block,
    ),
    address,
    (source) =>
      parseFilterTags(source).some((candidate) => filterTagKey(candidate) === filterTagKey(tag)),
  )
  if (localRule.diagnostic) return { candidates: [], diagnostic: localRule.diagnostic }
  const relationText =
    localRule.relation === 'background'
      ? 'same as above'
      : localRule.relation === 'effective'
        ? 'you are proficient with'
        : ''
  const pool = tag.filter.source ? policy.raw : policy.available
  const candidates = [...pool.values()].filter(
    (item) =>
      isSelectableEquipmentItem(item) &&
      !!rule &&
      matchesToken(item, rule) &&
      matchesClassChoiceFilter(item, tag.filter, {}, policy.itemTypes, [], 1) &&
      proficient(policy, item, relationText),
  )
  return {
    candidates: candidates.sort(
      (a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
    ),
  }
}
