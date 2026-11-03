import { sameStartingReference } from '@/lib/character/startingEquipmentGrants'
import type { StartingItemReference } from '@/types/character'
import { splitInlineTagSegments } from './inlineTagSegments'
import { startingItemKey, startingItemUid } from './startingEquipmentIdentity'

export interface StartingEquipmentSlotAddress {
  option: string
  entry: number
  displayName?: string
}
interface GroupRule {
  relation: 'any' | 'background' | 'effective'
  members?: StartingItemReference[]
  diagnostic?: string
}
const unsupported = (): GroupRule => ({
  relation: 'any',
  diagnostic: 'This starting item qualifier needs manual review.',
})

/** Keep source strings intact; rendered text/HTML and JSON serialization lose clause boundaries. */
export function startingEquipmentTextFragments(
  kind: 'class' | 'background',
  startingEquipment: unknown,
  ownerEntries: unknown[] | undefined,
  block: number,
): string[] {
  const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(strings)
    if (!value || typeof value !== 'object') return []
    const record = value as Record<string, unknown>
    return ['entry', 'entries', 'items'].flatMap((key) => strings(record[key]))
  }
  if (kind === 'class') {
    const data = startingEquipment as { default?: unknown[]; entries?: unknown[] } | undefined
    return strings(data?.default?.[block] ?? data?.entries)
  }
  const visit = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(visit)
    if (!value || typeof value !== 'object') return []
    const record = value as Record<string, unknown>
    return typeof record.name === 'string' && /^equipment\s*:/i.test(record.name)
      ? strings(record.entry ?? record.entries)
      : Object.values(record).flatMap(visit)
  }
  return visit(ownerEntries)
}

function branchText(text: string, option: string): string | undefined {
  const markers = splitInlineTagSegments(text)
    .filter((segment) => !segment.tag)
    .flatMap((segment) =>
      [...segment.text.matchAll(/\(([a-z])\)/gi)].map((match) => ({
        key: match[1].toLowerCase(),
        start: segment.start + (match.index ?? 0),
        end: segment.start + (match.index ?? 0) + match[0].length,
      })),
    )
  if (!markers.length) return text
  const selected = markers.flatMap((marker, index) =>
    marker.key === option.toLowerCase() ? [text.slice(marker.end, markers[index + 1]?.start)] : [],
  )
  return selected.length === 1 ? selected[0] : undefined
}

function parentheticals(text: string) {
  const values: Array<{ value: string; start: number; end: number }> = []
  let depth = 0,
    start = 0
  for (const segment of splitInlineTagSegments(text)) {
    if (segment.malformed) return { values, invalid: true }
    if (segment.tag) continue
    for (let index = 0; index < segment.text.length; index++) {
      const position = segment.start + index
      if (segment.text[index] === '(') {
        if (!depth) start = position
        depth++
      } else if (segment.text[index] === ')') {
        if (!depth) return { values, invalid: true }
        if (--depth === 0)
          values.push({ value: text.slice(start + 1, position), start, end: position + 1 })
      }
    }
  }
  return { values, invalid: depth !== 0 }
}

function leadingQualifiers(text: string) {
  const parsed = parentheticals(text)
  const values: string[] = []
  let end = 0
  for (const value of parsed.values) {
    if (text.slice(end, value.start).trim()) break
    values.push(value.value)
    end = value.end
  }
  return { values, tail: text.slice(end), invalid: parsed.invalid }
}

function qualifierRule(text: string): GroupRule {
  const value = text.trim().replace(/\s+/g, ' ').toLowerCase()
  if (
    !value ||
    /^(?:any|one of your choice|of your choice|your choice)$/.test(value) ||
    value === 'a gift to you when you entered the priesthood'
  )
    return { relation: 'any' }
  if (/^(?:same as above|same as chosen proficiency|matching your chosen proficiency)$/.test(value))
    return { relation: 'background' }
  if (/^(?:with which you are proficient|you are proficient with)$/.test(value))
    return { relation: 'effective' }
  const segments = splitInlineTagSegments(text)
  if (segments.some((segment) => segment.malformed || (segment.tag && segment.tag.name !== 'item')))
    return unsupported()
  const members: StartingItemReference[] = []
  for (const segment of segments) {
    if (!segment.tag) {
      if (!/^[\s,;/]*(?:(?:or|and)[\s,;/]*)?$/i.test(segment.text)) return unsupported()
      continue
    }
    const [name, source = 'PHB'] = segment.tag.fields
    const ref = startingItemUid(`${name}|${source || 'PHB'}`)
    if (!ref) return unsupported()
    members.push(ref)
  }
  return members.length ? { relation: 'any', members } : unsupported()
}

