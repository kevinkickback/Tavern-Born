import type { CharacterClassChoiceSelection } from '@/types/character'
import { getArmorModelRule, isValidArmorModelSelection } from './artificerArmorModels'
import { getLandChoiceRule, isValidLandSelection } from './circleOfTheLand'
import {
  getDivineSoulConfigurationRule,
  isValidDivineSoulSelection,
} from './divineSoulConfiguration'
import { getScionConfigurationRule, isValidScionSelection } from './rogueScion'
import {
  getWarlockPatronConfigurationRule,
  isValidWarlockPatronConfiguration,
} from './warlockPatronConfigurations'

export const getSubclassFeatureConfigurationRule = (id: string) =>
  getLandChoiceRule(id) ??
  getWarlockPatronConfigurationRule(id) ??
  getDivineSoulConfigurationRule(id) ??
  getScionConfigurationRule(id) ??
  getArmorModelRule(id)

export const isValidSubclassFeatureConfigurationSelection = (row: CharacterClassChoiceSelection) =>
  getLandChoiceRule(row.choiceId)
    ? isValidLandSelection(row)
    : isValidWarlockPatronConfiguration(row) ||
      isValidDivineSoulSelection(row) ||
      isValidScionSelection(row) ||
      isValidArmorModelSelection(row)
