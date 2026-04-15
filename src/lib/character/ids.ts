/** Generates a locally-unique equipment ID using timestamp + random suffix. */
export function generateEquipmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
