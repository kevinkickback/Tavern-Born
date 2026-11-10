import { INNATE_SORCERY_ID, SORCERY_POINTS_ID } from '@/lib/5etools/sorcererSource'
import type { CharacterSheetViewModel } from './characterSheetViewModel'

type ResourceRows = CharacterSheetViewModel['classResourceRows']
type ResourceRow = ResourceRows[number]

export function printsResourceRecovery(row: ResourceRow) {
  return row.inherited || row.id === SORCERY_POINTS_ID || row.id === INNATE_SORCERY_ID
}

export function sheetResourceLabel(row: ResourceRow, rows: ResourceRows) {
  const peers = rows.filter((peer) => peer.label === row.label)
  if (peers.length < 2 || !row.owner) return row.label
  const { name, source } = row.owner
  const sameClass = peers.filter((peer) => peer.owner?.name === name).length > 1
  return `${row.label} (${name}${sameClass ? ` · ${source}` : ''})`
}

export function formatSheetResource(row: ResourceRow, rows: ResourceRows, showCounter = true) {
  const label = sheetResourceLabel(row, rows)
  const heading = showCounter
    ? `${label} — ${row.max - row.used}/${row.max} available`
    : `${label} recovery`
  return [heading, row.usageText, row.recovery]
    .flatMap((line) => (line ? [line.endsWith('.') ? line : `${line}.`] : []))
    .join(' ')
}

export function withClassResourceText(rows: ResourceRows, text: string, tableCapacity?: number) {
  const summary = (tableCapacity === undefined ? rows : rows.slice(0, tableCapacity))
    .filter(printsResourceRecovery)
    .map((row) => formatSheetResource(row, rows, tableCapacity === undefined))
  return [...summary, text].filter(Boolean).join('\n\n')
}
