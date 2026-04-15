import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { OptionalFeatureSelectionModal } from '@/components/modals/OptionalFeatureSelectionModal'
import type { ActiveFilters, CategoryLimit } from '@/components/modals/SelectionModal'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import { SubclassSelectionModal } from '@/components/modals/SubclassSelectionModal'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getFeatureTypes, type OptionalFeatureLike } from '@/lib/5etools/classData'
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites'
import {
  buildClassProfileLabel,
  buildClassSpellSelectionsByLevel,
  ensureSpellProfiles,
  getKnownSpellNames,
} from '@/lib/calculations/spellProfiles'
import { formatSpellLevel, getOrdinalForm } from '@/lib/calculations/spellUtils'
import { AsiPickerDialog } from '@/pages/build/class/components/AsiPickerDialog'
import { ClassSelectionDialog } from '@/pages/build/class/components/ClassSelectionDialog'
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools'
import type { AsiChoice, Character } from '@/types/character'

interface SubclassOption {
  name: string
  source?: string
  shortName?: string
  entries?: unknown[]
  levelFeatures?: {
    level: number
    features: { name: string; source?: string; entries?: unknown[] }[]
  }[]
}

interface OptPickerState {
  progName: string
  featureTypes: string[]
  total: number
}

interface ClassFeatPickerState {
  progName: string
  categories: string[]
  total: number
}

type OptionalFeatureModalOption = {
  name: string
  source?: string
  entries?: unknown[]
  [extra: string]: unknown
}

interface BuildClassModalsProps {
  character: Character
  classes: Class5e[]
  classPickerOpen: boolean
  classPickerSearch: string
  onClassPickerOpenChange: (open: boolean) => void
  onClassPickerSearchChange: (search: string) => void
  onClassSelect: (className: string, classSource?: string) => void

  spellPickerLevel: number | null
  onSpellPickerLevelChange: (level: number | null) => void
  spellChoicesByLevel: Map<
    number,
    {
      cantrips: number
      spells: number
      maxSpellLevel: number
      canSwap: boolean
    }
  >
  classSpells: Spell5e[]
  spellByName: Map<string, Spell5e>
  viewingClass?: string
  viewingClassSource?: string
  onApplyBatchSpellSelections: (
    className: string,
    classSource: string | undefined,
    spells: Array<{ name: string; grantedAtLevel?: number }>,
  ) => void
  onRemoveSpellProvenance: (spellName: string) => void
  onSwapSpellProvenance: (
    className: string,
    classSource: string | undefined,
    removedName: string,
    addedName: string,
  ) => void
  onUpdateCharacter: (patch: Partial<Character>) => void

  spellSwapLevel: number | null
  spellSwapDrop: string | null
  onSpellSwapLevelChange: (level: number | null) => void
  onSpellSwapDropChange: (drop: string | null) => void

  subclassPickerOpen: boolean
  onSubclassPickerOpenChange: (open: boolean) => void
  subclassTitle: string
  subclasses: SubclassOption[]
  viewingSubclass?: string
  onSubclassConfirm: (subclass: SubclassOption) => void

  optPickerState: OptPickerState | null
  onOptPickerStateChange: (state: OptPickerState | null) => void
  optFeatures: OptionalFeatureLike[]
  characterSnapshot: PrereqCharacterSnapshot
  onOptFeatureConfirm: (names: string[], featureTypes: string[]) => void

  asiPickerLevel: number | null
  onAsiPickerLevelChange: (level: number | null) => void
  appliedAsiChoicesForClass: AsiChoice[]
  onAsiApply: (level: number, changes: Record<string, 1 | 2>) => void

  featPickerOpen: boolean
  onFeatPickerOpenChange: (open: boolean) => void
  featModalFeats: Feat5e[]
  totalFeatSlots: number
  usedASI: number
  onFeatConfirm: (selectedFeats: Feat5e[]) => void

  classFeatPickerState: ClassFeatPickerState | null
  onClassFeatPickerStateChange: (state: ClassFeatPickerState | null) => void
  feats: Feat5e[]
  featByCompositeId: Map<string, Feat5e>
}

