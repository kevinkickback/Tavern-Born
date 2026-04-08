import { renderEntry } from '@/lib/renderer';

const entryHtmlCache = new WeakMap<object, string>();

/**
 * Render a 5etools entry with shared WeakMap caching across UI consumers.
 */
export function renderEntryCached(entry: unknown): string {
  if (!entry) return '';
  if (typeof entry !== 'object') return renderEntry(entry);

  const key = entry as object;
  const hit = entryHtmlCache.get(key);
  if (hit !== undefined) return hit;

  const html = renderEntry(entry);
  entryHtmlCache.set(key, html);
  return html;
}
