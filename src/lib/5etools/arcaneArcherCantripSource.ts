import { getSpellReferenceKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Spell5e, Subclass5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { CharacterClassEntry } from '@/types/character'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { decodeSubclassFeatureReference } from './classFeatureIdentity'
import { getIncludedSrdSpellReprints } from './includedSrdSpellProof'
import {
  getNativeSubclassIntroFeature,
  isInheritedFighterSubclass,
} from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

const name = 'arcane archer'
const loreName = 'arcane archer lore'
const includedClassicRecords = new Map([
  ['druidcraft', '36c624dc226e2091417341b2f7106880fca4ad176b789efa1bc038cc5310f81e'],
  ['prestidigitation', '3dec2b43893916e25548b64620bae6212ad7045d74b0540132812704b2d06b19'],
])

export const getIncludedArcaneArcherSpellReprints = (
  spells: Readonly<Record<string, Spell5e>> | undefined,
) => getIncludedSrdSpellReprints(spells, includedClassicRecords)
function getOrigin(printing: string, source: string) {
  if (source === 'xge' && (printing === 'phb' || printing === 'xphb')) return 'phb'
  if (source === 'au' && printing === 'xphb') return 'xphb'
}

export function getArcaneArcherLoreIdentity(printing: string, source: string, level: number) {
  const origin = getOrigin(printing, source)
  if (!origin || !Number.isSafeInteger(level) || level < 1 || level > 20) return undefined
  return {
    owner: ['subclass', 'fighter', printing, name, source] as const,
    target: `subclass-feature|${loreName}|fighter|${origin}|${name}|${source}|${level}|${source}`,
    name: loreName,
    level,
    origin,
  }
}

export function isArcaneArcherCantripOwner(entry: CharacterClassEntry) {
  return (
    norm(entry.name) === 'fighter' &&
    norm(entry.subclass) === name &&
    !!getOrigin(norm(entry.source), norm(entry.subclassSource))
  )
}

/** The lore declares an either/or choice. The two known schedules supply the live cantrip UIDs. */
export function getArcaneArcherCantripChoice(cls: Class5e, subclass: Subclass5e) {
  const printing = norm(cls.source)
  const origin = getOrigin(printing, norm(subclass.source))
  const revised = origin === 'xphb'
  const inherited = !!origin && origin !== printing
  const level = getCurrentNativeSubclassGain(cls)?.level
  if (
    !origin ||
    !level ||
    norm(cls.name) !== 'fighter' ||
    norm(subclass.className) !== 'fighter' ||
    norm(subclass.classSource) !== printing ||
    norm(subclass.name) !== 'arcane archer' ||
    norm(subclass.shortName) !== 'arcane archer' ||
    subclass.sourceIdentityConflict ||
    (inherited ? !isInheritedFighterSubclass(subclass) : '_copy' in subclass) ||
    (revised ? subclass.spellcastingAbility !== 'int' : subclass.spellcastingAbility !== undefined)
  )
    return undefined
  const originLevel =
    inherited && subclass.introFeatureRef
      ? decodeSubclassFeatureReference(subclass.introFeatureRef).level
      : level
  if (!originLevel) return undefined
  const lore = getNativeSubclassIntroFeature(cls, subclass, originLevel, loreName, origin)
  if (!lore || !Array.isArray(lore.entries)) return undefined
  const named = lore.entries.map(record).filter((row) => row.name === 'Cantrip')
  const body =
    revised && named.length === 1 && named[0].type === 'entries' ? named[0].entries : lore.entries
  if (!Array.isArray(body) || body.length !== 1 || typeof body[0] !== 'string') return undefined
  const first = '{@spell ([^{}|]+(?:\\|[^{}|]+)?)\\}'
  const match = (
    revised
      ? new RegExp(
          `^You know either the ${first} or the ${first} cantrip\\. Intelligence is your spellcasting ability for it\\.$`,
        )
      : new RegExp(
          `^At ${originLevel}(?:st|nd|rd|th) level, you learn magical theory or some of the secrets of nature—typical for practitioners of this elven martial tradition\\. You choose to gain proficiency in either the \\{@skill [^{}]+\\} or the \\{@skill [^{}]+\\} skill, and you choose to learn either the ${first} or the ${first} cantrip\\.$`,
        )
  ).exec(body[0])
  if (!match) return undefined
  const referenceKey = (value: string) =>
    getSpellReferenceKey(value, parseSpellReference(value).source ?? origin)
  const declared = new Set(match.slice(1).map(referenceKey))
  try {
    const blocks = parseAdditionalSpellBlocks(subclass.additionalSpells as AdditionalSpellBlock[])
    if (declared.size !== 2 || blocks.length !== declared.size) return undefined
    const references: string[] = []
    for (const block of blocks) {
      const grant = block.grants[0]
      const schedule = block.scheduleIdentity[0]
      if (
        block.grants.length !== 1 ||
        block.choices.length ||
        block.ability ||
        block.abilityOptions ||
        block.expanded?.length ||
        block.scheduleIdentity.length !== 1 ||
        !grant.isCantrip ||
        norm(parseSpellReference(grant.spellName).source) !== origin ||
        !schedule.startsWith(`["known",${originLevel},"direct",`) ||
        !declared.delete(referenceKey(grant.spellName))
      )
        return undefined
      references.push(grant.spellName)
    }
    return { target: lore.target, level, originLevel, references }
  } catch {
    return undefined
  }
}
