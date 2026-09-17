import { renderEntry } from '@/lib/renderer'

/** Converts normalized entry arrays to plain text for view-neutral/PDF projections. */
export function renderEntriesToText(entries: readonly unknown[] | undefined): string {
  return (entries ?? [])
    .map((entry) =>
      (renderEntry(entry) ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ')
}
