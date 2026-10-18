import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  normalizeStormAuraChoices,
  resolveStormFeature,
  stormContextEntries,
  stormOptionGroup,
} from '@/lib/5etools/stormAuraChoices'
import {
  isStormAuraChoiceId,
  STORM_ENVIRONMENTS,
  type StormEnvironment,
  stormTarget,
} from '@/lib/5etools/stormAuraIdentity'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import { isValidStormAuraSelection } from '@/lib/schema/stormAuraValidation'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getClassChoiceOptionKey, getFeatureOwnerKey } from './classChoiceIdentity'
import {
  type ClassChoiceFeatureCatalogs,
  type ClassChoiceOptionView,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceOptions'
import type { FeatureOptionSelectionState } from './featureOptionSelections'

interface StormAuraStage {
  name: string
  level: number
  available: boolean
  entries: unknown[]
  parent?: ClassFeature
  child?: ClassFeature
  target?: string
}
export interface StormAuraRules {
  environment?: StormEnvironment
  stages: StormAuraStage[]
  fixedBenefits?: { damageType: string; swimSpeed?: number }
}
const DAMAGE = { Desert: 'fire', Sea: 'lightning', Tundra: 'cold' } as const
/** Live, owner-scoped source authority shared by setup, calculations and sheet projections. */
export function getStormAuraSelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): FeatureOptionSelectionState[] {
  return (character.classChoiceSelections ?? [])
    .filter((selection) => !selection.inactive && isStormAuraChoiceId(selection.choiceId))
    .map((selection) => {
      const owner = findClassReference(
        { name: selection.className, source: selection.classSource },
        character.classProgression,
      )
      const classData = owner ? findClassReference(owner, classes) : undefined
      const subclass = owner && classData ? getSelectedSubclassData(classData, owner) : undefined
      const currentOwner =
        owner &&
        getFeatureOwnerKey(owner.name, owner.source, owner.subclass, owner.subclassSource) ===
          getFeatureOwnerKey(
            selection.className,
            selection.classSource,
            selection.subclassName,
            selection.subclassSource,
          )
      const declarations =
        currentOwner && subclass
          ? collectUnconditionalFeatureReferences(
              subclass.subclassFeatureRefs ?? [],
              'subclassFeature',
            )
          : []
      const scoped = catalogs
        ? scopeClassChoiceFeatureCatalogs(
            catalogs,
            getFeatureOwnerKey(
              selection.className,
              selection.classSource,
              selection.subclassName,
              selection.subclassSource,
            ),
          )
        : undefined
      const candidates = (target: string) =>
        scoped?.subclassFeatureCandidates !== undefined
          ? (scoped.subclassFeatureCandidates.get(target) ?? [])
          : (scoped?.subclassFeatures.filter(
              (feature) => getSubclassFeatureIdentity(feature) === target,
            ) ?? [])
      const root = (name: string, level: number) => {
        const target = stormTarget(name, level)
        const refs = declarations.filter((row) => row.target === target)
        const rows = candidates(target)
        return refs.length && rows.length
          ? resolveStormFeature(target, [...refs.map((row) => row.reference.feature), ...rows])
          : undefined
      }
      const aura = root('Storm Aura', 3)
      const introVerified = !!root('Path of the Storm Herald', 3)
      const choice =
        aura &&
        introVerified &&
        isValidStormAuraSelection(selection) &&
        owner &&
        selection.selected.every((row) => row.slotLevel <= owner.levels)
          ? normalizeStormAuraChoices(
              {
                type: 'subclass',
                name: owner.name,
                source: owner.source,
                subclassName: owner.subclass,
                subclassSource: owner.subclassSource,
              },
              declarations,
            ).find(
              (row) =>
                row.id === selection.choiceId &&
                row.level === selection.classLevel &&
                row.level <= owner.levels,
            )
          : undefined
      const options: ClassChoiceOptionView[] = choice
        ? choice.options.map((reference) => {
            const feature = resolveStormFeature(
              getClassChoiceOptionKey(reference),
              candidates(getClassChoiceOptionKey(reference)),
            )
            return {
              reference,
              availability: feature ? 'eligible' : 'retained',
              entries: feature?.entries ?? [],
            }
          })
        : selection.selected.map((reference) => ({
            reference,
            availability: 'retained',
            entries: [],
          }))
      const recovery = !choice || !options.some((row) => row.availability === 'eligible')
      const selected =
        selection.selected.length === 1
          ? options.find(
              (row) =>
                getClassChoiceOptionKey(row.reference) ===
                  getClassChoiceOptionKey(selection.selected[0]) && row.availability === 'eligible',
            )
          : undefined
      const environment = selected
        ? STORM_ENVIRONMENTS.find(
            (name) => name.toLowerCase() === selected.reference.name.trim().toLowerCase(),
          )
        : undefined
      const stages: StormAuraStage[] = []
      for (const [name, level] of [
        ['Storm Aura', 3],
        ['Storm Soul', 6],
        ['Shielding Storm', 10],
        ['Raging Storm', 14],
      ] as const) {
        const refs = declarations.filter((row) => row.target === stormTarget(name, level))
        const earned = refs.length ? Math.min(...refs.map((row) => row.level)) : level
        if (!owner || owner.levels < earned) continue
        const parent = root(name, level)
        const target = environment ? stormTarget(environment, level === 10 ? 6 : level) : undefined
        const child =
          target && level !== 10 ? resolveStormFeature(target, candidates(target)) : undefined
        let available =
          !recovery &&
          !!environment &&
          !!parent &&
          (level === 10 || (!!child && stormOptionGroup(parent, name, level)))
        if (level !== 3)
          available &&= stages.some((row) => row.name === 'Storm Aura' && row.available)
        if (level === 10)
          available &&= stages.some((row) => row.name === 'Storm Soul' && row.available)
        stages.push({
          name,
          level: earned,
          available,
          parent,
          child,
          target,
          entries: available
            ? [
                ...stormContextEntries(parent!),
                ...(child?.entries ?? []),
                ...(level === 10 && environment
                  ? [`Selected resistance: ${DAMAGE[environment]}.`]
                  : []),
              ]
            : [
                `${name} rules unavailable. Restore the exact earned source rules to verify this benefit.`,
              ],
        })
      }
      const entries = stages.map((stage) => ({
        type: 'entries',
        name: `${stage.name}${stage.available && environment ? ` — ${environment}` : ' — rules unavailable'}`,
        entries: stage.entries,
      }))
      const details = selection.selected.map((row) => ({
        name: row.name,
        entries,
        available: stages.some((stage) => stage.name === 'Storm Aura' && stage.available),
      }))
      return {
        selection,
        owner: currentOwner ? owner : undefined,
        classData,
        subclass,
        choice,
        options,
        recovery,
        details,
        storm: {
          environment,
          stages,
          fixedBenefits:
            environment && stages.some((stage) => stage.name === 'Storm Soul' && stage.available)
              ? {
                  damageType: DAMAGE[environment],
                  ...(environment === 'Sea' ? { swimSpeed: 30 } : {}),
                }
              : undefined,
        },
      }
    })
}

