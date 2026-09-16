import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import type { Class5e } from '@/types/5etools'

/** Builds source-qualified class lookups with name-only aliases when the name is unambiguous. */
export function buildClassProfileMap(classes: readonly Class5e[]): Map<string, Class5e> {
  const classesById = new Map<string, Class5e>()
  const classesByName = new Map<string, Map<string, Class5e>>()

  for (const classData of classes) {
    const source = classData.source ?? ''
    classesById.set(toClassProfileId(classData.name, source), classData)
    const printings = classesByName.get(classData.name) ?? new Map<string, Class5e>()
    printings.set(source, classData)
    classesByName.set(classData.name, printings)
  }

  for (const [name, printings] of classesByName) {
    if (printings.size !== 1) continue
    const classData = printings.values().next().value
    if (classData) classesById.set(toClassProfileId(name), classData)
  }

  return classesById
}
