import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import type { RaceSpellChoice } from '@/types/character'
import { countUniqueSpellNames } from './spellProfiles.profiles'

export interface SpellListItem {
  profileId: string
  profileLabel: string
  className?: string
  classSource?: string
  alwaysPrepared?: boolean
  isPreparedCaster?: boolean
  name: string
  level: number
  kind: 'cantrip' | 'spell'
  prepared: boolean
  isFixed?: boolean
}

export interface PreparedCasterSpellItem {
  spell: Spell5e
  item: SpellListItem
}

export interface SpellProfileLike {
  id: string
  type?: string
  label: string
  className?: string
  classSource?: string
  alwaysPrepared?: boolean
  castingAbility?: string
  castingAbilityOptions?: string[]
  choices?: RaceSpellChoice[]
  fixedSpells?: string[]
  alwaysPreparedSpells?: string[]
  preparedSpells?: string[]
  spellSwaps?: Record<number, { removed: string; added: string }>
}

export interface SpellcastingDetailLike {
  profileId: string
  isPreparedCaster?: boolean
  isTruePreparedCaster?: boolean
  isLevelOnlyPreparedCaster?: boolean
  preparedSpellLimit?: number | null
  knownSpellLimit?: number | null
  cantripLimit?: number | null
}

export interface SpellProfileDisplayModel {
  profile: SpellProfileLike
  detail?: SpellcastingDetailLike
  items: SpellListItem[]
  swappedByAddedName: Map<string, { removed: string; level: number }>
  isRacial: boolean
  isBonusProfile: boolean
  isLevelOnly: boolean
  isTruePrepared: boolean
  availableClassItems: PreparedCasterSpellItem[]
  availableClassSpells: Spell5e[]
  preparedSet: Set<string>
  preparedCount: number
  preparedTotal: number
  levels: number[]
  availableLevels: number[]
  displayedTotal: number
  missingCantrips: number
  missingSpells: number
  hasMissingSpells: boolean
  missingSummary: string
  unfulfilledChoices: RaceSpellChoice[]
  totalUnchosenSpells: number
  firstUnfulfilledChoice?: RaceSpellChoice
  hasUnfulfilledChoices: boolean
  showDefaultEmptyState: boolean
}

interface BuildSpellProfileDisplayModelsOptions {
  spellProfiles: SpellProfileLike[]
  detailsByProfileId: ReadonlyMap<string, SpellcastingDetailLike>
  groupedItems: ReadonlyMap<string, SpellListItem[]>
  preparedCasterItemsByProfile?: ReadonlyMap<string, PreparedCasterSpellItem[]>
}

export function buildSpellProfileDisplayModels({
  spellProfiles,
  detailsByProfileId,
  groupedItems,
  preparedCasterItemsByProfile,
}: BuildSpellProfileDisplayModelsOptions): SpellProfileDisplayModel[] {
  return spellProfiles.flatMap((profile) => {
    const items = groupedItems.get(profile.id) ?? []
    const detail = detailsByProfileId.get(profile.id)
    const isRacial = profile.type === 'racial'
    const unfulfilledChoices = (profile.choices ?? []).filter(
      (choice) => choice.selected.length < choice.count,
    )
    const hasUnfulfilledChoices = unfulfilledChoices.length > 0
    if (isRacial && items.length === 0 && !hasUnfulfilledChoices) return []
    if (profile.type === 'class' && !detail) return []

    const swappedByAddedName = new Map<string, { removed: string; level: number }>()
    for (const [level, swap] of Object.entries(profile.spellSwaps ?? {})) {
      swappedByAddedName.set(swap.added, { removed: swap.removed, level: Number(level) })
    }

    const isLevelOnly = profile.type === 'class' && !!detail?.isLevelOnlyPreparedCaster
    const isTruePrepared = profile.type === 'class' && !!detail?.isTruePreparedCaster
    const availableClassItems = isTruePrepared
      ? (preparedCasterItemsByProfile?.get(profile.id) ?? [])
      : []
    const availableClassSpells = availableClassItems.map(({ spell }) => spell)
    const alwaysPreparedSet = new Set((profile.alwaysPreparedSpells ?? []).map(normalizeKey))
    const preparedSet = isTruePrepared
      ? new Set(
          (profile.preparedSpells ?? [])
            .filter((name) => !alwaysPreparedSet.has(normalizeKey(name)))
            .map(normalizeKey),
        )
      : new Set(
          items
            .filter((item) => item.kind === 'spell' && item.prepared)
            .map((item) => normalizeKey(item.name)),
        )
    const preparedCount = preparedSet.size
    const preparableCount = isTruePrepared
      ? availableClassItems.filter(({ item }) => !item.alwaysPrepared).length
      : countUniqueSpellNames(
          items
            .filter((item) => item.kind === 'spell' && !item.alwaysPrepared)
            .map((item) => item.name),
        )
    const preparedTotal = detail?.isPreparedCaster
      ? (detail.preparedSpellLimit ?? preparableCount)
      : preparableCount
    const levels = [...new Set(items.map((item) => item.level))].sort((left, right) => left - right)
    const availableLevels = isTruePrepared
      ? [...new Set(availableClassSpells.map((spell) => spell.level))].sort(
          (left, right) => left - right,
        )
      : []
    const currentCantrips = countUniqueSpellNames(
      items.filter((item) => item.kind === 'cantrip' && !item.isFixed).map((item) => item.name),
    )
    const currentSpells = countUniqueSpellNames(
      items.filter((item) => item.kind === 'spell' && !item.isFixed).map((item) => item.name),
    )
    const missingCantrips =
      detail?.cantripLimit == null ? 0 : Math.max(0, detail.cantripLimit - currentCantrips)
    const missingSpells =
      isRacial || isTruePrepared || detail?.knownSpellLimit == null
        ? 0
        : Math.max(0, detail.knownSpellLimit - currentSpells)
    const missingSummary = [
      missingCantrips > 0 ? `${missingCantrips} cantrip${missingCantrips === 1 ? '' : 's'}` : null,
      missingSpells > 0 ? `${missingSpells} spell${missingSpells === 1 ? '' : 's'}` : null,
    ]
      .filter((value): value is string => value !== null)
      .join(', ')
    const totalUnchosenSpells = unfulfilledChoices.reduce(
      (total, choice) => total + choice.count - choice.selected.length,
      0,
    )

    return [
      {
        profile,
        detail,
        items,
        swappedByAddedName,
        isRacial,
        isBonusProfile: profile.id === SPECIAL_SPELL_PROFILE_ID,
        isLevelOnly,
        isTruePrepared,
        availableClassItems,
        availableClassSpells,
        preparedSet,
        preparedCount,
        preparedTotal,
        levels,
        availableLevels,
        displayedTotal: isTruePrepared
          ? currentCantrips + availableClassSpells.length
          : items.length,
        missingCantrips,
        missingSpells,
        hasMissingSpells: missingCantrips > 0 || missingSpells > 0,
        missingSummary,
        unfulfilledChoices,
        totalUnchosenSpells,
        firstUnfulfilledChoice: unfulfilledChoices[0],
        hasUnfulfilledChoices,
        showDefaultEmptyState:
          items.length === 0 && availableClassSpells.length === 0 && !hasUnfulfilledChoices,
      },
    ]
  })
}
