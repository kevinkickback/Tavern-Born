import type { CharacterClassChoiceSelection } from '@/types/character'
import { getLandChoiceRule, isValidLandSelection } from './circleOfTheLand'
import {
  getWarlockPatronConfigurationRule,
  isValidWarlockPatronConfiguration,
} from './warlockPatronConfigurations'

export const getSubclassSpellConfigurationRule = (id: string) =>
  getLandChoiceRule(id) ?? getWarlockPatronConfigurationRule(id)

export const isValidSubclassSpellConfigurationSelection = (row: CharacterClassChoiceSelection) =>
  getLandChoiceRule(row.choiceId)
    ? isValidLandSelection(row)
    : isValidWarlockPatronConfiguration(row)
