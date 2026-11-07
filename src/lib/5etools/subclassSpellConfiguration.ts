import type { CharacterClassChoiceSelection } from '@/types/character'
import { getLandChoiceRule, isValidLandSelection } from './circleOfTheLand'
import {
  getDivineSoulConfigurationRule,
  isValidDivineSoulSelection,
} from './divineSoulConfiguration'
import {
  getWarlockPatronConfigurationRule,
  isValidWarlockPatronConfiguration,
} from './warlockPatronConfigurations'

export const getSubclassSpellConfigurationRule = (id: string) =>
  getLandChoiceRule(id) ??
  getWarlockPatronConfigurationRule(id) ??
  getDivineSoulConfigurationRule(id)

export const isValidSubclassSpellConfigurationSelection = (row: CharacterClassChoiceSelection) =>
  getLandChoiceRule(row.choiceId)
    ? isValidLandSelection(row)
    : isValidWarlockPatronConfiguration(row) || isValidDivineSoulSelection(row)
