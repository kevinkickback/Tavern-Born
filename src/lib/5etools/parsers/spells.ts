import { asArray, asObject, normalizeKey, type ParsedObject } from './shared'

export type SpellSourceLookup = Record<string, Record<string, unknown>>

function getSpellLookupEntry(
  sourceLookup: SpellSourceLookup,
  spell: ParsedObject,
): ParsedObject | null {
  const source = normalizeKey(spell.source)
  const name = normalizeKey(spell.name)
  if (!source || !name) return null

  const bySource = sourceLookup[source]
  if (!bySource || typeof bySource !== 'object') return null

  const entry = bySource[name]
  return typeof entry === 'object' && entry !== null ? (entry as ParsedObject) : null
}

function mergeSpellClassList(spell: ParsedObject, lookupEntry: ParsedObject): void {
  const classLookup = asObject(lookupEntry.class)
  if (!Object.keys(classLookup).length) return

  const classes = asObject(spell.classes)
  const fromClassList = asArray(classes.fromClassList)
  const seen = new Set(
    fromClassList
      .map((it) => asObject(it))
      .map((it) => `${normalizeKey(it.name)}|${normalizeKey(it.source)}`),
  )

  for (const [source, classNameTo] of Object.entries(classLookup)) {
    const classNameMap = asObject(classNameTo)
    for (const [name, val] of Object.entries(classNameMap)) {
      const key = `${normalizeKey(name)}|${normalizeKey(source)}`
      if (seen.has(key)) continue

      const toAdd: ParsedObject = { name, source }
      if (val && typeof val === 'object') {
        const valObj = asObject(val)
        if (typeof valObj.definedInSource === 'string') {
          toAdd.definedInSource = valObj.definedInSource
        }
        if (Array.isArray(valObj.definedInSources)) {
          toAdd.definedInSources = valObj.definedInSources
        }
      }

      fromClassList.push(toAdd)
      seen.add(key)
    }
  }

  classes.fromClassList = fromClassList
  spell.classes = classes
}

function mergeSpellSubclassList(spell: ParsedObject, lookupEntry: ParsedObject): void {
  const subclassLookup = asObject(lookupEntry.subclass)
  if (!Object.keys(subclassLookup).length) return

  const classes = asObject(spell.classes)
  const fromSubclass = asArray(classes.fromSubclass)
  const seen = new Set(
    fromSubclass
      .map((it) => asObject(it))
      .map((it) => {
        const classObj = asObject(it.class)
        const subclassObj = asObject(it.subclass)
        return `${normalizeKey(classObj.name)}|${normalizeKey(classObj.source)}|${normalizeKey(subclassObj.shortName ?? subclassObj.name)}|${normalizeKey(subclassObj.source)}`
      }),
  )

  for (const [classSource, classNameTo] of Object.entries(subclassLookup)) {
    const classNameMap = asObject(classNameTo)
    for (const [className, subclassSourceTo] of Object.entries(classNameMap)) {
      const subclassSourceMap = asObject(subclassSourceTo)
      for (const [subclassSource, shortNameTo] of Object.entries(subclassSourceMap)) {
        const shortNameMap = asObject(shortNameTo)
        for (const [shortName, value] of Object.entries(shortNameMap)) {
          const valueObj = asObject(value)
          const fullName = typeof valueObj.name === 'string' ? valueObj.name : shortName
          const key = `${normalizeKey(className)}|${normalizeKey(classSource)}|${normalizeKey(shortName)}|${normalizeKey(subclassSource)}`
          if (seen.has(key)) continue

          fromSubclass.push({
            class: { name: className, source: classSource },
            subclass: {
              name: fullName,
              shortName,
              source: subclassSource,
            },
          })
          seen.add(key)
        }
      }
    }
  }

  classes.fromSubclass = fromSubclass
  spell.classes = classes
}

function enrichSpellFromLookup(
  spell: ParsedObject,
  sourceLookup?: SpellSourceLookup,
): ParsedObject {
  if (!sourceLookup) return spell

  const lookupEntry = getSpellLookupEntry(sourceLookup, spell)
  if (!lookupEntry) return spell

  const out = { ...spell }
  mergeSpellClassList(out, lookupEntry)
  mergeSpellSubclassList(out, lookupEntry)
  return out
}

export function parseSpells(
  data: unknown,
  options?: { sourceLookup?: SpellSourceLookup },
): unknown[] {
  const obj = asObject(data)
  const spells = obj.spell ? asArray(obj.spell) : Array.isArray(data) ? data : []
  return spells.map((spell) => enrichSpellFromLookup(asObject(spell), options?.sourceLookup))
}
