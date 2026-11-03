/** Generates a locally-unique equipment ID using timestamp + random suffix. */
export function generateEquipmentId(occupied?: ReadonlySet<string>): string {
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  let id = base,
    suffix = 1
  while (occupied?.has(id)) id = `${base}-${suffix++}`
  return id
}