const ruleKey = (rule: GroupRule) =>
  JSON.stringify([
    rule.relation,
    rule.members?.map(startingItemKey).sort() ?? null,
    rule.diagnostic ?? null,
  ])
function corroborateDisplay(display: string | undefined, sourceRule: GroupRule): GroupRule {
  if (!display?.includes('(')) return sourceRule
  const qualifiers = leadingQualifiers(display.slice(display.indexOf('(')))
  if (qualifiers.invalid || qualifiers.tail.trim()) return unsupported()
  for (const qualifier of qualifiers.values) {
    const rule = qualifierRule(qualifier)
    if (!rule.diagnostic && ruleKey(rule) === ruleKey(sourceRule)) continue
    // Bare display names can corroborate exact source tags, never supply a printing/alias.
    if (sourceRule.members) {
      const names = qualifier
        .split(/\s+or\s+|\s+and\s+|,/i)
        .map((name) => name.trim().toLowerCase())
        .sort()
      if (
        JSON.stringify(names) ===
        JSON.stringify(sourceRule.members.map((ref) => ref.name.trim().toLowerCase()).sort())
      )
        continue
    }
    return unsupported()
  }
  return sourceRule
}

function accountedGroupTail(text: string): boolean {
  const segments = splitInlineTagSegments(text)
  const firstTag = segments.find((segment) => segment.tag)
  let prefix = text.slice(0, firstTag?.start ?? text.length)
  const separator = prefix.search(/[;,]/)
  if (separator >= 0) prefix = prefix.slice(0, separator)
  const words = prefix.trim()
  if (!words || words === '.' || /^of your choice[.]?$/i.test(words))
    return !firstTag || separator >= 0
  return (
    firstTag?.tag?.name === 'item' &&
    /^(?:of your choice\s+)?(?:and|plus)\s+(?:(?:a|an|the|one|two|\d+)\s+)?$/i.test(
      prefix.trimStart(),
    )
  )
}

/** Bind exact named groups locally. Legacy generic filter coordination is handled separately. */
export function startingGroupRule(
  fragments: readonly string[],
  group: StartingItemReference,
  memberUids: readonly string[],
  address?: StartingEquipmentSlotAddress,
): GroupRule {
  if (!address || !Number.isSafeInteger(address.entry) || address.entry < 0) return unsupported()
  const rules: GroupRule[] = []
  for (const fragment of fragments) {
    const text = branchText(fragment, address.option)
    if (text === undefined) continue
    const segments = splitInlineTagSegments(text)
    if (segments.some((segment) => segment.malformed)) return unsupported()
    for (const segment of segments) {
      if (segment.tag?.name !== 'item') continue
      const [name, source = 'PHB', display] = segment.tag.fields
      const ref = startingItemUid(`${name}|${source || 'PHB'}`)
      if (!ref || !sameStartingReference(ref, group)) continue
      const qualifiers = leadingQualifiers(text.slice(segment.end))
      if (qualifiers.invalid || !accountedGroupTail(qualifiers.tail)) return unsupported()
      const qualifierRules = qualifiers.values.map(qualifierRule)
      const distinctQualifiers = new Map(qualifierRules.map((rule) => [ruleKey(rule), rule]))
      if (distinctQualifiers.size > 1) return unsupported()
      let rule = qualifierRules[0] ?? { relation: 'any' as const }
      rule = corroborateDisplay(display, rule)
      rule = corroborateDisplay(address.displayName, rule)
      if (
        rule.members?.some(
          (member) =>
            !memberUids.some((uid) => {
              const declared = startingItemUid(uid)
              return declared && sameStartingReference(member, declared)
            }),
        )
      )
        return unsupported()
      rules.push(rule)
    }
  }
  const distinct = new Map(rules.map((rule) => [ruleKey(rule), rule]))
  return distinct.size === 1 ? [...distinct.values()][0] : unsupported()
}

