/** Capitalize a standalone label while preserving its authored spelling and acronyms. */
export function capitalizeLabel(value: string): string {
  return value.replace(/^\p{L}/u, (letter) => letter.toUpperCase())
}

/** Proficiency keys are often stored in lowercase. Keep authored names when they are available. */
export function formatProficiencyLabel(value: string): string {
  return value === value.toLowerCase()
    ? value.replace(/(^|[\s/-])\p{L}/gu, (letter) => letter.toUpperCase())
    : capitalizeLabel(value)
}