/** Fixed earned benefits are derived; nothing is persisted into manual state. */
export function deriveStormAuraEffects(
  states: readonly FeatureOptionSelectionState[],
): CharacterEffect[] {
  return states.flatMap((state) => {
    const soul = state.storm?.stages.find((row) => row.name === 'Storm Soul' && row.available)
    const environment = state.storm?.environment
    const benefits = state.storm?.fixedBenefits
    if (!soul?.target || !environment || !benefits) return []
    const source = {
      kind: 'subclass' as const,
      name: `Storm Soul — ${environment}`,
      source: 'XGE',
      entityId: soul.target,
      provenance: { choiceId: state.selection.choiceId },
    }
    const id = `${state.selection.choiceId}:${encodeURIComponent(soul.target)}:storm-soul`
    const effects: CharacterEffect[] = [
      {
        id: `${id}:resistance`,
        label: source.name,
        source,
        target: { kind: 'damage-resistance', damageType: benefits.damageType },
        operation: { kind: 'grant' },
      },
    ]
    if (benefits.swimSpeed !== undefined)
      effects.push({
        id: `${id}:swim`,
        label: source.name,
        source,
        target: { kind: 'speed', mode: 'swim' },
        operation: { kind: 'base', value: benefits.swimSpeed },
      })
    return effects
  })
}
