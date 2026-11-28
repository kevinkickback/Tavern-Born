import { useLayoutEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  CreatorChoicePill,
  CreatorSpellPills,
  RaceChoiceRow,
} from '@/components/character/RaceChoiceRow'
import { hasReachableFeatSetup } from '@/components/character/wizard/creatorChoiceGroups'
import { Button } from '@/components/ui/button'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useClassChoiceFeatureCatalogs } from '@/hooks/character/useClassChoiceFeatureCatalogs'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import {
  getProgressiveChoiceGainCount,
  getProgressiveChoiceReviewLevel,
  getRequiredChoiceSelectionCount,
} from '@/lib/5etools/classChoiceNormalization'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { isRevisedInvocationPoolId } from '@/lib/5etools/revisedInvocationPoolIdentity'
import { getAbilityScoreCap, getASILevelsFromClass } from '@/lib/calculations/gameRules'
import { checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import {
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  isClassChoiceOptionEligibleInDraft,
} from '@/lib/character/classChoiceOptions'
import { hasClassFeatSpellSetup } from '@/lib/character/classFeatChoices'
import { EPIC_BOON_LEVEL } from '@/lib/character/epicBoonSlots'
import {
  getManagedClassSpellFeatureLabel,
  getManagedClassSpellOwnerEntry,
  managedClassSpellId,
} from '@/lib/character/managedClassSpellIdentity'
import { formatProficiencyLabel } from '@/lib/displayLabels'
import { classChoiceReadinessId } from '@/lib/navigation/readinessFocus'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { AsiPickerDialog } from '@/pages/build/class/components/AsiPickerDialog'
import { ClassChoiceSelectionModal } from '@/pages/build/class/components/ClassChoiceSelectionModal'
import { ManagedClassSpellsDialog } from '@/pages/build/class/components/ManagedClassSpellsDialog'
import { useClassAsiFeatController } from '@/pages/build/class/hooks/useClassAsiFeatController'
import { useClassChoiceController } from '@/pages/build/class/hooks/useClassChoiceController'
import { useClassSpellChoiceController } from '@/pages/build/class/hooks/useClassSpellChoiceController'
import { getCreatorClassSpellStatus } from '@/pages/build/class/model/creatorClassSpellStatus'
import { getClassChoiceGainCount } from '@/pages/build/class/model/pageUtils'
import type { OptionalFeatureLike } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { FeatOptionsModal } from './FeatOptionsModal'
import { FeatSelectionModal } from './FeatSelectionModal'

export function GuidedLevelChoices({
  character,
  entry,
  onStatusChange,
}: {
  character: Character
  entry: CharacterClassEntry
  onStatusChange?: (available: boolean, pending: boolean) => void
}) {
  const gameData = useFilteredGameData()
  const {
    classes,
    creatures,
    feats,
    items,
    itemsBase,
    itemMasteries,
    optionalfeatures,
    races,
    spells,
  } = gameData
  const featureCatalogs = useClassChoiceFeatureCatalogs()
  const classLookup = useClassLookup()
  const calculation = useCharacterCalculationContext(character)
  const rules = findClassReference(entry, classes)
  const subclass = getSelectedSubclassData(rules, entry)
  const level = entry.levels
  const catalogs = useMemo(
    () => ({
      ...featureCatalogs,
      creatures,
      feats,
      items,
      itemsBase,
      itemMasteries,
      optionalFeatures: optionalfeatures as OptionalFeatureLike[],
      weaponProficiencies:
        calculation?.character.proficiencies.weapons ?? character.proficiencies.weapons,
    }),
    [
      featureCatalogs,
      creatures,
      feats,
      items,
      itemsBase,
      itemMasteries,
      optionalfeatures,
      calculation,
      character.proficiencies.weapons,
    ],
  )
  const asi = useClassAsiFeatController({
    character,
    viewingClass: entry.name,
    viewingClassSource: entry.source,
    classLookup,
    feats,
  })
  const choices = useClassChoiceController({
    character,
    viewingClassData: rules,
    viewingClassEntry: entry,
    viewingSubclassData: subclass,
    viewingClassLevel: level,
    knownWarlockCantrips: calculation?.classChoices.prerequisites.knownWarlockCantrips,
    includeClassFeatureVariants: character.variantRules?.optionalClassFeatures,
    catalogs,
    races,
    configurationPaused: !!asi.optionsPendingFeat,
    onFeatOptionsRequired: (feat, choiceId) =>
      asi.setOptionsPendingFeat({ ...feat, classFeatChoiceId: choiceId }),
  })
  const casting = useClassSpellChoiceController(rules, subclass)
  const boon = level === EPIC_BOON_LEVEL ? asi.epicBoonSlot : undefined
  const earned = choices.choices.filter(
    (choice) =>
      choice.id !== boon?.choiceId &&
      (choice.level === level || (getClassChoiceGainCount(choice, level) ?? 0) > 0),
  )
  const hasAsi = getASILevelsFromClass(rules).includes(level) || !!boon
  const abilityChoice =
    boon?.asi ?? asi.appliedAsiChoicesForClass.find((row) => row.level === level)
  const chosenFeat = boon?.feat ?? asi.classAsiFeats.find((feat) => feat.classLevel === level)
  const featRules =
    chosenFeat &&
    feats.find((feat) => getFeatSelectionKey(feat) === getFeatSelectionKey(chosenFeat))
  const spellGain = casting.choicesByLevel.get(level)
  const pendingFeat = asi.optionsPendingFeat
  const creator = !!onStatusChange
  const incomplete = useMemo(
    () =>
      new Set(
        creator && calculation
          ? validateClassChoices(character, calculation, catalogs).map((issue) => issue.id)
          : [],
      ),
    [creator, character, calculation, catalogs],
  )
  const meetsPrerequisites = (view: ClassChoiceOptionView) =>
    checkAllPrerequisites(view, asi.characterSnapshot, {
      className: entry.name,
      classSource: entry.source,
    }).met
  const actionable = earned.filter(
    (choice) =>
      !creator ||
      (choices.optionViewsByChoiceId.get(choice.id) ?? []).some(
        (view) => isClassChoiceOptionEligible(view) && meetsPrerequisites(view),
      ) ||
      (choices.selectedViewsByChoiceId.get(choice.id)?.length ?? 0) > 0,
  )
  const pendingChoiceIds = new Set(
    actionable
      .filter((choice) => {
        if (
          creator &&
          calculation &&
          character.classFeatChoices
            ?.find((row) => row.id === choice.id)
            ?.feats.some((selected) => {
              const feat = feats.find(
                (row) => getFeatSelectionKey(row) === getFeatSelectionKey(selected),
              )
              return (
                !!feat &&
                hasFeatOptions(feat) &&
                !hasClassFeatSpellSetup(character, choice.id, feat.name, feat.source) &&
                hasReachableFeatSetup(
                  character,
                  calculation.character,
                  { ...feat, classFeatChoiceId: choice.id },
                  feat,
                  gameData,
                )
              )
            })
        )
          return true
        if (!incomplete.has(classChoiceReadinessId(choice.id))) return false
        const selected = choices.selectedViewsByChoiceId.get(choice.id) ?? []
        if (selected.some((view) => view.setupComplete === false)) return true
        const picked = new Set(selected.map(({ reference }) => getClassChoiceOptionKey(reference)))
        return (choices.optionViewsByChoiceId.get(choice.id) ?? []).some(
          (view) =>
            isClassChoiceOptionEligibleInDraft(view, picked) &&
            meetsPrerequisites(view) &&
            !picked.has(getClassChoiceOptionKey(view.reference)),
        )
      })
      .map(({ id }) => id),
  )
  const spellStatus = useMemo(() => {
    if (!spellGain || !calculation)
      return { available: !!spellGain, pending: false, complete: false }
    return getCreatorClassSpellStatus(character, entry, calculation)
  }, [calculation, spellGain, entry, character])
  const hasSeparateSpellEdits =
    !creator &&
    (spellGain?.canSwap || spellGain?.canTranscribeRituals || spellGain?.spellbookSpecialty)
  const asiFeatNeedsOptions =
    creator &&
    !!calculation &&
    !!featRules &&
    hasFeatOptions(featRules) &&
    hasReachableFeatSetup(
      character,
      calculation.character,
      { ...featRules, selectionKind: 'ordinary' },
      featRules,
      gameData,
    )
  const showSpells = creator ? spellStatus.available : !!spellGain
  const available = actionable.length > 0 || hasAsi || showSpells
  const pending =
    pendingChoiceIds.size > 0 ||
    (hasAsi && ((!abilityChoice && !chosenFeat) || asiFeatNeedsOptions)) ||
    spellStatus.pending
  useLayoutEffect(() => onStatusChange?.(available, pending), [available, pending, onStatusChange])
  const spellsChosen = (calculation?.managedClassSpellStatuses ?? []).flatMap(
    ({ active, choice }) =>
      active && choice.slot[3] === level && getManagedClassSpellOwnerEntry(choice.slot, [entry])
        ? [choice]
        : [],
  )
  const spellControls = (
    <>
      {spellsChosen.map((choice) => {
        const { slot, target } = choice
        const spellLabel = spellsChosen.some(
          (other) => other.target.name === target.name && other.target.source !== target.source,
        )
          ? `${target.name} (${target.source})`
          : target.name
        const specialty = slot[1] === 'class-spellbook-specialty'
        const label = specialty
          ? `${spellLabel} · ${getManagedClassSpellFeatureLabel(slot) ?? 'Spellbook specialty'}`
          : spellLabel
        return (
          <CreatorChoicePill
            key={managedClassSpellId(slot)}
            description={`Source ${target.source}`}
            remove={
              specialty
                ? undefined
                : {
                    label: `Remove ${label}`,
                    onClick: () => {
                      try {
                        casting.finishClassSpellChoices([{ slot, expected: choice }])
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : 'Could not remove spell.',
                        )
                      }
                    },
                  }
            }
          >
            {label}
          </CreatorChoicePill>
        )
      })}
      {(!spellStatus.complete || hasSeparateSpellEdits) && (
        <Button
          size="sm"
          variant="outline"
          data-creator-choice-control={creator || undefined}
          onClick={() => casting.setPickerLevel(level)}
        >
          {spellsChosen.length > 0 ? 'Edit spells' : 'Choose spells'}
        </Button>
      )}
    </>
  )

  return (
    <div className={creator ? 'space-y-4' : '@container space-y-4'}>
      {actionable.length > 0 && (
        <section>
          {!creator && <h3 className="mb-1 text-sm font-semibold">Features & choices</h3>}
          <ul
            className={
              creator
                ? undefined
                : 'rounded-md border border-border bg-workspace-pane px-3 [&>li:last-child>section]:border-b-0'
            }
          >
            {actionable.map((choice) => {
              const progressive = getProgressiveChoiceGainCount(choice, level)
              const views = choices.selectedViewsByChoiceId.get(choice.id) ?? []
              const selection = character.classChoiceSelections?.find(
                (row) => row.choiceId === choice.id,
              )
              const pickedViews = progressive
                ? views.filter((view) => {
                    if (choice.kind === 'psionic' && 'slotLevel' in view.reference)
                      return view.reference.slotLevel === level
                    return selection?.selected.some(
                      (option) =>
                        getClassChoiceOptionKey(option) ===
                          getClassChoiceOptionKey(view.reference) &&
                        getProgressiveChoiceReviewLevel(choice, option.slotLevel, level) === level,
                    )
                  })
                : views
              const picked = pickedViews.length
              const count = progressive || getRequiredChoiceSelectionCount(choice, level)
              const complete =
                count > 0 &&
                pickedViews.filter(isClassChoiceOptionEligible).length >= count &&
                !pickedViews.some((view) => view.setupComplete === false)
              // Compound setups keep their dedicated editor. An ordinary pill represents one saved pick.
              const independentlyRemovable =
                !!selection &&
                !selection.favoredEnemy &&
                !selection.proficiencyAtGain &&
                !isRevisedInvocationPoolId(choice.id) &&
                choice.kind !== 'creature' &&
                choice.kind !== 'psionic'
              const removableKeys = new Set(
                independentlyRemovable
                  ? selection.selected
                      .map(getClassChoiceOptionKey)
                      .filter(
                        (key, index, keys) =>
                          index === keys.indexOf(key) && index === keys.lastIndexOf(key),
                      )
                  : [],
              )
              const showPicker =
                !complete ||
                pickedViews.some(
                  (view) =>
                    !isClassChoiceOptionEligible(view) ||
                    !removableKeys.has(getClassChoiceOptionKey(view.reference)),
                )
              const featOptions =
                character.classFeatChoices
                  ?.find((row) => row.id === choice.id)
                  ?.feats.flatMap((selected) => {
                    const feat = feats.find(
                      (row) => getFeatSelectionKey(row) === getFeatSelectionKey(selected),
                    )
                    return feat && hasFeatOptions(feat) ? [{ feat, options: selected.options }] : []
                  }) ?? []
              const detail = count > 0 ? `${picked} / ${count} chosen` : undefined
              const controls = (
                <>
                  {featOptions.map(({ feat }) => (
                    <Button
                      key={getFeatSelectionKey(feat)}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        asi.setOptionsPendingFeat({ ...feat, classFeatChoiceId: choice.id })
                      }
                    >
                      Edit {feat.name} options
                    </Button>
                  ))}
                  {showPicker && (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`${picked ? 'Edit' : 'Choose'} ${choice.label}`}
                      onClick={() =>
                        choices.open(choice, progressive === undefined ? undefined : level)
                      }
                    >
                      {picked ? 'Edit' : 'Choose'}
                    </Button>
                  )}
                </>
              )
              return (
                <li key={choice.id}>
                  <RaceChoiceRow
                    title={choice.label}
                    detail={detail}
                    pending={pendingChoiceIds.has(choice.id)}
                    complete={complete}
                  >
                    {pickedViews.map((view) => {
                      const { reference, selectionKey, displayLabel } = view
                      const key = getClassChoiceOptionKey(reference)
                      const label =
                        displayLabel ??
                        (choice.kind === 'proficiency'
                          ? formatProficiencyLabel(reference.name)
                          : reference.name)
                      return (
                        <CreatorChoicePill
                          key={selectionKey ?? key}
                          description={reference.source ? `Source ${reference.source}` : undefined}
                          remove={
                            isClassChoiceOptionEligible(view) && removableKeys.has(key)
                              ? {
                                  label: `Remove ${label}`,
                                  onClick: () =>
                                    choices.removeOption(
                                      choice,
                                      key,
                                      progressive === undefined ? undefined : level,
                                    ),
                                }
                              : undefined
                          }
                        >
                          {label}
                        </CreatorChoicePill>
                      )
                    })}
                    {featOptions.map(({ feat, options }) => (
                      <CreatorSpellPills
                        key={getFeatSelectionKey(feat)}
                        spells={options?.spells}
                        onChange={
                          options &&
                          ((spellsSelected) =>
                            asi.commitFeatWithOptions(
                              { ...feat, classFeatChoiceId: choice.id, initialOptions: options },
                              { ...options, spells: spellsSelected },
                              spells,
                            ))
                        }
                      />
                    ))}
                    {controls}
                  </RaceChoiceRow>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {hasAsi && (
        <section
          className="rounded-md border border-border bg-workspace-pane p-3"
          data-race-choice-pending={
            (creator && ((!abilityChoice && !chosenFeat) || asiFeatNeedsOptions)) || undefined
          }
        >
          <h3 className="text-sm font-semibold">{boon ? 'Epic Boon' : 'Ability scores or feat'}</h3>
          {abilityChoice && (
            <p className="mt-1 text-sm text-muted-foreground">
              {Object.entries(abilityChoice.abilityChanges)
                .map(([ability, value]) => `${ability} +${value}`)
                .join(', ')}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {chosenFeat && (
              <CreatorChoicePill
                description={chosenFeat.source ? `Source ${chosenFeat.source}` : undefined}
                remove={{
                  label: `Remove ${chosenFeat.name}`,
                  onClick: () => asi.clearFeatSelection(level),
                }}
              >
                {chosenFeat.name}
              </CreatorChoicePill>
            )}
            <CreatorSpellPills
              spells={chosenFeat?.options?.spells}
              onChange={
                !boon && featRules && chosenFeat?.options
                  ? (spellsSelected) =>
                      asi.commitFeatWithOptions(
                        {
                          ...featRules,
                          selectionKind: 'ordinary',
                          initialOptions: chosenFeat.options,
                        },
                        { ...chosenFeat.options, spells: spellsSelected },
                        spells,
                      )
                  : undefined
              }
            />
            {!chosenFeat && (!boon || boon.allowsAsi) && (
              <Button size="sm" variant="outline" onClick={() => asi.setAsiPickerLevel(level)}>
                {abilityChoice ? 'Edit ability scores' : 'Improve ability scores'}
              </Button>
            )}
            {!abilityChoice && !chosenFeat && (!boon || boon.current) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  asi.setFeatPickerLevel(level)
                  asi.setFeatPickerOpen(true)
                }}
              >
                Choose feat
              </Button>
            )}
            {abilityChoice && (
              <Button size="sm" variant="ghost" onClick={() => asi.resetAsi(level)}>
                Clear choice
              </Button>
            )}
            {featRules && hasFeatOptions(featRules) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (boon) asi.editEpicBoonOptions()
                  else asi.setOptionsPendingFeat({ ...featRules, selectionKind: 'ordinary' })
                }}
              >
                Edit feat options
              </Button>
            )}
          </div>
        </section>
      )}
      {showSpells && (
        <RaceChoiceRow
          title="Spells"
          detail="Choose the spells gained at this level"
          pending={spellStatus.pending}
          complete={spellStatus.complete}
        >
          {spellControls}
        </RaceChoiceRow>
      )}
      {!creator && !available && (
        <p className="text-sm text-muted-foreground">This level has no additional choices.</p>
      )}
      {choices.activeChoice && (
        <ClassChoiceSelectionModal
          key={`${choices.activeChoice.id}:${choices.activeGainLevel ?? ''}`}
          choice={choices.activeChoice}
          removalOnly={choices.activeRemovalOnly}
          options={choices.activeOptionViews}
          maximumSelections={choices.activeRequiredCount}
          initialSelectedIds={choices.activeInitialSelectedIds}
          characterSnapshot={asi.characterSnapshot}
          className={entry.name}
          classSource={entry.source}
          onClose={choices.close}
          onConfirm={choices.confirm}
          getDraftError={choices.getDraftError}
          historicalSetup={choices.historicalSetup}
          enemySetup={choices.enemySetup}
        />
      )}
      {asi.asiPickerLevel !== null && asi.asiBefore && (
        <AsiPickerDialog
          open
          level={level}
          baseScores={asi.asiBefore}
          scoreCap={getAbilityScoreCap(character.variantRules?.allowAbilityScoresAbove20)}
          requireFullIncrease={!!asi.epicBoonAsiPicker}
          existingChanges={abilityChoice?.abilityChanges}
          onApply={(changes) => asi.applyAsi(level, changes)}
          onClose={() => asi.setAsiPickerLevel(null)}
        />
      )}
      {asi.featPickerOpen && (
        <FeatSelectionModal
          open
          onOpenChange={(open) => {
            asi.setFeatPickerOpen(open)
            if (!open) asi.setFeatPickerLevel(null)
          }}
          feats={asi.featModalFeats}
          maxSelections={1}
          initialSelectedIds={asi.featPickerInitialSelectedIds}
          characterSnapshot={asi.featPickerSnapshot}
          requirePrerequisites={asi.revisedFeatSlot}
          onConfirm={asi.confirmFeat}
        />
      )}
      {pendingFeat && (
        <FeatOptionsModal
          open
          onOpenChange={(open) => {
            if (!open) asi.setOptionsPendingFeat(null)
          }}
          feat={pendingFeat}
          initialSelections={pendingFeat.initialOptions}
          optionTarget={pendingFeat}
          proficientSkillNames={character.proficiencies.skills}
          onFinish={(selections) => {
            asi.commitFeatWithOptions(pendingFeat, selections, spells)
            asi.setOptionsPendingFeat(null)
          }}
          onDismiss={() => asi.setOptionsPendingFeat(null)}
        />
      )}
      {casting.pickerLevel !== null && calculation && (
        <ManagedClassSpellsDialog
          character={character}
          entry={entry}
          level={level}
          context={calculation.classChoices.spellContext}
          statuses={calculation.managedClassSpellStatuses}
          onFinish={casting.finishClassSpellChoices}
          onOpenChange={(open) => {
            if (!open) casting.setPickerLevel(null)
          }}
        />
      )}
    </div>
  )
}
