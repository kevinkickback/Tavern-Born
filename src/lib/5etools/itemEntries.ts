import type { GameData, Item5e, ItemEntry5e, ItemEntryDiagnostic } from '@/types/5etools'
import { DAMAGE_TYPE_LABEL_FALLBACKS } from './rulesetMetadata'

// Data-only adaptation of Renderer.utils.applyTemplate and DataLoaderDereferencerItemEntries:
// https://github.com/5etools-mirror-3/5etools-src/tree/b9061583536101068b3a59d27e886d1fa664e366/js
// Only the measured scalar/simple-array template forms are supported; no expressions execute.
const MISSING_TEXT = '[Item rules text unavailable]'
const ALL_DAMAGE_TYPES = Object.values(DAMAGE_TYPE_LABEL_FALLBACKS)
  .map((name) => name.toLowerCase())
  .sort()
const rawItems = new WeakMap<GameData, Pick<GameData, 'items' | 'itemsBase'>>()

/** Retain load-time inputs before copies/text expand, as with raw race data. */
export function retainRawItems(data: GameData): void {
  rawItems.set(data, { items: data.items, itemsBase: data.itemsBase })
}

export function getRawItems(data: GameData): Pick<GameData, 'items' | 'itemsBase'> {
  return (
    rawItems.get(data) ?? {
      items: data.items.filter((item) => !item.magicVariantReference),
      itemsBase: data.itemsBase.filter((item) => !item.magicVariantReference),
    }
  )
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function parseItemEntries(data: unknown): ItemEntry5e[] {
  const entries = record(data)?.itemEntry
  if (!Array.isArray(entries)) return []
  return entries.filter((value): value is ItemEntry5e => {
    const entry = record(value)
    return Boolean(
      typeof entry?.name === 'string' &&
        entry.name.trim() &&
        typeof entry.source === 'string' &&
        entry.source.trim() &&
        Array.isArray(entry.entriesTemplate),
    )
  })
}

export function getItemEntryIdentity(name: string, source: string): string {
  return JSON.stringify([name.trim().toLowerCase(), source.trim().toLowerCase()])
}

/** Expand shared text after item copies and winning content layers have resolved. */
export function expandItemEntries(
  items: readonly Item5e[],
  fragments: readonly ItemEntry5e[],
): Item5e[] {
  const byIdentity = new Map<string, ItemEntry5e[]>()
  for (const fragment of fragments) {
    const key = getItemEntryIdentity(fragment.name, fragment.source)
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), fragment])
  }
  return items.map((item) => {
    const diagnostics: ItemEntryDiagnostic[] = []
    let remaining = 4096
    const missing = (path: string, message: string): string => {
      if (
        diagnostics.length < 32 &&
        !diagnostics.some((entry) => entry.path === path && entry.message === message)
      ) {
        diagnostics.push({ path, message })
      }
      return MISSING_TEXT
    }
    const substitute = (text: string, path: string): string =>
      text.replace(/\{\{([^}]+)}}/g, (_token, expression: string) => {
        const args = expression.trim().split(/\s+/)
        const field = args[args.length - 1] ?? ''
        const parts = field.split('.')
        if (
          parts.shift() !== 'item' ||
          !parts.length ||
          args.length > 2 ||
          (args.length === 2 && args[0] !== 'getFullImmRes')
        ) {
          return missing(path, `Unsupported item text template: ${expression}`)
        }
        let value: unknown = item
        for (const part of parts) {
          const owner = record(value)
          value = owner ? Object.getOwnPropertyDescriptor(owner, part)?.value : undefined
        }
        if (args.length === 2) {
          if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
            return missing(path, `Unsupported or missing item text field: ${field}`)
          }
          if (
            value.length === ALL_DAMAGE_TYPES.length &&
            ALL_DAMAGE_TYPES.every((type, index) => value[index] === type)
          ) {
            return 'all damage'
          }
          return value.join(', ')
        }
        const scalar = (entry: unknown) =>
          typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
        if (scalar(value) || (Array.isArray(value) && value.every(scalar))) return String(value)
        return missing(path, `Unsupported or missing item text field: ${field}`)
      })

    const include = (
      uid: unknown,
      path: string,
      active: ReadonlySet<string>,
      depth: number,
    ): unknown[] => {
      if (typeof uid !== 'string') return [missing(path, 'Malformed itemEntry reference')]
      const [name, source, ...extra] = uid.split('|').map((part) => part.trim())
      if (!name || extra.length) return [missing(path, 'Malformed itemEntry reference')]
      // TagItemEntry's canonical default, independent of the consuming item's printing.
      const key = getItemEntryIdentity(name, source || 'DMG')
      const matches = byIdentity.get(key) ?? []
      if (active.has(key)) return [missing(path, `Cyclic itemEntry reference: ${uid}`)]
      if (matches.length !== 1)
        return [
          missing(path, `${matches.length ? 'Ambiguous' : 'Missing'} itemEntry reference: ${uid}`),
        ]
      return walkArray(matches[0].entriesTemplate, path, new Set([...active, key]), depth + 1, true)
    }
    const walk = (
      value: unknown,
      path: string,
      active: ReadonlySet<string>,
      depth: number,
      template: boolean,
    ): unknown => {
      if (--remaining < 0 || depth > 32) return missing(path, 'Item text expansion limit reached')
      if (typeof value === 'string') {
        const text = template ? substitute(value, path) : value
        return text.includes('{#itemEntry')
          ? missing(path, 'itemEntry references must occupy an entry array slot')
          : text
      }
      if (Array.isArray(value)) return walkArray(value, path, active, depth + 1, template)
      const object = record(value)
      if (!object) return value
      if (object.type === 'refItemEntry')
        return missing(path, 'itemEntry references must occupy an entry array slot')
      return Object.fromEntries(
        Object.entries(object).map(([key, entry]) => [
          key,
          walk(entry, `${path}.${key}`, active, depth + 1, template),
        ]),
      )
    }
    const walkArray = (
      values: readonly unknown[],
      path: string,
      active: ReadonlySet<string>,
      depth: number,
      template: boolean,
    ): unknown[] => {
      if (depth > 32 || remaining <= 0) return [missing(path, 'Item text expansion limit reached')]
      const result: unknown[] = []
      for (const [index, value] of values.entries()) {
        const entryPath = `${path}[${index}]`
        if (--remaining < 0) {
          result.push(missing(entryPath, 'Item text expansion limit reached'))
          break
        }
        const object = record(value)
        const match =
          typeof value === 'string' ? /^\{#itemEntry\s+([^{}]*)}$/.exec(value.trim()) : null
        if (match || object?.type === 'refItemEntry') {
          result.push(...include(match ? match[1] : object?.itemEntry, entryPath, active, depth))
        } else result.push(walk(value, entryPath, active, depth, template))
      }
      return result
    }
    const result = { ...item }
    delete result.itemEntryDiagnostics
    for (const field of ['entries', 'additionalEntries'] as const) {
      if (Array.isArray(item[field]))
        result[field] = walkArray(item[field], field, new Set(), 0, false)
    }
    if (diagnostics.length) result.itemEntryDiagnostics = diagnostics
    return result
  })
}
