import type { OptionalFeatureLike } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

const bookText =
  /^Stitching together strands of shadow, you conjure forth a book in your hand at the end of a \{@variantrule Short Rest\|XPHB\|Short\} or \{@variantrule Long Rest\|XPHB\}\. This Book of Shadows \(you determine its appearance\) contains eldritch magic that only you can access, granting you the benefits below\. The book disappears if you conjure another book with this feature or if you die\.$/
const selectionText =
  /^When the book appears, choose three \{@filter cantrips\|spells\|level=0\}, and choose two \{@filter level 1 spells\|spells\|level=1\|components & miscellaneous=ritual\} that have the \{@variantrule Ritual\|XPHB\} tag\. The spells can be from any class's spell list, and they must be spells you don't already have prepared\. While the book is on your person, you have the chosen spells prepared, and they function as ([^.,]+) spells for you\.$/

/** Corroborate the two structured pools and the preparation condition with the earned rules text. */
export function readDeclaredInvocationBook(feature?: OptionalFeatureLike) {
  if (
    feature?.featureType?.length !== 1 ||
    feature.featureType[0] !== 'EI' ||
    feature.entries?.length !== 2 ||
    typeof feature.entries[0] !== 'string' ||
    !bookText.test(feature.entries[0])
  )
    return undefined
  const wrapper = record(feature.entries[1])
  if (wrapper.type !== 'entries' || !Array.isArray(wrapper.entries) || wrapper.entries.length !== 2)
    return undefined
  const [spells, focus] = wrapper.entries.map(record)
  const clause = Array.isArray(spells.entries) && spells.entries.length === 1 && spells.entries[0]
  const match = typeof clause === 'string' && selectionText.exec(clause)
  if (
    !match ||
    spells.type !== 'entries' ||
    spells.name !== 'Cantrips and Rituals' ||
    focus.type !== 'entries' ||
    focus.name !== 'Spellcasting Focus' ||
    !Array.isArray(focus.entries) ||
    focus.entries.length !== 1 ||
    focus.entries[0] !== 'You can use the book as a {@variantrule Spellcasting Focus|XPHB}.' ||
    [wrapper, spells, focus].some((row) =>
      Object.keys(row).some((key) => !['type', 'name', 'entries'].includes(key)),
    )
  )
    return undefined
  try {
    const blocks = parseAdditionalSpellBlocks(feature.additionalSpells as AdditionalSpellBlock[], {
      allowRitual: true,
    })
    const [block] = blocks
    if (
      blocks.length !== 1 ||
      !block.ability ||
      block.name ||
      block.grants.length ||
      block.expanded?.length ||
      block.choices.length !== 2 ||
      block.choices.some(
        (row) =>
          row.level !== 0 ||
          row.usage !== 'direct' ||
          row.pool ||
          !row.filter ||
          row.filter.classes.length,
      )
    )
      return undefined
    const [cantrips, rituals] = block.choices
    return cantrips.source === 'known' &&
      cantrips.count === 3 &&
      cantrips.filter?.level === 0 &&
      !cantrips.filter.ritual &&
      rituals.source === 'prepared' &&
      rituals.count === 2 &&
      rituals.filter?.level === 1 &&
      rituals.filter.ritual
      ? { ability: block.ability, cantrips, rituals, printedClass: match[1] }
      : undefined
  } catch {
    return undefined
  }
}

/** The classic boon grants bonus cantrips from any published class list. */
export function readDeclaredPactCantrips(feature?: OptionalFeatureLike) {
  if (feature?.featureType?.length !== 1 || feature.featureType[0] !== 'PB') return undefined
  const [prose] = feature.entries ?? []
  if (feature.entries?.length !== 1 || typeof prose !== 'string') return undefined
  const note = prose.match(
    /While the book is on your person, you can cast those cantrips at will\./,
  )
  if (
    !note ||
    !prose.includes(
      "choose three {@filter cantrips|spells|level=0} from any class's spell list.",
    ) ||
    !prose.includes("They don't count against your number of cantrips known.") ||
    !/\bwarlock (?:spells|cantrip) for you\./i.test(prose)
  )
    return undefined
  try {
    const blocks = parseAdditionalSpellBlocks(feature.additionalSpells as AdditionalSpellBlock[])
    const [block] = blocks
    const [cantrips] = block?.choices ?? []
    if (
      blocks.length !== 1 ||
      !block.ability ||
      block.name ||
      block.grants.length ||
      block.expanded?.length ||
      block.choices.length !== 1 ||
      cantrips.count !== 3 ||
      cantrips.level !== 0 ||
      cantrips.source !== 'known' ||
      cantrips.usage !== 'direct' ||
      cantrips.filter?.level !== 0 ||
      cantrips.filter.classes.length ||
      cantrips.filter.ritual
    )
      return undefined
    return { ability: block.ability, cantrips, castingNote: note[0] }
  } catch {
    return undefined
  }
}

/** The catalog supplies the initial ritual pool independently of prepared spell choices. */
export function readDeclaredInvocationRituals(feature?: OptionalFeatureLike) {
  if (feature?.featureType?.length !== 1 || feature.featureType[0] !== 'EI') return undefined
  try {
    const blocks = parseAdditionalSpellBlocks(feature.additionalSpells as AdditionalSpellBlock[], {
      allowRitual: true,
    })
    if (blocks.length !== 1) return undefined
    const [block] = blocks
    const [rituals] = block.choices
    if (
      !block.ability ||
      block.name ||
      block.grants.length ||
      block.expanded?.length ||
      block.choices.length !== 1 ||
      rituals.level !== 0 ||
      rituals.source !== 'innate' ||
      rituals.usage !== 'ritual' ||
      !rituals.filter?.ritual ||
      rituals.isCantrip ||
      rituals.count > 1000
    )
      return undefined
    const castingNote = feature.entries
      ?.flatMap((entry) =>
        typeof entry === 'string'
          ? (entry.match(/[^.!?]*\byou can cast the chosen spells as rituals[.!?]/i) ?? [])
          : [],
      )[0]
      ?.trim()
    const transcription = feature.entries?.flatMap((entry) => {
      if (typeof entry !== 'string') return []
      const limit = entry.match(
        /if the spell's level is equal to or less than half your ([\w -]+) level \(rounded (up|down)\)/i,
      )
      const cost = entry.match(
        /for each level of the spell, the transcription process takes (\d+) hours? and costs (\d+) gp/i,
      )
      if (!limit || !cost) return []
      const hoursPerLevel = Number(cost[1])
      const goldPerLevel = Number(cost[2])
      return Number.isSafeInteger(hoursPerLevel) &&
        hoursPerLevel > 0 &&
        Number.isSafeInteger(goldPerLevel)
        ? [
            {
              printedClass: limit[1],
              roundUp: limit[2].toLowerCase() === 'up',
              hoursPerLevel,
              goldPerLevel,
            },
          ]
        : []
    })
    const knownRituals = feature.entries?.flatMap((entry) => {
      if (typeof entry !== 'string') return []
      const rule = entry.match(
        /You can also cast a ([a-z][a-z -]*) spell you know as a ritual if it has the ritual tag\./i,
      )
      return rule ? [{ printedClass: rule[1], castingNote: rule[0] }] : []
    })
    return {
      ability: block.ability,
      rituals,
      castingNote,
      knownRituals: knownRituals?.length === 1 ? knownRituals[0] : undefined,
      transcription: transcription?.length === 1 ? transcription[0] : undefined,
    }
  } catch {
    return undefined
  }
}
