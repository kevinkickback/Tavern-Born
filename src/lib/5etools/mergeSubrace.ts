/** Data-only adaptation of Renderer.race._getMergedSubrace from pinned 5etools e5d0520.
 *
 * MIT License
 * Copyright (c) 2017 TheGiddyLimit and contributors
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Source: https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/render.js
 */

type DataRecord = Record<string, unknown>
type RaceRecord = DataRecord & { name: string; source: string }

function object(value: unknown): DataRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as DataRecord) : {}
}

function arrayField(record: DataRecord, field: string): unknown[] | undefined {
  const value = record[field]
  if (value == null) return undefined
  if (!Array.isArray(value)) throw new Error(`invalid ${field}: expected an array`)
  return value
}

function abilityBlock(value: unknown): DataRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid ability block: expected an object')
  return value as DataRecord
}

function subraceName(raceName: string, name: string): string {
  const bracketed = /^(.*?)(\(.*?\))$/i.exec(raceName)
  if (!bracketed) return `${raceName} (${name})`
  return `${bracketed[1]}(${bracketed[2].slice(1, -1)}; ${name})`
}

/** Compose the upstream version parent, without mutating input or changing ordinary subrace views. */
export function mergeSubraceForVersions(race: RaceRecord, subrace: DataRecord): RaceRecord {
  let merged: DataRecord = structuredClone(race)
  const child = structuredClone(subrace)
  const overwrite = object(child.overwrite)
  merged._baseName = race.name
  merged._baseSource = race.source
  merged._baseSrd = race.srd
  merged._baseSrd52 = race.srd52
  merged._baseBasicRules = race.basicRules
  merged._baseFreeRules2024 = race.basicRules2024
  for (const field of [
    'subraces',
    'srd',
    'srd52',
    'basicRules',
    'basicRules2024',
    '_versions',
    'hasFluff',
    'hasFluffImages',
    'reprintedAs',
    'presentationEntries',
  ])
    delete merged[field]
  delete child.__prop

  if (child.name) {
    if (typeof child.name !== 'string') throw new Error('invalid subrace name')
    merged._subraceName = child.name
    merged.name = subraceName(race.name, child.name)
    delete child.name
  }

  const abilities = arrayField(child, 'ability')
  if (abilities) {
    const inherited =
      overwrite.ability || merged.ability == null
        ? abilities.map(() => ({}))
        : (arrayField(merged, 'ability') ?? [])
    if (inherited.length !== abilities.length)
      throw new Error('race and subrace ability array lengths did not match')
    merged.ability = abilities.map((block, index) => ({
      ...abilityBlock(inherited[index]),
      ...abilityBlock(block),
    }))
    delete child.ability
  }

  const entries = arrayField(child, 'entries')
  if (entries) {
    const inherited = [...(arrayField(merged, 'entries') ?? [])]
    for (const entry of entries) {
      const target = object(object(entry).data).overwrite
      if (target == null) {
        inherited.push(entry)
        continue
      }
      if (typeof target !== 'string') throw new Error('invalid entry overwrite name')
      const index = inherited.findIndex((candidate) => {
        const name = object(candidate).name
        return typeof name === 'string' && name.trim().toLowerCase() === target.trim().toLowerCase()
      })
      if (index < 0) inherited.push(entry)
      else inherited[index] = entry
    }
    merged.entries = inherited
    delete child.entries
  }

  for (const field of ['traitTags', 'languageProficiencies']) {
    const values = arrayField(child, field)
    if (!values) continue
    merged[field] = overwrite[field] ? values : [...(arrayField(merged, field) ?? []), ...values]
    delete child[field]
  }

  const skills = arrayField(child, 'skillProficiencies')
  if (skills) {
    if (merged.skillProficiencies == null || overwrite.skillProficiencies)
      merged.skillProficiencies = skills
    else {
      const inherited = arrayField(merged, 'skillProficiencies') ?? []
      if (!skills.length || !inherited.length)
        throw new Error('skill proficiency merge has no items')
      if (skills.length > 1 || inherited.length > 1)
        throw new Error('subrace skill proficiency merge does not support alternative blocks')
      merged.skillProficiencies = [{ ...object(inherited[0]), ...object(skills[0]) }]
    }
    delete child.skillProficiencies
  }

  // Spreads preserve own data keys without invoking prototype setters.
  merged = { ...merged, ...child }
  for (const [field, value] of Object.entries(merged)) if (value == null) delete merged[field]
  if (typeof merged.name !== 'string' || typeof merged.source !== 'string' || !merged.source.trim())
    throw new Error('merged subrace is missing its name or source')
  return merged as RaceRecord
}
