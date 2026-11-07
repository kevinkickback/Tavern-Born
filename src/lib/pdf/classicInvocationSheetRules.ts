import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceFeatureId } from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from '@/lib/character/effectiveClassChoiceFeatures'
import { hasEarnedRevisedInvocationSlots } from '@/lib/character/warlockInvocationChoices'
import {
  CLASSIC_INVOCATION_POOL,
  getClassicPassiveInvocationName,
  getCurrentClassicInvocationLeaf,
  getCurrentClassicInvocationOwner,
} from '@/lib/character/warlockInvocationSource'
import { renderEntriesToText } from '@/lib/entryText'
import type { Character } from '@/types/character'

const classicRules = {
  'agonizing blast': '72a7d76717ea08475e5dadb2691b02779e51810ffc29ad20d5833b99f85775d3',
  "devil's sight": 'c46dac588951a21ec925bc1ae2de39a288775eafda676898db6b7a785dd4b02d',
  'eldritch spear': '4c4093a13fff0ad044e9619fb7f922ff037a78c85a03ebb7835936ce78295d59',
  'repelling blast': '28d84df5675ba61010459eb3fed3d9efa4dc90f07e8144b7e47c0a1b35e835a6',
}
const blastPrerequisite = '634b319d100b8f290ef7e343bc80769783c83442eafd2e5a89208195a91492e4'

export function getClassicInvocationDescriptions(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  prerequisites: ClassChoicePrerequisiteContext,
) {
  const selections = character.classChoiceSelections?.filter(
    (row) => row.choiceId === CLASSIC_INVOCATION_POOL,
  )
  if (!selections?.length) return undefined
  const descriptions = new Map<string, string>()
  for (const selection of selections) {
    for (const option of selection.selected) {
      // A saved managed description cannot stand in for unavailable current rules.
      if (getClassicPassiveInvocationName(selection, option))
        descriptions.set(getClassChoiceFeatureId(selection, option), '')
    }
  }
  if (!descriptions.size) return undefined
  if (!catalogs || selections.length !== 1) return descriptions

  const [selection] = selections
  const routes = getEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  const active = routes.selectedOptions.filter((row) => row.selection === selection)
  const choice = active[0]?.choice
  if (!choice) return descriptions
  const owner = getCurrentClassicInvocationOwner(character, choice, catalogs)
  if (!owner || !hasEarnedRevisedInvocationSlots(choice, selection.selected, owner.levels))
    return descriptions

  for (const { option } of active) {
    const name = getClassicPassiveInvocationName(selection, option)
    if (!name) continue
    const id = getClassChoiceFeatureId(selection, option)
    if (!routes.contributions.some((row) => row.choiceId === choice.id && row.id === id)) continue
    const current = getCurrentClassicInvocationLeaf(catalogs, option)
    if (!current) continue
    const { prerequisite } = current.leaf
    const validPrerequisite =
      name === "devil's sight"
        ? prerequisite === undefined
        : Array.isArray(prerequisite) &&
          getFeatureSourceDigest(prerequisite, false) === blastPrerequisite
    if (validPrerequisite && getFeatureSourceDigest(current.entries, false) === classicRules[name])
      descriptions.set(id, renderEntriesToText(current.entries))
  }
  return descriptions
}
