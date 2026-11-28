import { useState } from 'react'
import { useStore } from 'zustand'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { resolveFeatChoicePool } from '@/lib/calculations/featChoices'
import { getNativeRacialSpellOwners } from '@/lib/calculations/nativeRacialSpells'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import type { FeatOptionTarget } from '@/lib/character/commands/featCommandIdentity'
import { getFeatChoiceSelectedRefs } from '@/lib/character/commands/featCommandSupport'
import { resolveConcreteToolChoiceCommand } from '@/lib/character/commands/featCommands'
import { formatProficiencyLabel } from '@/lib/displayLabels'
import { getFixedSpellcastingClass } from '@/lib/featGrants'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { NativeRacialSpellControls } from '@/pages/spells/components/NativeRacialSpellControls'
import { useCharacterEditingStore } from '@/store/characterEditingContext'
import type { Feat5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'
import { CreatorChoicePill, CreatorSpellPills, RaceChoiceRow } from '../RaceChoiceRow'
import {
  type CreatorChoiceScope,
  getCreatorChoiceGroups,
  getCreatorFeatSetupStatus,
  getCreatorRacialSpellOptions,
} from './creatorChoiceGroups'

export function CreatorChoices({
  scope,
  groups,
}: {
  scope: CreatorChoiceScope
  groups?: ReturnType<typeof getCreatorChoiceGroups>
}) {
  const store = useCharacterEditingStore()
  const character = useStore(store, (state) => state.activeCharacter)
  const context = useCharacterCalculationContext(character)
  const rules = useFilteredGameData()
  const featActions = useFeatProvenanceMutations()
  const profiles = context?.character.spells.spellProfiles ?? []
  const spellActions = useSpellProfileMutations(profiles)
  const [featChoiceId, setFeatChoiceId] = useState<string>()
  const [featOptions, setFeatOptions] = useState<{
    feat: Feat5e
    target: FeatOptionTarget
    options?: FeatOptionSelections
  }>()
  const [spellChoice, setSpellChoice] = useState<{ profileId: string; choiceId: string }>()
  if (!character || !context) return null

  const {
    choices,
    racialProfiles,
    fixedFeatOwners,
    proficiencyOptions,
    conflictingProficiencies,
    toolPools,
    pendingChoices,
    pendingFixedFeats,
    pendingSpells,
  } = groups ?? getCreatorChoiceGroups(character, rules, scope, context.character)
  const racialOwners = racialProfiles.length
    ? getNativeRacialSpellOwners(character, context.raceResolution)
    : null
  const activeSpell =
    spellChoice &&
    racialProfiles
      .find((row) => row.id === spellChoice.profileId)
      ?.choices?.find((row) => row.id === spellChoice.choiceId)
  const allowedSpellReferences = activeSpell
    ? new Set(getCreatorRacialSpellOptions(activeSpell, rules.spells))
    : undefined
  const activeFeat = choices.find(
    (choice) => choice.id === featChoiceId && choice.domain === 'feats',
  )
  const featPool = activeFeat && resolveFeatChoicePool(rules.feats, activeFeat.optionPool)
  const snapshot = buildPrerequisiteSnapshot({
    character,
    effectiveAbilityScores: context.abilityScores.total,
    classChoiceFeatureCatalogs: context.classChoices.catalogs,
    classChoicePrerequisites: context.classChoices.prerequisites,
    effectiveSpellProfiles: profiles,
  })
  const replaceFeatSpells = (
    target: FeatOptionTarget,
    options: FeatOptionSelections,
    spells: string[],
  ) => {
    if (store.getState().activeCharacter !== character) return
    featActions.editFeatWithOptions(target, options, { ...options, spells }, rules.spells)
  }

  return (
    <div className="min-w-0">
      {choices.map((choice) => {
        const { domain, selected, chooseCount, sourceTag } = choice
        const owner = `${sourceTag.sourceName}${sourceTag.sourceRef ? ` (${sourceTag.sourceRef})` : ''}`
        if (domain === 'feats') {
          const existing = getFeatChoiceSelectedRefs(choice)[0]
          const selectedRules =
            existing &&
            rules.feats.find((feat) => getFeatSelectionKey(feat) === getFeatSelectionKey(existing))
          const target = existing && { ...existing, provenanceChoiceId: choice.id }
          const options = existing?.options
          const controls = (
            <>
              <Button size="sm" variant="outline" onClick={() => setFeatChoiceId(choice.id)}>
                {existing ? 'Change feat' : 'Choose feat'}
              </Button>
              {selectedRules && hasFeatOptions(selectedRules) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setFeatOptions({
                      feat: selectedRules,
                      target: { ...selectedRules, provenanceChoiceId: choice.id },
                      options: existing?.options,
                    })
                  }
                >
                  Edit feat options
                </Button>
              )}
            </>
          )
          return (
            <RaceChoiceRow
              key={choice.id}
              title={existing?.name ?? 'Feat'}
              detail={owner}
              pending={pendingChoices.has(choice.id)}
              complete={
                !!selectedRules &&
                (!hasFeatOptions(selectedRules) ||
                  (!!target &&
                    getCreatorFeatSetupStatus(
                      character,
                      context.character,
                      target,
                      selectedRules,
                      rules.feats,
                    ).complete))
              }
            >
              <CreatorSpellPills
                spells={options?.spells}
                onChange={
                  target && options
                    ? (spells) => replaceFeatSpells(target, options, spells)
                    : undefined
                }
              />
              {controls}
            </RaceChoiceRow>
          )
        }
        if (
          domain !== 'skills' &&
          domain !== 'languages' &&
          domain !== 'tools' &&
          domain !== 'armor' &&
          domain !== 'weapons'
        )
          return null
        const options = proficiencyOptions.get(choice.id) ?? []
        const conflicts = conflictingProficiencies.get(choice.id)
        const update = (name: string, adding: boolean) => {
          if (store.getState().activeCharacter !== character) return
          if (domain !== 'tools') {
            featActions.resolveChoiceSelection(domain, name, adding, choice.id)
          } else {
            const result = resolveConcreteToolChoiceCommand(
              character,
              choice,
              name,
              adding,
              toolPools,
              context.classChoices.catalogs,
            )
            store.getState().updateCharacter(character.id, {
              ...result.characterPatch,
              provenance: result.provenanceUpdate,
            })
          }
        }
        const title = formatProficiencyLabel(domain)
        const label = `${title} · ${owner}`
        const progress = `${selected.length} / ${chooseCount} chosen`
        const controls = (
          <>
            {selected.map((name) => (
              <CreatorChoicePill
                key={name}
                pending={conflicts?.has(name)}
                remove={{
                  label: `Remove ${formatProficiencyLabel(name)} from ${label}`,
                  onClick: () => update(name, false),
                }}
              >
                {formatProficiencyLabel(name)}
              </CreatorChoicePill>
            ))}
            {selected.length < chooseCount && options.length > 0 && (
              <Select value="" onValueChange={(name) => update(name, true)}>
                <SelectTrigger aria-label={label} className="min-w-40">
                  <SelectValue placeholder={`Choose ${title.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((name) => (
                    <SelectItem key={name} value={name}>
                      {formatProficiencyLabel(name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )
        return (
          <RaceChoiceRow
            key={choice.id}
            title={title}
            detail={
              conflicts
                ? `${owner} · Replace a pick granted by another source`
                : `${owner} · ${progress}`
            }
            pending={pendingChoices.has(choice.id)}
            complete={selected.length >= chooseCount}
          >
            {controls}
          </RaceChoiceRow>
        )
      })}
      {fixedFeatOwners.map((owner) => {
        const feat = owner.data
        if (!feat) return null
        const { options } = owner
        const button = (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFeatOptions({ feat, target: owner.target, options: owner.options })}
          >
            {owner.options ? 'Edit feat options' : 'Configure feat'}
          </Button>
        )
        return (
          <RaceChoiceRow
            key={owner.focusKey}
            title={feat.name}
            detail={owner.label}
            pending={pendingFixedFeats.has(owner.focusKey)}
            complete={
              getCreatorFeatSetupStatus(
                character,
                context.character,
                owner.target,
                feat,
                rules.feats,
              ).complete
            }
          >
            <CreatorSpellPills
              spells={options?.spells}
              onChange={
                options ? (spells) => replaceFeatSpells(owner.target, options, spells) : undefined
              }
            />
            {button}
          </RaceChoiceRow>
        )
      })}
      {racialProfiles.length > 0 && (
        <NativeRacialSpellControls
          profiles={racialProfiles}
          owners={racialOwners}
          layout="inline"
          pending={pendingSpells}
          onSetSuite={spellActions.setRacialSpellSuite}
          onSetAbility={spellActions.setRacialCastingAbility}
          onEditChoice={(profileId, choiceId) => setSpellChoice({ profileId, choiceId })}
          onClearChoice={spellActions.setRacialSpellChoice}
        />
      )}
      {activeFeat && featPool && (
        <FeatSelectionModal
          open
          onOpenChange={(open) => {
            if (!open) setFeatChoiceId(undefined)
          }}
          feats={featPool.eligibleFeats}
          maxSelections={1}
          initialFilters={featPool.initialFilters}
          initialSelectedIds={getFeatChoiceSelectedRefs(activeFeat).map(getFeatSelectionKey)}
          characterSnapshot={snapshot}
          onConfirm={([feat]) => {
            if (!feat) return
            setFeatChoiceId(undefined)
            if (
              getFeatChoiceSelectedRefs(activeFeat).some(
                (existing) => getFeatSelectionKey(existing) === getFeatSelectionKey(feat),
              )
            )
              return
            featActions.resolveFeatChoiceSelection(activeFeat.id, feat)
            if (hasFeatOptions(feat))
              setFeatOptions({ feat, target: { ...feat, provenanceChoiceId: activeFeat.id } })
          }}
        />
      )}
      {featOptions && (
        <FeatOptionsModal
          open
          onOpenChange={(open) => {
            if (!open) setFeatOptions(undefined)
          }}
          feat={featOptions.feat}
          optionTarget={featOptions.target}
          initialSelections={featOptions.options}
          fixedSpellcastingClass={getFixedSpellcastingClass(
            featOptions.feat,
            featOptions.target.grantVariant,
          )}
          proficientSkillNames={context.character.proficiencies.skills}
          onDismiss={() => setFeatOptions(undefined)}
          onFinish={(values) => {
            featActions.commitFeatWithOptions(featOptions.target, values, rules.spells)
            setFeatOptions(undefined)
          }}
        />
      )}
      {activeSpell && spellChoice && (
        <SpellSelectionModal
          open
          onOpenChange={(open) => {
            if (!open) setSpellChoice(undefined)
          }}
          title={activeSpell.isCantrip ? 'Choose racial cantrips' : 'Choose racial spells'}
          spells={rules.spells}
          initialSelectedNames={activeSpell.selected}
          allowedSpellReferences={allowedSpellReferences}
          classListOverrides={allowedSpellReferences}
          selectionMode="racial-choice"
          categories={[
            {
              key: 'selection',
              label: activeSpell.isCantrip ? 'cantrips' : 'spells',
              max: activeSpell.count,
              test: () => true,
            },
          ]}
          onConfirm={(selected) => {
            spellActions.setRacialSpellChoice(spellChoice.profileId, spellChoice.choiceId, selected)
            setSpellChoice(undefined)
          }}
        />
      )}
    </div>
  )
}
