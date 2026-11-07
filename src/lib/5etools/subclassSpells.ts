import {
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassAdditionalSpells } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getBardCollegeSpellGrants } from './bardCollegeFeatures'
import { getChosenLandTerrain, isCircleOfTheLand, landTerrainSpellToken } from './circleOfTheLand'
import { getClassFeatureReferenceLevel, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getChosenDivineSoulSpell } from './divineSoulConfiguration'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  hasRevisedInheritedCircleSpells,
  isRevisedInheritedCircleOwner,
} from './legacyDruidSubclassSpells'
import {
  hasRevisedInheritedOathSpells,
  isRevisedInheritedOathOwner,
} from './legacyPaladinOathSpells'
import {
  divineSoul,
  getCurrentDivineMagic,
  getCurrentLunarSorcery,
  getLegacySorcererSpec,
} from './legacySorcererSubclassRules'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  ELDRITCH_HEX_REFERENCE,
  getNativeEldritchHexOwner,
  getNativeStepsOfTheFeyOwner,
  STEPS_OF_THE_FEY_SPELL,
} from './nativeWarlockPatronRules'
import { parseSpellToken } from './spellTokens'
import {
  getChosenWarlockSpellBlock,
  hasWarlockPatronSpellConfiguration,
} from './warlockPatronConfigurations'
import {
  getWizardIllusionCantripOwner,
  WIZARD_THIRD_EYE_TARGET,
} from './wizardTraditionSpellSources'

export interface SubclassSpellGrant {
  spellName: string
  level: number
  isCantrip: boolean
  expandedRank?: number
  expectedSpellLevel?: number
  requiresClassicReprint?: true
  feature?: { name: string; target: string; castingNote?: string }
  castOnly?: { castingTime?: string; ignoresMaterial?: true }
  mode: 'prepared' | 'known' | 'expanded' | 'innate' | 'cast-only'
}

export function hasCurrentSubclassSpellGrant(
  grant: SubclassSpellGrant,
  references: { has(reference: string): boolean } | undefined,
  spellLevels: ReadonlyMap<string, number> | undefined,
  oathReprints?: ReadonlyMap<string, number | undefined>,
) {
  const key = getSpellReferenceKey(grant.spellName)
  if (grant.requiresClassicReprint && oathReprints?.get(key) !== grant.expectedSpellLevel)
    return false
  return grant.expectedSpellLevel === undefined
    ? references?.has(key) === true
    : spellLevels?.get(key) === grant.expectedSpellLevel
}