export function BuildClassModals({
  character,
  classes,
  classPickerOpen,
  classPickerSearch,
  onClassPickerOpenChange,
  onClassPickerSearchChange,
  onClassSelect,
  spellPickerLevel,
  onSpellPickerLevelChange,
  spellChoicesByLevel,
  classSpells,
  spellByName,
  viewingClass,
  viewingClassSource,
  onApplyBatchSpellSelections,
  onRemoveSpellProvenance,
  onSwapSpellProvenance,
  onUpdateCharacter,
  spellSwapLevel,
  spellSwapDrop,
  onSpellSwapLevelChange,
  onSpellSwapDropChange,
  subclassPickerOpen,
  onSubclassPickerOpenChange,
  subclassTitle,
  subclasses,
  viewingSubclass,
  onSubclassConfirm,
  optPickerState,
  onOptPickerStateChange,
  optFeatures,
  characterSnapshot,
  onOptFeatureConfirm,
  asiPickerLevel,
  onAsiPickerLevelChange,
  appliedAsiChoicesForClass,
  onAsiApply,
  featPickerOpen,
  onFeatPickerOpenChange,
  featModalFeats,
  totalFeatSlots,
  usedASI,
  onFeatConfirm,
  classFeatPickerState,
  onClassFeatPickerStateChange,
  feats,
  featByCompositeId,
}: BuildClassModalsProps) {
  return (
    <>
      <ClassSelectionDialog
        open={classPickerOpen}
        classes={classes}
        search={classPickerSearch}
        selectedClassName={character.class}
        selectedClassSource={character.classSource}
        onOpenChange={(open) => {
          onClassPickerOpenChange(open)
          if (!open) onClassPickerSearchChange('')
        }}
        onSearchChange={onClassPickerSearchChange}
        onClassSelect={onClassSelect}
      />

      {spellPickerLevel !== null &&
        (() => {
          const gain = spellChoicesByLevel.get(spellPickerLevel)
          if (!gain) return null

          const classProfileId = `class:${viewingClass ?? ''}|${viewingClassSource ?? ''}`
          const profiles = ensureSpellProfiles(character)
          const classProfile = profiles.find((profile) => profile.id === classProfileId)
          const classProfileNames = classProfile
            ? new Set([...classProfile.cantrips, ...classProfile.spellsKnown])
            : new Set<string>()
          const selectionsByLevel = buildClassSpellSelectionsByLevel({
            character,
            className: viewingClass,
            classSource: viewingClassSource,
          })
          const initialSelectedNames = selectionsByLevel.get(spellPickerLevel) ?? []
          const lockedNames = new Set(
            [...getKnownSpellNames(profiles)].filter((name) => !classProfileNames.has(name)),
          )
          const initialSelectedSet = new Set(initialSelectedNames)
          const characterSpellNames = new Set(
            [...getKnownSpellNames(profiles)].filter((name) => !initialSelectedSet.has(name)),
          )

          const categories: CategoryLimit<Spell5e>[] = []
          if (gain.cantrips > 0) {
            categories.push({
              key: 'cantrips',
              label: 'cantrips',
              max: gain.cantrips,
              test: (spell) => spell.level === 0,
            })
          }
          if (gain.spells > 0) {
            categories.push({
              key: 'spells',
              label:
                gain.maxSpellLevel > 0
                  ? `<=${getOrdinalForm(gain.maxSpellLevel)} spells`
                  : 'spells',
              max: gain.spells,
              test: (spell) =>
                spell.level > 0 && (gain.maxSpellLevel === 0 || spell.level <= gain.maxSpellLevel),
            })
          }

          const title = [
            gain.cantrips > 0 && `Learn ${gain.cantrips} cantrip${gain.cantrips > 1 ? 's' : ''}`,
            gain.spells > 0 &&
              `${gain.spells} spell${gain.spells > 1 ? 's' : ''}${gain.maxSpellLevel > 0 ? ` (up to ${getOrdinalForm(gain.maxSpellLevel)}-level)` : ''}`,
          ]
            .filter(Boolean)
            .join(' · ')

          const levelValues: string[] = []
          if (gain.cantrips > 0) levelValues.push('0')
          if (gain.spells > 0 && gain.maxSpellLevel > 0) {
            for (let i = 1; i <= gain.maxSpellLevel; i++) {
              levelValues.push(String(i))
            }
          }

          const allowedLevels = new Set(levelValues)
          const initialFilters: ActiveFilters = {
            level: new Set(levelValues),
            school: new Set(),
            type: new Set(),
          }

          return (
            <SpellSelectionModal
              open={true}
              onOpenChange={(open) => {
                if (!open) onSpellPickerLevelChange(null)
              }}
              title={title}
              spells={classSpells}
              initialSelectedNames={initialSelectedNames}
              lockedNames={lockedNames}
              characterSpellNames={characterSpellNames}
              categories={categories}
              initialFilters={initialFilters}
              allowedLevels={allowedLevels}
              onConfirm={(names) => {
                const previousLevelNames = selectionsByLevel.get(spellPickerLevel) ?? []
                const previousLevelSet = new Set(previousLevelNames)
                const nextLevelSet = new Set(names)
                const newSpells: Array<{ name: string; grantedAtLevel?: number }> = []

                const nextSelectionsByLevel = new Map(selectionsByLevel)
                if (names.length > 0) {
                  nextSelectionsByLevel.set(spellPickerLevel, names)
                } else {
                  nextSelectionsByLevel.delete(spellPickerLevel)
                }

                const classSelectedNames = Array.from(nextSelectionsByLevel.values()).flatMap(
                  (selected) => selected ?? [],
                )
                const uniqueClassSelectedNames = [...new Set(classSelectedNames)]
                const nextProfileCantrips = uniqueClassSelectedNames.filter(
                  (name) => spellByName.get(name)?.level === 0,
                )
                const nextProfileKnown = uniqueClassSelectedNames.filter(
                  (name) => spellByName.get(name)?.level !== 0,
                )

                const mappedProfiles = profiles.map((profile) => {
                  if (profile.id !== classProfileId) return profile
                  return {
                    ...profile,
                    cantrips: nextProfileCantrips,
                    spellsKnown: nextProfileKnown,
                    preparedSpells: profile.preparedSpells.filter((spellName) =>
                      nextProfileKnown.includes(spellName),
                    ),
                  }
                })
                const hasProfile = mappedProfiles.some((profile) => profile.id === classProfileId)
                const nextProfiles = hasProfile
                  ? mappedProfiles
                  : [
                      ...mappedProfiles,
                      {
                        id: classProfileId,
                        type: 'class' as const,
                        label:
                          classProfile?.label ??
                          buildClassProfileLabel({
                            name: viewingClass ?? 'Class Spells',
                            source: viewingClassSource,
                            levels:
                              character.classProgression?.find(
                                (entry) =>
                                  entry.name === viewingClass &&
                                  (entry.source ?? '') === (viewingClassSource ?? ''),
                              )?.levels ?? 1,
                          }),
                        className: viewingClass,
                        classSource: viewingClassSource,
                        cantrips: nextProfileCantrips,
                        spellsKnown: nextProfileKnown,
                        preparedSpells: [],
                        alwaysPrepared: false,
                      },
                    ]

                onUpdateCharacter({
                  spells: {
                    ...character.spells,
                    spellProfiles: nextProfiles,
                  },
                })

                for (const name of names) {
                  if (previousLevelSet.has(name)) continue
                  if (viewingClass) {
                    newSpells.push({ name, grantedAtLevel: spellPickerLevel })
                  }
                }
                if (viewingClass && newSpells.length > 0) {
                  onApplyBatchSpellSelections(viewingClass, viewingClassSource, newSpells)
                }

                const remainingKnownNames = new Set(
                  nextProfiles.flatMap((profile) => [...profile.cantrips, ...profile.spellsKnown]),
                )

                for (const name of previousLevelNames) {
                  if (nextLevelSet.has(name) || remainingKnownNames.has(name)) {
                    continue
                  }
                  onRemoveSpellProvenance(name)
                }
                onSpellPickerLevelChange(null)
              }}
            />
          )
        })()}

      {subclassPickerOpen && (
        <SubclassSelectionModal
          open={subclassPickerOpen}
          onOpenChange={onSubclassPickerOpenChange}
          title={`Choose ${subclassTitle}`}
          subclasses={subclasses}
          selectedName={viewingSubclass ?? undefined}
          onConfirm={onSubclassConfirm}
        />
      )}

      {optPickerState &&
        (() => {
          const featuresOfType = optFeatures.filter((feature) => {
            const featureTypes = getFeatureTypes(feature)
            return optPickerState.featureTypes.some((type) => featureTypes.includes(type))
          })

          const initialSelectedNames = character.features
            .filter((feature) => featuresOfType.some((of) => of.name === feature.name))
            .map((feature) => feature.name)

          const modalFeatures: OptionalFeatureModalOption[] = featuresOfType.map((feature) => ({
            ...feature,
          }))

          return (
            <OptionalFeatureSelectionModal
              open={true}
              onOpenChange={(open) => {
                if (!open) onOptPickerStateChange(null)
              }}
              title={`Choose ${optPickerState.progName}`}
              features={modalFeatures}
              maxSelections={optPickerState.total}
              initialSelectedNames={initialSelectedNames}
              characterSnapshot={characterSnapshot}
              className={viewingClass}
              onConfirm={(names) => {
                onOptFeatureConfirm(names, optPickerState.featureTypes)
                onOptPickerStateChange(null)
              }}
            />
          )
        })()}

      {asiPickerLevel !== null && (
        <AsiPickerDialog
          open={true}
          level={asiPickerLevel}
          existingChanges={
            appliedAsiChoicesForClass.find((ac) => ac.level === asiPickerLevel)?.abilityChanges
          }
          onApply={(changes) => onAsiApply(asiPickerLevel, changes)}
          onClose={() => onAsiPickerLevelChange(null)}
        />
      )}

      <FeatSelectionModal
        open={featPickerOpen}
        onOpenChange={onFeatPickerOpenChange}
        feats={featModalFeats}
        maxSelections={Math.max(totalFeatSlots, usedASI)}
        initialSelectedIds={(character.feats ?? []).map(
          (feat) => `${feat.name}|${feat.source ?? ''}`,
        )}
        characterSnapshot={characterSnapshot}
        allowIgnoreLimit={false}
        onConfirm={onFeatConfirm}
      />

      {classFeatPickerState &&
        (() => {
          const categorySet = new Set(classFeatPickerState.categories)
          const available = feats.filter(
            (feat) => !!feat.category && categorySet.has(feat.category),
          )
          const availableIds = new Set(available.map((feat) => `${feat.name}|${feat.source ?? ''}`))
          const savedInCategory = (character.specialFeats ?? []).filter((specialFeat) => {
            const feat = featByCompositeId.get(`${specialFeat.name}|${specialFeat.source ?? ''}`)
            return !!feat?.category && categorySet.has(feat.category)
          })
          const savedNotInList = savedInCategory
            .filter(
              (specialFeat) => !availableIds.has(`${specialFeat.name}|${specialFeat.source ?? ''}`),
            )
            .map(
              (specialFeat) =>
                ({
                  name: specialFeat.name,
                  source: specialFeat.source,
                  entries: [],
                }) as Feat5e,
            )

          const modalFeats = [...available, ...savedNotInList]

          return (
            <FeatSelectionModal
              open={true}
              onOpenChange={(open) => {
                if (!open) onClassFeatPickerStateChange(null)
              }}
              feats={modalFeats}
              maxSelections={classFeatPickerState.total}
              initialSelectedIds={savedInCategory.map(
                (feat) => `${feat.name}|${feat.source ?? ''}`,
              )}
              initialFilters={{
                limit: new Set(),
                featCategory: new Set(),
                prereq: new Set(['showUnmet']),
              }}
              characterSnapshot={characterSnapshot}
              allowIgnoreLimit={false}
              onConfirm={(selectedFeats) => {
                const keptSpecial = (character.specialFeats ?? []).filter((specialFeat) => {
                  const feat = featByCompositeId.get(
                    `${specialFeat.name}|${specialFeat.source ?? ''}`,
                  )
                  return !feat?.category || !categorySet.has(feat.category)
                })

                const newSpecial = selectedFeats.map((feat) => ({
                  id: `${feat.name}-${feat.source ?? ''}`,
                  name: feat.name,
                  source: feat.source ?? '',
                  description: '',
                }))

                onUpdateCharacter({
                  specialFeats: [...keptSpecial, ...newSpecial],
                })
                onClassFeatPickerStateChange(null)
              }}
            />
          )
        })()}

      {spellSwapLevel !== null &&
        (() => {
          const classProfileId = `class:${viewingClass ?? ''}|${viewingClassSource ?? ''}`
          const profiles = ensureSpellProfiles(character)
          const classProfile = profiles.find((profile) => profile.id === classProfileId)
          if (!classProfile || classProfile.spellsKnown.length === 0) return null

          const maxSpellLevel = (() => {
            const gain = spellChoicesByLevel.get(spellSwapLevel)
            return gain?.maxSpellLevel ?? 0
          })()

          const closeSwap = () => {
            onSpellSwapLevelChange(null)
            onSpellSwapDropChange(null)
          }

          if (!spellSwapDrop) {
            // Step 1: Pick which spell to drop
            return (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open) closeSwap()
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Replace a Known Spell</DialogTitle>
                    <DialogDescription className="sr-only">
                      Select a spell to replace with a new one.
                    </DialogDescription>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select a spell to replace. You may swap one spell each time you gain a level.
                  </p>
                  <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                    {classProfile.spellsKnown.map((name) => {
                      const spell = spellByName.get(name)
                      return (
                        <button
                          key={spell ? `${spell.name}|${spell.source ?? ''}` : name}
                          type="button"
                          className="flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-accent/10 border border-transparent hover:border-accent/30 transition-colors text-left"
                          onClick={() => onSpellSwapDropChange(name)}
                        >
                          <span className="font-medium">{name}</span>
                          {spell && (
                            <span className="text-xs text-muted-foreground">
                              {formatSpellLevel(spell.level)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </DialogContent>
              </Dialog>
            )
          }

          // Step 2: Pick the replacement spell
          const lockedNames = new Set(
            [...getKnownSpellNames(profiles)].filter((name) => name !== spellSwapDrop),
          )
          const characterSpellNames = lockedNames
          const allowedLevels = new Set(
            Array.from({ length: maxSpellLevel }, (_, i) => String(i + 1)),
          )
          const categories: CategoryLimit<Spell5e>[] = [
            {
              key: 'replacement',
              label: `replacement (up to ${getOrdinalForm(maxSpellLevel)}-level)`,
              max: 1,
              test: (spell) =>
                spell.level > 0 && (maxSpellLevel === 0 || spell.level <= maxSpellLevel),
            },
          ]
          const initialFilters: ActiveFilters = {
            level: new Set(allowedLevels),
            school: new Set(),
            type: new Set(),
          }

          return (
            <SpellSelectionModal
              open
              onOpenChange={(open) => {
                if (!open) closeSwap()
              }}
              title={`Replace: ${spellSwapDrop}`}
              spells={classSpells}
              initialSelectedNames={[]}
              lockedNames={lockedNames}
              characterSpellNames={characterSpellNames}
              categories={categories}
              initialFilters={initialFilters}
              allowedLevels={allowedLevels}
              onConfirm={(names) => {
                const replacement = names[0]
                if (!replacement) {
                  closeSwap()
                  return
                }

                // Update spellsKnown: remove dropped, add replacement
                const nextKnown = classProfile.spellsKnown
                  .filter((n) => n !== spellSwapDrop)
                  .concat(replacement)

                // Also remove from preparedSpells if dropped spell was prepared
                const nextPrepared = classProfile.preparedSpells.filter((n) => n !== spellSwapDrop)

                // Record the swap
                const nextSwaps = {
                  ...classProfile.spellSwaps,
                  [spellSwapLevel]: { removed: spellSwapDrop, added: replacement },
                }

                const nextProfiles = profiles.map((profile) => {
                  if (profile.id !== classProfileId) return profile
                  return {
                    ...profile,
                    spellsKnown: nextKnown,
                    preparedSpells: nextPrepared,
                    spellSwaps: nextSwaps,
                  }
                })

                onUpdateCharacter({
                  spells: {
                    ...character.spells,
                    spellProfiles: nextProfiles,
                  },
                })

                // Update provenance: atomic remove + add (no level attribution)
                if (viewingClass) {
                  onSwapSpellProvenance(
                    viewingClass,
                    viewingClassSource,
                    spellSwapDrop,
                    replacement,
                  )
                }

                closeSwap()
              }}
            />
          )
        })()}
    </>
  )
}
