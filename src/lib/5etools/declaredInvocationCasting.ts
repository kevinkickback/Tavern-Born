import { toAbilityName } from '@/lib/calculations/abilityNames'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { OptionalFeatureLike } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

const qualified = '[^|#{}]+\\|[^|#{}]+'
const learning = new RegExp(
  `^You learn the \\{@spell (${qualified})\\} spell and can cast it as a \\{@action Magic\\|XPHB\\} action without expending a spell slot\\. When you cast the spell, you summon (?:a|an) \\{@creature ${qualified}\\} familiar\\.$`,
)
const daily = new RegExp(
  `^You can cast \\{@spell (${qualified})\\} without expending a spell slot\\. When you do, you summon (.+), and that [A-Z][a-z]+ becomes the target of the spell\\. Once you cast the spell in this way, you can't do so again until you finish a \\{@variantrule Long Rest\\|XPHB\\}\\.$`,
)
const creatureList = new RegExp(
  `^(?:a|an) \\{@creature ${qualified}\\}(?:(?:, (?:or )?| or )(?:a|an) \\{@creature ${qualified}\\})*$`,
)

/** The schedule supplies a qualified spell and ability. The exact prose supplies the cast terms. */
export function readDeclaredInvocationCast(feature: OptionalFeatureLike | undefined) {
  if (
    !feature ||
    feature.featureType?.length !== 1 ||
    feature.featureType[0] !== 'EI' ||
    !Array.isArray(feature.additionalSpells) ||
    feature.additionalSpells.length !== 1 ||
    !Array.isArray(feature.entries) ||
    typeof feature.entries[0] !== 'string'
  )
    return undefined
  const [clause] = feature.entries
  const learned = learning.exec(clause)
  const limited = learned ? undefined : daily.exec(clause)
  const match = learned ?? limited
  if (!match || (limited && (feature.entries.length !== 1 || !creatureList.test(limited[2]))))
    return undefined
  if (
    learned &&
    feature.entries.length !== 1 &&
    (feature.entries.length !== 2 ||
      feature.entries[1] !==
        'Additionally, when you take the {@action Attack|XPHB} action, you can forgo one of your own attacks to allow your familiar to make one attack with its {@variantrule Reaction|XPHB}.')
  )
    return undefined

  const raw = record(feature.additionalSpells[0])
  const ability = typeof raw.ability === 'string' && toAbilityName(raw.ability)
  const innate = record(raw.innate)
  if (!ability || Object.keys(raw).length !== 2 || Object.keys(innate).length !== 1)
    return undefined
  const schedule = innate._
  const rest = record(record(schedule).daily)
  const tokens = learned ? schedule : rest['1']
  if (
    !Array.isArray(tokens) ||
    tokens.length !== 1 ||
    typeof tokens[0] !== 'string' ||
    !new RegExp(`^${qualified}$`).test(tokens[0]) ||
    (limited && (Object.keys(record(schedule)).length !== 1 || Object.keys(rest).length !== 1))
  )
    return undefined
  const reference = match[1]
  if (getSpellReferenceKey(reference) !== getSpellReferenceKey(tokens[0])) return undefined
  try {
    const [block] = parseAdditionalSpellBlocks(feature.additionalSpells as AdditionalSpellBlock[])
    const [grant] = block.grants
    if (
      block.grants.length !== 1 ||
      grant.isCantrip ||
      grant.source !== 'innate' ||
      grant.dailyUses !== (limited ? 1 : undefined)
    )
      return undefined
    return { reference, ability, learned: !!learned, rules: clause }
  } catch {
    return undefined
  }
}
