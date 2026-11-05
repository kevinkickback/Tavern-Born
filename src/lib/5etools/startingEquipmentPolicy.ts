import { getItemTypeCodes, isSelectableEquipmentItem } from '@/lib/calculations/itemClassification'
import { matchesClassChoiceFilter } from '@/lib/character/classChoiceFilters'
import { sameStartingReference } from '@/lib/character/startingEquipmentGrants'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Item5e } from '@/types/5etools'
import type { Character, StartingItemReference } from '@/types/character'
import { parseFilterTags } from './choiceFilterTags'
import { filterCharacterItems } from './playerItemAvailability'
import { buildSuppressedKeys } from './reprints'
import {
  type StartingEquipmentSlotAddress,
  startingEquipmentBranchText,
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

export const isRevisedDruidStartingOwner = (owner: StartingEquipmentPolicy['owner']) =>
  owner.kind === 'class' && sameStartingReference(owner, { name: 'Druid', source: 'XPHB' })

const focusEntry = 3
const restoreFocus = 'Restore the exact Wooden Staff starting focus rules.'
const entryReference = (value: unknown) => itemReference(entryRecord(value)?.item ?? value)
const memberEntry = (value: unknown) =>
  sameStartingReference(entryReference(value), quarterstaffFocus.member)

function declaresQuarterstaffFocus(policy: StartingEquipmentPolicy): boolean {
  const fragments = startingEquipmentTextFragments(
    'class',
    policy.startingEquipment,
    policy.owner.entries,
    0,
  )
  return (
    fragments.length === 1 &&
    !startingGroupRule(
      fragments,
      druidicFocus,
      [`${quarterstaffFocus.member.name}|${quarterstaffFocus.member.source}`],
      { option: 'a', entry: focusEntry },
      quarterstaffFocus,
    ).diagnostic
  )
}

function validEquipmentEntry(value: unknown): boolean {
  if (typeof value === 'string') return !!itemReference(value)
  const row = entryRecord(value)
  if (!row) return false
  const named = ['item', 'equipmentType', 'special'].filter((key) => row[key] !== undefined)
  const coins = ['value', 'containsValue'].filter((key) => row[key] !== undefined)
  return (
    (named.length > 0 || coins.length > 0) &&
    named.length <= 1 &&
    named.every((key) => typeof row[key] === 'string' && row[key].trim()) &&
    (row.item === undefined || !!itemReference(row.item)) &&
    coins.every(
      (key) => typeof row[key] === 'number' && Number.isSafeInteger(row[key]) && row[key] >= 0,
    ) &&
    (row.quantity === undefined ||
      (typeof row.quantity === 'number' &&
        Number.isSafeInteger(row.quantity) &&
        row.quantity > 0)) &&
    (row.displayName === undefined || typeof row.displayName === 'string')
  )
}

function isCanonicalFocusEntry(value: unknown): boolean {
  const row = entryRecord(value)
  return (
    !!row &&
    Object.keys(row).every((key) => ['item', 'quantity', 'displayName'].includes(key)) &&
    (row.quantity === undefined || row.quantity === 1) &&
    (row.displayName === undefined ||
      (typeof row.displayName === 'string' &&
        row.displayName.trim().toLowerCase() === quarterstaffFocus.display.toLowerCase())) &&
    sameStartingReference(itemReference(row.item), druidicFocus)
  )
}

function currentPackage(block: Record<string, unknown>, option: string): unknown[] | undefined {
  const keys = Object.keys(block).filter((key) => key.toLowerCase() === option)
  const entries = keys.length === 1 ? block[keys[0]] : undefined
  return Array.isArray(entries) && entries.length && entries.every(validEquipmentEntry)
    ? entries
    : undefined
}

/** Suspend incomplete or conflicting declarations before generic package fallback or lot issuance. */
export function getRevisedDruidPackageIssues(
  policy: StartingEquipmentPolicy,
  blocks: readonly unknown[],
): Record<string, string | undefined> | undefined {
  if (!isRevisedDruidStartingOwner(policy.owner)) return undefined
  if (!policy.ownerAvailable || policy.owner.sourceIdentityConflict) {
    const issue = 'Restore the exact Druid source rules.'
    return { a: issue, b: issue }
  }
  const data = entryRecord(policy.startingEquipment)?.defaultData
  if (!Array.isArray(data) || (data !== blocks && JSON.stringify(data) !== JSON.stringify(blocks)))
    return { a: restoreFocus, b: restoreFocus }
  const current = entryRecord(data[0])
  if (!current) return { a: restoreFocus, b: restoreFocus }
  const a = currentPackage(current, 'a')
  const b = currentPackage(current, 'b')
  const groupClaim = (row: unknown) =>
    normalizeKey(entryReference(row)?.name ?? '') === 'druidic focus'
  const groups = a?.filter(groupClaim)
  const rawClaim = Object.entries(current).some(
    ([key, entries]) =>
      key.toLowerCase() === 'a' && Array.isArray(entries) && entries.some(groupClaim),
  )
  const proseClaim = startingEquipmentTextFragments(
    'class',
    policy.startingEquipment,
    policy.owner.entries,
    0,
  ).some((fragment) =>
    /\bdruidic focus\b/i.test(startingEquipmentBranchText(fragment, 'a') ?? fragment),
  )
  const canonicalIntent = rawClaim || proseClaim
  const conflictingShared = data.some((rawBlock) => {
    const shared = entryRecord(rawBlock)?._
    return (
      shared !== undefined &&
      (!Array.isArray(shared) ||
        !shared.every(validEquipmentEntry) ||
        (canonicalIntent && shared.some(memberEntry)))
    )
  })
  if (conflictingShared) return { a: restoreFocus, b: restoreFocus }
  const memberCount = a?.filter(memberEntry).length
  const validA = canonicalIntent
    ? isCanonicalFocusEntry(a?.[focusEntry]) && groups?.length === 1 && !memberCount
    : memberCount === 1
  return {
    a: validA ? undefined : restoreFocus,
    b: b ? undefined : 'Restore the exact Druid Package B rules.',
  }
}

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
      item?: Item5e
      diagnostic?: string
    }
  | undefined {
  if (!isRevisedDruidStartingOwner(policy.owner) || block !== 0 || option.toLowerCase() !== 'a')
    return undefined

  const entry = focusEntry
  const reference = quarterstaffFocus.member
  if (!isCanonicalFocusEntry(entries[entry])) return undefined
  const unavailable = { reference, entry, diagnostic: restoreFocus }
  if (!policy.ownerAvailable || !declaresQuarterstaffFocus(policy)) return unavailable

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
  return { reference, entry, item }
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