/** Current selected provider at a historical class gain; undefined means authority is unavailable. */
export function getEarnedSubclassSpellGrants(
  classData: Class5e | undefined,
  entry: CharacterClassEntry,
  classLevel = entry.levels,
  landContext?: {
    selections?: Character['classChoiceSelections']
    spells?: ReadonlyMap<string, number>
    character?: Character
  },
): SubclassSpellGrant[] | undefined {
  if (!entry.subclass) return []
  const norm = normalizeOwnerIdentity
  const land = isCircleOfTheLand(entry.name, entry.source, entry.subclass, entry.subclassSource)
  const revisedCircle = isRevisedInheritedCircleOwner(entry)
  const legacySorcerer = getLegacySorcererSpec(entry)
  const illusion = getWizardIllusionCantripOwner(entry)
  const revisedOath = isRevisedInheritedOathOwner(entry)
  const unavailable =
    land ||
    revisedCircle ||
    revisedOath ||
    legacySorcerer ||
    illusion ||
    hasWarlockPatronSpellConfiguration(entry)
      ? []
      : undefined
  if (
    !classData ||
    norm(classData.name) !== norm(entry.name) ||
    norm(classData.source) !== norm(entry.source)
  )
    return unavailable
  const boundaries = (classData.classFeatureRefs ?? []).filter(
    (ref) => ref.gainSubclassFeature === true,
  )
  const levels = boundaries.map(getClassFeatureReferenceLevel)
  if (!levels.length || levels.some((level) => level === undefined)) return unavailable
  const first = Math.min(...(levels as number[]))
  if (levels.filter((level) => level === first).length !== 1) return unavailable
  if (classLevel < first) return []
  const subclasses = (classData.subclasses ?? []).filter(
    (row) =>
      norm(row.name) === norm(entry.subclass) &&
      norm(row.source) === norm(entry.subclassSource) &&
      norm(row.className) === norm(entry.name) &&
      norm(row.classSource) === norm(entry.source),
  )
  if (subclasses.length !== 1) return unavailable
  if (!land) {
    if (legacySorcerer === divineSoul) {
      const magic = getCurrentDivineMagic(classData, subclasses[0])
      const spell = getChosenDivineSoulSpell(magic, entry.source, landContext?.selections)
      return spell && magic && classLevel >= magic.rules.level
        ? [
            {
              spellName: formatSpellReference(spell, entry.source),
              level: magic.rules.level,
              isCantrip: false,
              expectedSpellLevel: 1,
              mode: 'known',
              feature: { name: 'Divine Magic', target: 'divine-soul-affinity' },
            },
          ]
        : []
    }
    if (legacySorcerer) return getLunarSubclassSpells(classData, subclasses[0], classLevel)
    const suite = getChosenWarlockSpellBlock(classData, subclasses[0], landContext?.selections)
    if (suite) {
      const { block, level } = suite
      if (!block || classLevel < level) return []
      if (!block.expanded) return parseSubclassSpells([block], classLevel)
      // This legacy schedule records Wish with a numeric key, but its table uses spell rank.
      return Object.entries(block.expanded).flatMap(([rank, spells]) =>
        spells.map((spellName) => ({
          spellName: formatSpellReference(spellName, classData.source),
          level,
          expandedRank: Number(rank.replace(/^s/, '')),
          isCantrip: false,
          mode: 'expanded' as const,
        })),
      )
    }
    if (revisedCircle)
      return hasRevisedInheritedCircleSpells(classData, subclasses[0])
        ? parseSubclassSpells(subclasses[0].additionalSpells, classLevel).map((grant) => ({
            ...grant,
            spellName: formatSpellReference(grant.spellName, 'XPHB'),
            expectedSpellLevel: grant.isCantrip ? 0 : Math.ceil(grant.level / 2),
            feature: { name: 'Circle Spells', target: 'inherited-circle-spells' },
          }))
        : []
    if (revisedOath)
      return hasRevisedInheritedOathSpells(classData, subclasses[0])
        ? parseSubclassSpells(subclasses[0].additionalSpells, classLevel).map((grant) => ({
            ...grant,
            spellName: formatSpellReference(grant.spellName, 'XPHB'),
            expectedSpellLevel: Math.floor((grant.level - 1) / 4) + 1,
            requiresClassicReprint: true,
            feature: { name: 'Oath Spells', target: 'inherited-oath-spells' },
          }))
        : []
    const bardGrants = getBardCollegeSpellGrants(classData, subclasses[0], classLevel)
    if (bardGrants) return bardGrants
    const grants = parseSubclassSpells(subclasses[0].additionalSpells, classLevel)
    // The conditional Illusion grant is resolved after current ordinary cantrips.
    if (illusion)
      return grants.filter((grant) => getSpellNameKey(grant.spellName) !== 'minor illusion')
    const shadowCast = getShadowSorceryCast(classData, subclasses[0], classLevel)
    if (shadowCast) grants.push(shadowCast)
    const thirdEyeCast = getDivinerThirdEyeCast(classData, subclasses[0], classLevel)
    if (thirdEyeCast) grants.push(thirdEyeCast)
    if (getNativeEldritchHexOwner(entry)) {
      // Eldritch Hex has its own source proof. Expanded list access remains independent.
      const hex = getSpellReferenceKey(ELDRITCH_HEX_REFERENCE)
      return grants.filter(
        (grant) => grant.mode === 'expanded' || getSpellReferenceKey(grant.spellName) !== hex,
      )
    }
    if (getNativeStepsOfTheFeyOwner(entry)) {
      // Steps of the Fey changes casting, while Archfey Spells supplies preparation.
      const mistyStep = getSpellReferenceKey(STEPS_OF_THE_FEY_SPELL)
      return grants.filter(
        (grant) => grant.mode !== 'innate' || getSpellReferenceKey(grant.spellName) !== mistyStep,
      )
    }
    return grants
  }
  const terrain = getChosenLandTerrain(classData, subclasses[0], landContext?.selections ?? [])
  if (!terrain) return []
  const grants = parseSubclassSpells([{ prepared: terrain.block.prepared }], classLevel)
  const seen = new Set<string>()
  return grants.flatMap((grant) => {
    const spellName = landTerrainSpellToken(
      terrain.block.name,
      grant.level,
      grant.spellName,
      terrain.feature,
    ).name
    const key = getSpellReferenceKey(spellName)
    const spells = landContext?.spells
    if (seen.has(key)) return []
    seen.add(key)
    return [{ ...grant, spellName, isCantrip: spells ? spells.get(key) === 0 : grant.isCantrip }]
  })
}

