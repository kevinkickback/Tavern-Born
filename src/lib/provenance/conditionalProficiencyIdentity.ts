/** Derived source declarations cannot be shadowed by saved manual effects. */
export function isReservedProficiencyCheckNoteId(id: string): boolean {
  return id.trim().startsWith('proficiency-check-note:')
}