/** Generic legacy OR arms share only their balanced comma-delimited source clause. */
export function startingFilterRule(
  fragments: readonly string[],
  address: StartingEquipmentSlotAddress | undefined,
  matches: (tag: string) => boolean,
): GroupRule {
  if (!address || !Number.isSafeInteger(address.entry) || address.entry < 0) return unsupported()
  const rules: GroupRule[] = []
  for (const fragment of fragments) {
    const text = branchText(fragment, address.option)
    if (text === undefined) continue
    const segments = splitInlineTagSegments(text)
    if (segments.some((segment) => segment.malformed)) return unsupported()
    const boundaries = [0]
    let depth = 0
    for (const segment of segments) {
      if (segment.tag) continue
      for (let index = 0; index < segment.text.length; index++) {
        const char = segment.text[index]
        if (char === '(') depth++
        else if (char === ')' && --depth < 0) return unsupported()
        else if ((char === ',' || char === ';') && depth === 0)
          boundaries.push(segment.start + index + 1)
      }
    }
    if (depth !== 0) return unsupported()
    boundaries.push(text.length + 1)
    for (const anchor of segments.filter(
      (segment) => segment.tag?.name === 'filter' && matches(segment.text),
    )) {
      let left = 0
      for (const boundary of boundaries) {
        if (boundary > anchor.start) break
        left = boundary
      }
      const right = boundaries.find((boundary) => boundary > anchor.end) ?? text.length + 1
      const clause = text.slice(left, right - 1)
      const filters = splitInlineTagSegments(clause).filter(
        (segment) => segment.tag?.name === 'filter',
      )
      if (
        filters
          .slice(1)
          .some(
            (filter, index) =>
              !/^\s+or\s+(?:(?:a|an)\s+)?$/i.test(clause.slice(filters[index].end, filter.start)),
          )
      )
        return unsupported()
      const prose = splitInlineTagSegments(clause)
        .filter((segment) => !segment.tag)
        .map((segment) => segment.text)
        .join(' ')
      if (/\b(?:except|unless|but not|not proficient|only|must|excluding)\b/i.test(prose))
        return unsupported()
      const background =
        /same as above|matching your chosen proficiency|tool you choose for this background['’]s tool proficiency/i.test(
          prose,
        )
      const effective = /with which you are proficient|you are proficient with/i.test(prose)
      if (background && effective) return unsupported()
      if (!background && !effective && /proficien|same as/i.test(prose)) return unsupported()
      let rule: GroupRule = {
        relation: background ? 'background' : effective ? 'effective' : 'any',
      }
      const qualifiers = parentheticals(clause)
      if (qualifiers.invalid) return unsupported()
      for (const qualifier of qualifiers.values) {
        const parts = splitInlineTagSegments(qualifier.value)
        if (parts.some((part) => part.tag?.name === 'filter')) {
          // A coordinated parenthetical contains only the declared filter arms and OR/articles.
          const words = parts
            .filter((part) => !part.tag)
            .map((part) => part.text)
            .join(' ')
            .trim()
          if (
            parts.some((part) => part.tag && part.tag.name !== 'filter') ||
            !/^(?:or(?:\s+(?:a|an))?)?$/i.test(words)
          )
            return unsupported()
        } else {
          const local = qualifierRule(qualifier.value)
          if (local.diagnostic || local.members || ruleKey(local) !== ruleKey(rule))
            return unsupported()
        }
      }
      const lastFilter = filters[filters.length - 1]
      const nextItem = splitInlineTagSegments(clause).find(
        (part) =>
          part.tag?.name === 'item' &&
          part.start > lastFilter.end &&
          !qualifiers.values.some(
            (qualifier) => part.start > qualifier.start && part.end < qualifier.end,
          ),
      )
      let suffix = clause.slice(lastFilter.end, nextItem?.start)
      if (nextItem) {
        const separated = suffix.replace(/\s+(?:and|plus)\s+(?:(?:a|an|the|one|two|\d+)\s+)?$/i, '')
        if (separated === suffix) return unsupported()
        suffix = separated
      }
      for (const qualifier of [...qualifiers.values].reverse()) {
        if (qualifier.start >= lastFilter.end) {
          const start = qualifier.start - lastFilter.end,
            end = qualifier.end - lastFilter.end
          suffix = suffix.slice(0, start) + ' '.repeat(end - start) + suffix.slice(end)
        }
      }
      if (
        !/^(?:of your choice|you are proficient with|with which you are proficient)?[.!]?$/i.test(
          suffix.replace(/[()]/g, '').trim(),
        )
      )
        return unsupported()
      rule = corroborateDisplay(anchor.tag?.fields[0], rule)
      rule = corroborateDisplay(address.displayName, rule)
      if (rule.diagnostic) return rule
      rules.push(rule)
    }
  }
  const distinct = new Map(rules.map((rule) => [ruleKey(rule), rule]))
  return distinct.size === 1 ? [...distinct.values()][0] : unsupported()
}