function getDivinerThirdEyeCast(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant | undefined {
  const norm = normalizeOwnerIdentity
  if (
    classLevel < 10 ||
    norm(cls.name) !== 'wizard' ||
    norm(cls.source) !== 'xphb' ||
    cls.sourceIdentityConflict ||
    cls._copy ||
    norm(subclass.name) !== 'diviner' ||
    norm(subclass.source) !== 'xphb' ||
    norm(subclass.shortName) !== 'diviner' ||
    subclass.sourceIdentityConflict ||
    subclass._copy ||
    !matchesNativeSubclassGain(cls, 'class-feature|wizard subclass|wizard|xphb|3|xphb', 3) ||
    !matchesNativeSubclassGain(
      cls,
      'class-feature|subclass feature|wizard|xphb|10|xphb',
      10,
      'at-level',
    )
  )
    return undefined
  const target = WIZARD_THIRD_EYE_TARGET
  const rule = getDirectSubclassFeatureReference(subclass, target)?.feature
  const blocks = subclass.additionalSpells
  const innate = blocks?.length === 1 ? blocks[0].innate?.['10'] : undefined
  if (
    !rule ||
    getSubclassFeatureIdentity(rule) !== target ||
    rule.sourceIdentityConflict ||
    rule.featureOptionSourceConflict ||
    rule.isClassFeatureVariant ||
    getFeatureSourceDigest(rule.entries ?? []) !==
      'fbaf7a09e55be9472782b086ba4dd2ba6526a1874a03626fc33f535f93fc912c' ||
    !Array.isArray(innate) ||
    innate.length !== 1 ||
    innate[0] !== 'see invisibility|xphb'
  )
    return undefined
  return {
    spellName: 'See Invisibility|XPHB',
    level: 10,
    isCantrip: false,
    expectedSpellLevel: 2,
    mode: 'cast-only',
    castOnly: {},
    feature: {
      name: rule.name,
      target,
      castingNote:
        'The Third Eye: Cast without a spell slot while this benefit is active. Activate as a Bonus Action. The benefit ends when you start a Short or Long Rest. Finish a Short or Long Rest before activating again.',
    },
  }
}

function getShadowSorceryCast(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant | undefined {
  const norm = normalizeOwnerIdentity
  if (
    classLevel < 6 ||
    norm(cls.name) !== 'sorcerer' ||
    norm(cls.source) !== 'xphb' ||
    cls.sourceIdentityConflict ||
    cls._copy ||
    norm(subclass.name) !== 'shadow sorcery' ||
    norm(subclass.source) !== 'rhw' ||
    norm(subclass.shortName) !== 'shadow' ||
    subclass.sourceIdentityConflict ||
    subclass._copy ||
    !matchesNativeSubclassGain(cls, 'class-feature|sorcerer subclass|sorcerer|xphb|3|xphb', 3) ||
    !matchesNativeSubclassGain(
      cls,
      'class-feature|subclass feature|sorcerer|xphb|6|xphb',
      6,
      'at-level',
    )
  )
    return undefined
  const target = 'subclass-feature|beasts of ill omen|sorcerer|xphb|shadow|rhw|6|rhw'
  const rule = getDirectSubclassFeatureReference(subclass, target)?.feature
  const blocks = subclass.additionalSpells
  const block = blocks?.length === 1 ? blocks[0] : undefined
  if (
    !rule ||
    getSubclassFeatureIdentity(rule) !== target ||
    rule.sourceIdentityConflict ||
    rule.featureOptionSourceConflict ||
    rule.isClassFeatureVariant ||
    getFeatureSourceDigest(rule.entries ?? []) !==
      '0a1153c7de9b9c7ac0ec8b62436d34570498fc75da94c688a20fb62fce1e8821' ||
    !block ||
    !('resourceName' in block) ||
    block.resourceName !== 'Sorcery Point' ||
    getFeatureSourceDigest([block.innate?.['6']]) !==
      getFeatureSourceDigest([{ resource: { '3': ['summon beast|xphb'] } }])
  )
    return undefined
  return {
    spellName: 'Summon Beast|XPHB',
    level: 6,
    isCantrip: false,
    expectedSpellLevel: 2,
    mode: 'cast-only',
    castOnly: { castingTime: 'Bonus Action', ignoresMaterial: true },
    feature: {
      name: rule.name,
      target,
      castingNote:
        'Beasts of Ill Omen: Spend 3 Sorcery Points to cast as a Bonus Action without a spell slot, preparation, or Material components. You can waive Concentration for a 1-minute casting that ends early if you cast the spell again.',
    },
  }
}

function getLunarSubclassSpells(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant[] {
  const lunar = getCurrentLunarSorcery(cls, subclass)
  if (!lunar || classLevel < lunar.level) return []
  const firstRank = lunar.schedule?.[0]?.known?.['1'] ?? []
  const phases = ['Full Moon', 'New Moon', 'Crescent Moon']
  const waxing = lunar.waxing && classLevel >= 6
  const grants = parseSubclassSpells(lunar.schedule, classLevel).map((grant) => {
    const spellName = formatSpellReference(grant.spellName, cls.source)
    const phase =
      phases[
        firstRank.findIndex(
          (spell) => getSpellReferenceKey(spell, cls.source) === getSpellReferenceKey(spellName),
        )
      ]
    return {
      ...grant,
      spellName,
      level: Math.max(lunar.level, grant.level),
      expectedSpellLevel: Math.ceil(grant.level / 2),
      feature: {
        name: 'Lunar Embodiment',
        target: 'lunar-embodiment',
        ...(phase && {
          castingNote: waxing
            ? `Waxing and Waning: One slot-free cast per Long Rest while in the ${phase} phase.`
            : `Lunar Embodiment: Cast without a spell slot in the ${phase} phase. One use per Long Rest across all phases.`,
        }),
      },
    }
  })
  return lunar.moonFire
    ? [
        ...grants,
        {
          spellName: formatSpellReference('Sacred Flame', cls.source),
          level: lunar.level,
          isCantrip: true,
          expectedSpellLevel: 0,
          mode: 'known',
          feature: { name: 'Moon Fire', target: 'moon-fire' },
        },
      ]
    : grants
}

function pushSpellList(
  grants: SubclassSpellGrant[],
  mode: SubclassSpellGrant['mode'],
  levelText: string,
  spells: unknown,
  maxClassLevel: number,
): void {
  const level = Number.parseInt(levelText, 10)
  if (!Number.isFinite(level) || level < 1 || level > maxClassLevel) return
  if (!Array.isArray(spells)) return

  for (const raw of spells) {
    if (typeof raw !== 'string') continue
    const parsed = parseSpellToken(raw)
    if (!parsed.name) continue
    grants.push({
      spellName: parsed.name,
      level,
      isCantrip: parsed.isCantrip,
      mode,
    })
  }
}

export function parseSubclassSpells(
  additionalSpells: SubclassAdditionalSpells[] | undefined,
  classLevel: number,
): SubclassSpellGrant[] {
  if (!additionalSpells || additionalSpells.length === 0 || classLevel < 1) return []

  const grants: SubclassSpellGrant[] = []

  for (const block of additionalSpells) {
    for (const [levelText, spells] of Object.entries(block.prepared ?? {})) {
      pushSpellList(grants, 'prepared', levelText, spells, classLevel)
    }

    for (const [levelText, spells] of Object.entries(block.known ?? {})) {
      pushSpellList(grants, 'known', levelText, spells, classLevel)
    }

    for (const [levelText, spells] of Object.entries(block.expanded ?? {})) {
      pushSpellList(grants, 'expanded', levelText, spells, classLevel)
    }

    for (const [levelText, usageConfig] of Object.entries(block.innate ?? {})) {
      const level = Number.parseInt(levelText, 10)
      if (!Number.isFinite(level) || level < 1 || level > classLevel) continue
      if (!usageConfig || typeof usageConfig !== 'object') continue

      const daily = (usageConfig as Record<string, unknown>).daily
      if (!daily || typeof daily !== 'object') continue

      for (const spells of Object.values(daily as Record<string, unknown>)) {
        if (!Array.isArray(spells)) continue
        for (const raw of spells) {
          if (typeof raw !== 'string') continue
          const parsed = parseSpellToken(raw)
          if (!parsed.name) continue
          grants.push({
            spellName: parsed.name,
            level,
            isCantrip: parsed.isCantrip,
            mode: 'innate',
          })
        }
      }
    }
  }

  return grants
}
