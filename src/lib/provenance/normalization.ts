/**
 * Strip 5etools {@tag text|source} references, keeping just the display text.
 * E.g. "{@item Thieves' Tools|PHB}" → "Thieves' Tools"
 */
export function stripItemTag(value: string): string {
  let out = value.replace(/\{@[a-zA-Z]+\s+([^}|]+)[^}]*\}/g, '$1').trim();
  if (out.includes('|')) {
    out = out.split('|')[0]?.trim() ?? out;
  }
  return out.trim();
}

/**
 * Normalize a proficiency/item name to a stable lowercase key.
 * Strips 5etools tags so that "{@item thieves' tools|PHB}" and "thieves' tools"
 * produce the same key — preventing duplicate ledger entries.
 */
export function normalizeKey(name: string): string {
  return stripItemTag(String(name)).toLowerCase().trim();
}

/** Convert a normalized key back to a display name. */
export function toDisplayName(key: string): string {
  return key
    .split(/[\s_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
