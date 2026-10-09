import { z } from 'zod'
import {
  ABILITY_SCORE_ABSOLUTE_MAX,
  ABILITY_SCORE_MIN,
  MAX_CHARACTER_LEVEL,
} from '@/lib/calculations/gameRules'
import {
  getSpellNameKey,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { getInvalidRaceAbilityChoicePaths } from '@/lib/provenance/raceAbilityChoiceIdentity'
import {
  getUnselectedRaceOwnerPaths,
  hasRaceAbilityOriginGrants,
  isRacialSpellChoiceOwner,
  isSelectedRaceOwner,
} from '@/lib/provenance/raceOwnership'
import { resolveRaceAsiChoicesInLedger } from '@/lib/provenance/resolveRaceAsiChoices'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import type { Character } from './character'

export const MAX_CHARACTER_NAME_LENGTH = 100

const sourceSchema = z
  .string()
  .min(1)
  .transform((s) => s.toUpperCase())

/** Any legal ability score, including magical boosted maximums. */
const abilityScoreSchema = z.number().int().min(ABILITY_SCORE_MIN).max(ABILITY_SCORE_ABSOLUTE_MAX)

const originSystemSchema = z.enum(['2014', '2024'])

const abilityScoresSchema = z.object({
  strength: abilityScoreSchema,
  dexterity: abilityScoreSchema,
  constitution: abilityScoreSchema,
  intelligence: abilityScoreSchema,
  wisdom: abilityScoreSchema,
  charisma: abilityScoreSchema,
})

const variantRulesSchema = z
  .object({
    optionalClassFeatures: z.boolean().default(false),
    averageHitPoints: z.boolean().default(true),
    abilityScoreMethod: z.enum(['point-buy', 'standard-array', 'custom']).optional(),
    anyRaceSubclasses: z.boolean().default(false),
    preferNewerPrintings: z.boolean().optional(),
    ignoreEquipRestrictions: z.boolean().default(false),
  })
  .strict()

const characterClassEntrySchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  levels: z.number().int().min(1).max(MAX_CHARACTER_LEVEL),
  subclass: z.string().optional(),
  subclassSource: z.string().optional(),
})

const hitPointGainSchema = z
  .object({
    className: z.string().min(1),
    classSource: z.string().min(1),
    classLevel: z.number().int().min(1).max(MAX_CHARACTER_LEVEL),
    characterLevel: z.number().int().min(2).max(MAX_CHARACTER_LEVEL),
    hitDie: z.number().int().positive(),
    dieResult: z.number().int().positive(),
    method: z.enum(['average', 'rolled', 'manual']),
  })
  .refine((gain) => gain.dieResult <= gain.hitDie, {
    message: 'Hit-point die result cannot exceed the hit die.',
    path: ['dieResult'],
  })

const hitPointAdjustmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().int(),
  mode: z.enum(['flat', 'per-level']),
  sourceType: z.enum(['manual', 'item', 'feat', 'other']),
  sourceRef: z.string().optional(),
  createdAt: z.string(),
})

const armorClassAdjustmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().int(),
  sourceType: z.enum(['manual', 'item', 'feat', 'other']),
  sourceRef: z.string().optional(),
  createdAt: z.string(),
})

const movementModeSchema = z.enum(['walk', 'climb', 'swim', 'fly', 'burrow'])

const characterMovementSchema = z.object({
  speeds: z.record(movementModeSchema, z.number().int().nonnegative()),
  hover: z.boolean().optional(),
  other: z.record(z.union([z.number().int().nonnegative(), z.boolean()])).optional(),
  unresolvedInheritedModes: z.array(movementModeSchema).optional(),
  source: z.object({
    kind: z.enum(['race', 'manual']),
    name: z.string().min(1),
    source: z.string().optional(),
  }),
})

const movementAdjustmentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  mode: z.string().min(1),
  amount: z.number().int(),
  sourceType: z.enum(['manual', 'item', 'feat', 'other']),
  sourceRef: z.string().optional(),
  createdAt: z.string(),
})

const numericEffectTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ability-score'),
    ability: z.enum([
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ]),
  }),
  z.object({
    kind: z.literal('ability-check-modifier'),
    ability: z.enum([
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ]),
  }),
  z.object({ kind: z.literal('skill-modifier'), skill: z.string().min(1) }),
  z.object({
    kind: z.literal('saving-throw-modifier'),
    ability: z.enum([
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ]),
  }),
  z.object({ kind: z.literal('initiative') }),
  z.object({ kind: z.literal('armor-class') }),
  z.object({ kind: z.literal('hit-point-maximum') }),
  z.object({ kind: z.literal('speed'), mode: z.string().min(1).optional() }),
  z.object({ kind: z.literal('carrying-capacity') }),
  z.object({ kind: z.literal('attack-roll'), attackId: z.string().min(1).optional() }),
  z.object({
    kind: z.literal('damage'),
    attackId: z.string().min(1).optional(),
    damageType: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('spell-attack'), profileId: z.string().min(1).optional() }),
  z.object({ kind: z.literal('spell-save-dc'), profileId: z.string().min(1).optional() }),
  z.object({ kind: z.literal('sense'), sense: z.string().min(1) }),
  z.object({ kind: z.literal('resource-maximum'), resourceId: z.string().min(1) }),
])

const traitEffectTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('damage-resistance'), damageType: z.string().min(1) }),
  z.object({ kind: z.literal('damage-immunity'), damageType: z.string().min(1) }),
  z.object({ kind: z.literal('condition-immunity'), condition: z.string().min(1) }),
])

const numericEffectOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('base'), value: z.number().finite() }),
  z.object({ kind: z.literal('set'), value: z.number().finite() }),
  z.object({ kind: z.literal('add'), value: z.number().finite() }),
  z.object({ kind: z.literal('multiply'), value: z.number().finite() }),
  z.object({ kind: z.literal('minimum'), value: z.number().finite() }),
  z.object({ kind: z.literal('maximum'), value: z.number().finite() }),
  z.object({ kind: z.literal('override'), value: z.number().finite() }),
])

const conditionalNoteOperationSchema = z.object({
  kind: z.literal('conditional-note'),
  note: z.string().min(1),
})

const characterEffectSourceSchema = z.object({
  kind: z.enum([
    'race',
    'subrace',
    'class',
    'subclass',
    'background',
    'feat',
    'spell',
    'item',
    'condition',
    'manual',
    'other',
  ]),
  name: z.string().min(1),
  source: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  provenance: z
    .object({
      choiceId: z.string().min(1).optional(),
      grantVariant: z.string().min(1).optional(),
    })
    .optional(),
})

const characterEffectRequirementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('equipment'),
    itemId: z.string().min(1),
    state: z.enum(['equipped', 'attuned', 'equipped-and-attuned']),
  }),
  z.object({ kind: z.literal('flag'), key: z.string().min(1), expected: z.boolean() }),
])

const characterEffectBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: characterEffectSourceSchema,
  priority: z.number().int().optional(),
  requirements: z.array(characterEffectRequirementSchema).optional(),
  condition: z.string().min(1).optional(),
})

const characterEffectSchema = z.union([
  characterEffectBaseSchema.extend({
    target: numericEffectTargetSchema,
    operation: z.union([numericEffectOperationSchema, conditionalNoteOperationSchema]),
  }),
  characterEffectBaseSchema.extend({
    target: traitEffectTargetSchema,
    operation: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('grant') }),
      conditionalNoteOperationSchema,
    ]),
  }),
])

const manualActionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['action', 'bonus-action', 'reaction', 'passive', 'special', 'attack']),
  description: z.string(),
  source: z.object({
    kind: z.literal('manual'),
    name: z.string().min(1),
    source: z.string().optional(),
    entityId: z.string().optional(),
  }),
  active: z.boolean(),
  inactiveReason: z.string().optional(),
  ability: z
    .enum(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'])
    .optional(),
  proficient: z.boolean().optional(),
  attackBonus: z.number().int().optional(),
  save: z
    .object({
      ability: z
        .enum(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'])
        .optional(),
      dc: z.number().int().nonnegative(),
    })
    .optional(),
  range: z.string().optional(),
  damage: z
    .array(
      z.object({
        dice: z.string().min(1).optional(),
        bonus: z.number().int(),
        damageType: z.string().min(1).optional(),
      }),
    )
    .optional(),
  properties: z.array(z.string()).optional(),
  mastery: z.array(z.object({ name: z.string().min(1), source: z.string().optional() })).optional(),
  resourceCost: z
    .object({ resourceId: z.string().min(1), amount: z.number().int().positive() })
    .optional(),
  recharge: z
    .object({
      rest: z.enum(['short', 'long']).optional(),
      note: z.string().min(1).optional(),
    })
    .optional(),
})

const characterClassChoiceSelectionSchema = z.object({
  choiceId: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum([
    'class-feature',
    'subclass-feature',
    'feat',
    'item',
    'optional-feature',
    'creature',
  ]),
  inactive: z.boolean().optional(),
  className: z.string().min(1),
  classSource: z.string().min(1),
  subclassName: z.string().min(1).optional(),
  subclassSource: z.string().min(1).optional(),
  classLevel: z.number().int().min(1).max(MAX_CHARACTER_LEVEL),
  selected: z.array(
    z.object({
      entityType: z.enum([
        'classFeature',
        'subclassFeature',
        'feat',
        'item',
        'optionalFeature',
        'creature',
      ]),
      name: z.string().min(1),
      source: z.string().optional(),
      slotLevel: z.number().int().min(1).max(MAX_CHARACTER_LEVEL),
    }),
  ),
})

const featureSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.string().min(1),
  description: z.string(),
  level: z.number().int().optional(),
})

const featOptionSelectionsSchema = z.object({
  spellcastingClass: z.string().optional(),
  spells: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  abilityScore: z.string().optional(),
  optionalFeature: z.string().optional(),
  expertiseSkill: z.string().optional(),
})

const featSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.string().min(1),
  description: z.string(),
  prerequisites: z.string().optional(),
  options: featOptionSelectionsSchema.optional(),
  className: z.string().optional(),
  classSource: z.string().optional(),
  classLevel: z.number().int().min(1).optional(),
})

const classFeatChoiceSchema = z.object({
  id: z.string().min(1),
  className: z.string().min(1),
  classSource: z.string().min(1),
  subclassName: z.string().min(1).optional(),
  subclassSource: z.string().min(1).optional(),
  progressionName: z.string().min(1),
  categories: z.array(z.string()),
  feats: z.array(featSchema),
})

const equipmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  quantity: z.number().int().min(0),
  equipped: z.boolean(),
  attuned: z.boolean().optional(),
  description: z.string().optional(),
  weight: z.number().optional(),
  value: z.number().optional(),
  rarity: z.string().optional(),
  source: z.string().optional(),
  reqAttune: z.boolean().optional(),
  ac: z.number().optional(),
  armorType: z.enum(['light', 'medium', 'heavy', 'shield']).optional(),
  weaponCategory: z.string().optional(),
  dmg1: z.string().optional(),
  dmg2: z.string().optional(),
  dmgType: z.string().optional(),
  properties: z
    .array(z.union([z.string(), z.object({ uid: z.string().min(1), note: z.string().optional() })]))
    .optional(),
  range: z.string().optional(),
  wondrous: z.boolean().optional(),
  tattoo: z.boolean().optional(),
  focus: z.array(z.string()).optional(),
})

const currencySchema = z.object({
  cp: z.number().int().nonnegative(),
  sp: z.number().int().nonnegative(),
  ep: z.number().int().nonnegative(),
  gp: z.number().int().nonnegative(),
  pp: z.number().int().nonnegative(),
})

const hitPointsSchema = z.object({
  current: z.number().int().min(0),
  temporary: z.number().int().min(0),
})

const portraitTransformSchema = z.object({
  zoom: z.number(),
  panX: z.number(),
  panY: z.number(),
  rotation: z.number(),
})

const allySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  relationship: z.string(),
  description: z.string(),
})

const characterDetailsSchema = z.object({
  playerName: z.string().max(100).optional(),
  gender: z.string().optional(),
  alignment: z.string().optional(),
  faith: z.string().optional(),
  lifestyle: z.string().optional(),
  personalityTraits: z.string().optional(),
  personality: z.string().optional(),
  ideals: z.string().optional(),
  bonds: z.string().optional(),
  flaws: z.string().optional(),
  goals: z.string().optional(),
  fears: z.string().optional(),
  age: z.number().int().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  eyes: z.string().optional(),
  skin: z.string().optional(),
  hair: z.string().optional(),
  distinguishingMarks: z.string().optional(),
  physicalDescription: z.string().optional(),
  appearance: z.string().optional(),
  clothingStyle: z.string().optional(),
  mannerisms: z.string().optional(),
  faction: z.string().optional(),
  rank: z.string().optional(),
  factionNotes: z.string().optional(),
  patron: z.string().optional(),
  patronDetails: z.string().optional(),
  nemesis: z.string().optional(),
  allies: z.array(allySchema).optional(),
  origin: z.string().optional(),
  family: z.string().optional(),
  definingMoment: z.string().optional(),
  lifeEvents: z.string().optional(),
  backstory: z.string().optional(),
  organizationSelectionKey: z.string().optional(),
  organizationCustomName: z.string().optional(),
  organizationCustomDescription: z.string().optional(),
  organizationCustomImage: z.string().optional(),
  organizationCustomGradient: z.string().optional(),
})

const proficienciesSchema = z.object({
  armor: z.array(z.string()),
  weapons: z.array(z.string()),
  tools: z.array(z.string()),
  skills: z.array(z.string()),
  expertise: z.array(z.string()),
  languages: z.array(z.string()),
  savingThrows: z.array(z.string()),
})

const sourceTypeSchema = z.enum([
  'race',
  'subrace',
  'class',
  'subclass',
  'background',
  'feat',
  'optionalFeature',
  'manual',
  'ASI',
])

const grantTypeSchema = z.enum(['fixed', 'choice', 'placeholder'])

const choiceStatusSchema = z.enum(['pending', 'resolved', 'partially-resolved'])

const choiceDomainSchema = z.enum([
  'skills',
  'languages',
  'tools',
  'armor',
  'weapons',
  'spells',
  'features',
  'feats',
  'abilityBonuses',
  'equipment',
])

const sourceTagSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceName: z.string(),
  sourceRef: z.string().optional(),
  grantVariant: z.string().optional(),
  grantType: grantTypeSchema,
  label: z.string(),
  grantSource: z.string().optional(),
})

const featSourceTagSchema = sourceTagSchema.superRefine((tag, context) => {
  if (tag.grantType === 'fixed' && tag.grantSource === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['grantSource'],
      message: 'Fixed feat grants require a separate target source.',
    })
  }
})

const spellSourceTagSchema = sourceTagSchema
  .extend({
    spellGrantedAtLevel: z.number().int().min(1).optional(),
    spellAttributionMode: z.enum(['exact', 'inferred-lowest-eligible']).optional(),
  })
  .superRefine((tag, context) => {
    if (tag.sourceType !== 'race' && tag.sourceType !== 'subrace') return
    if (!tag.grantSource?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grantSource'],
        message: 'Racial spell grants require a separate target source.',
      })
    }
    if (tag.grantType === 'choice' && !tag.grantVariant?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grantVariant'],
        message: 'Racial spell choices require their descriptor identity.',
      })
    }
  })

const abilityBonusProvenanceRecordSchema = z.object({
  ability: z.string(),
  value: z.number().int(),
  sourceTag: sourceTagSchema,
})

const choiceRecordSchema = z.object({
  id: z.string(),
  domain: choiceDomainSchema,
  sourceTag: sourceTagSchema,
  chooseCount: z.number().int().min(1),
  amount: z.number().int().optional(),
  optionPool: z.array(z.string()),
  selected: z.array(z.string()),
  selectedRefs: z
    .array(
      z.object({
        name: z.string().min(1),
        source: z.string().optional(),
        options: featOptionSelectionsSchema.optional(),
      }),
    )
    .optional(),
  status: choiceStatusSchema,
})

const sourceTagListMapSchema = z.record(z.array(sourceTagSchema))
const spellSourceTagListMapSchema = z.record(z.array(spellSourceTagSchema))

const proficiencyProvenanceSchema = z.object({
  armor: sourceTagListMapSchema,
  weapons: sourceTagListMapSchema,
  tools: sourceTagListMapSchema,
  languages: sourceTagListMapSchema,
  skills: sourceTagListMapSchema,
  expertise: sourceTagListMapSchema.optional(),
  savingThrows: sourceTagListMapSchema,
})

const provenanceLedgerSchema = z.object({
  proficiencies: proficiencyProvenanceSchema,
  abilityBonuses: z.array(abilityBonusProvenanceRecordSchema),
  features: sourceTagListMapSchema,
  feats: z.record(z.array(featSourceTagSchema)),
  spells: spellSourceTagListMapSchema,
  equipment: sourceTagListMapSchema,
  choices: z.array(choiceRecordSchema),
})

const abilityScoreMethodSchema = z
  .enum(['point-buy', 'standard-array', 'custom', 'manual'])
  .transform((method) => (method === 'manual' ? 'custom' : method))

export const wizardStep1Schema = z.object({
  name: z
    .string()
    .min(1, 'Character name is required')
    .max(100, 'Name must be 100 characters or fewer'),
})

export const wizardStep2Schema = z.object({
  originSystem: originSystemSchema,
  abilityScoreMethod: abilityScoreMethodSchema.refine((v) => !!v, {
    message: 'Please select an ability score generation method',
  }),
  allowedSources: z.array(sourceSchema),
})

export const wizardStep3Schema = z.object({
  race: z.string().min(1, 'Please select a race'),
})

export const wizardStep4Schema = z.object({
  class: z.string().min(1, 'Please select a class'),
})

export const wizardStep5Schema = z.object({
  background: z.string().min(1, 'Please select a background'),
})

export const wizardStep6Schema = z.object({
  abilityScores: abilityScoresSchema.optional(),
})

const spellSlotLevelSchema = z
  .object({
    max: z.number().int().min(0),
    used: z.number().int().min(0),
  })
  .refine((sl) => sl.used <= sl.max, {
    message: 'Spell slots used cannot exceed max',
    path: ['used'],
  })

const spellSlotLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

const spellSlotsSchema = z
  .record(z.coerce.number().int(), spellSlotLevelSchema)
  .transform((slots) => {
    const normalized: Record<number, z.infer<typeof spellSlotLevelSchema>> = {}
    for (const level of spellSlotLevels) {
      normalized[level] = slots[level] ?? { max: 0, used: 0 }
    }
    return normalized
  })

const raceSpellChoiceSchema = z.object({
  id: z.string().min(1),
  count: z.number().int().min(1),
  isCantrip: z.boolean(),
  filter: z
    .object({
      level: z.number().int().min(0),
      classes: z.array(z.string().min(1)).min(1),
    })
    .optional(),
  pool: z.array(z.string()).optional(),
  selected: z.array(z.string()).default([]),
})

const spellProfileSchema = z
  .object({
    id: z.string().min(1, 'Spell profile ID is required'),
    type: z.enum(['class', 'special', 'racial']),
    label: z.string().min(1, 'Spell profile label is required'),
    className: z.string().optional(),
    classSource: z.string().optional(),
    raceName: z.string().optional(),
    raceSource: z.string().optional(),
    castingAbility: z.string().optional(),
    castingAbilityOptions: z.array(z.string()).optional(),
    choices: z.array(raceSpellChoiceSchema).optional(),
    fixedSpells: z.array(z.string()).optional(),
    alwaysPreparedSpells: z.array(z.string()).optional(),
    cantrips: z.array(z.string()).default([]),
    spellsKnown: z.array(z.string()).default([]),
    preparedSpells: z.array(z.string()).default([]),
    alwaysPrepared: z.boolean().optional(),
    spellSwaps: z
      .record(z.coerce.number(), z.object({ removed: z.string(), added: z.string() }))
      .optional(),
  })
  .refine(
    (profile) => {
      if (profile.type === 'class' && !profile.className) {
        return false
      }
      return true
    },
    {
      message: 'Class-type spell profiles must have className',
      path: ['className'],
    },
  )
  .superRefine((profile, context) => {
    if (profile.type !== 'racial') return
    const requireTarget = (reference: string, path: (string | number)[]) => {
      const parsed = parseSpellReference(reference)
      if (!parsed.name || !parsed.source) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: 'Racial spells require a complete target name and source.',
        })
      }
    }
    for (const field of [
      'cantrips',
      'spellsKnown',
      'preparedSpells',
      'fixedSpells',
      'alwaysPreparedSpells',
    ] as const) {
      profile[field]?.forEach((reference, index) => {
        requireTarget(reference, [field, index])
      })
    }
    profile.choices?.forEach((choice, index) => {
      choice.selected.forEach((reference, selectedIndex) => {
        requireTarget(reference, ['choices', index, 'selected', selectedIndex])
      })
      choice.pool?.forEach((reference, poolIndex) => {
        requireTarget(reference, ['choices', index, 'pool', poolIndex])
      })
    })
    const fixedTargets = (profile.fixedSpells ?? []).map((reference) =>
      getSpellReferenceKey(reference),
    )
    for (const [field, isCantrip] of [
      ['cantrips', true],
      ['spellsKnown', false],
    ] as const) {
      const accountedTargets = new Set([
        ...fixedTargets,
        ...(profile.choices ?? [])
          .filter((choice) => choice.isCantrip === isCantrip)
          .flatMap((choice) => choice.selected.map((reference) => getSpellReferenceKey(reference))),
      ])
      profile[field].forEach((reference, index) => {
        if (!accountedTargets.has(getSpellReferenceKey(reference))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field, index],
            message:
              'Materialized racial spells must belong to a fixed grant or a selected choice of the same spell kind.',
          })
        }
      })
    }
  })

const spellSelectionSchema = z
  .object({
    spellProfiles: z.array(spellProfileSchema).min(1, 'At least one spell profile must exist'),
    spellSlots: spellSlotsSchema,
    pactSpellSlots: spellSlotsSchema.default({}),
  })
  .refine(
    (selection) => {
      const hasUnrestricted = selection.spellProfiles.some((p) => p.id === 'special:unrestricted')
      return hasUnrestricted
    },
    {
      message: 'Spell selection must include special:unrestricted profile',
      path: ['spellProfiles'],
    },
  )
  .refine(
    (selection) => {
      const unrestricted = selection.spellProfiles.find((p) => p.id === 'special:unrestricted')
      return unrestricted?.alwaysPrepared === true
    },
    {
      message: 'special:unrestricted spell profile must have alwaysPrepared set to true',
      path: ['spellProfiles'],
    },
  )

/** Full character schema for file import / data integrity checks. */
const asiChoiceSchema = z.object({
  id: z.string(),
  level: z.number().int(),
  className: z.string(),
  classSource: z.string().min(1),
  abilityChanges: z.record(z.union([z.literal(1), z.literal(2)])),
})

export const characterSchema = z
  .object({
    id: z.string().min(1),
    schemaVersion: z.literal(CURRENT_CHARACTER_SCHEMA_VERSION),
    name: z
      .string()
      .min(1)
      .max(MAX_CHARACTER_NAME_LENGTH)
      .refine((s) => s.trim().length > 0, {
        message: 'Character name cannot be only whitespace',
      }),
    originSystem: originSystemSchema,
    race: z.string(),
    raceSource: z.string().optional(),
    subrace: z.string().optional(),
    subraceSource: z.string().optional(),
    background: z.string(),
    backgroundSource: z.string().optional(),
    currency: currencySchema.default({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }).optional(),
    experiencePoints: z.number().int().min(0).default(0),
    classProgression: z.array(characterClassEntrySchema),
    abilityScores: abilityScoresSchema,
    proficiencies: proficienciesSchema,
    features: z.array(featureSchema),
    feats: z.array(featSchema),
    allowedSources: z.array(sourceSchema).default([]),
    variantRules: variantRulesSchema.optional(),
    raceAsiChoices: z.array(z.array(z.string())).optional(),
    raceAsiBlockIndex: z.union([z.literal(0), z.literal(1)]).optional(),
    backgroundAsiBlockIndex: z.number().int().nonnegative().optional(),
    backgroundEquipmentChoices: z.array(z.string()).optional(),
    backgroundEquipmentItemChoices: z.record(z.string()).optional(),
    backgroundAsiChoices: z.array(z.string()).optional(),
    backgroundCurrencyGrant: currencySchema.optional(),
    classEquipmentChoices: z.record(z.array(z.string())).optional(),
    classEquipmentItemChoices: z.record(z.record(z.string())).optional(),
    spells: spellSelectionSchema,
    equipment: z.array(equipmentSchema),
    visions: z
      .array(
        z.object({
          type: z.string().min(1),
          range: z.number().int().positive().optional(),
        }),
      )
      .optional(),
    hitPoints: hitPointsSchema,
    hitPointsInitialized: z.boolean().optional(),
    hitPointGains: z.array(hitPointGainSchema).optional(),
    hitPointAdjustments: z.array(hitPointAdjustmentSchema).optional(),
    maxHitPointsOverride: z.number().int().min(1).optional(),
    armorClassOverride: z.number().int().min(0).optional(),
    armorClassAdjustments: z.array(armorClassAdjustmentSchema).optional(),
    movement: characterMovementSchema,
    movementAdjustments: z.array(movementAdjustmentSchema).optional(),
    movementOverrides: z.record(z.number().int().nonnegative()).optional(),
    movementHoverOverride: z.boolean().optional(),
    damageResistances: z.array(z.string()).optional(),
    damageImmunities: z.array(z.string()).optional(),
    conditionImmunities: z.array(z.string()).optional(),
    details: characterDetailsSchema,
    portrait: z.string().optional(),
    portraitTransform: portraitTransformSchema.optional(),
    asiChoices: z.array(asiChoiceSchema).optional(),
    specialFeats: z.array(featSchema).optional(),
    classFeatChoices: z.array(classFeatChoiceSchema).optional(),
    classChoiceSelections: z.array(characterClassChoiceSelectionSchema).optional(),
    fixedFeatOptions: z.record(featOptionSelectionsSchema).optional(),
    provenance: provenanceLedgerSchema,
    inspiration: z.boolean().optional(),
    deathSaves: z
      .object({
        successes: z.number().int().min(0).max(3),
        failures: z.number().int().min(0).max(3),
      })
      .optional(),
    conditions: z.array(z.string()).optional(),
    exhaustion: z.number().int().min(0).optional(),
    hitDiceUsed: z.record(z.number().int().min(0)).optional(),
    ritualCasting: z.boolean().optional(),
    classResources: z.record(z.number().int().min(0)).optional(),
    manualEffects: z.array(characterEffectSchema).optional(),
    suppressedEffectIds: z.array(z.string().min(1)).optional(),
    effectFlags: z.record(z.boolean()).optional(),
    manualActions: z.array(manualActionSchema).optional(),
    createdAt: z.string(),
    lastModified: z.string(),
  })
  .strict()
  .superRefine((char, ctx) => {
    for (const [nameKey, sourceKey] of [
      ['race', 'raceSource'],
      ['subrace', 'subraceSource'],
      ['background', 'backgroundSource'],
    ] as const) {
      if (char[nameKey]?.trim() && !char[sourceKey]?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${sourceKey} is required when ${nameKey} is selected`,
          path: [sourceKey],
        })
      }
    }
    if (char.subrace?.trim() && !char.race.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A selected subrace requires a selected race',
        path: ['race'],
      })
    }
    if (char.provenance) {
      const selectedRacialTargets = new Map<string, Set<string>>()
      char.spells.spellProfiles.forEach((profile, profileIndex) => {
        if (profile.type !== 'racial') return
        profile.fixedSpells?.forEach((reference, index) => {
          const target = getSpellReferenceKey(reference)
          const owned = (char.provenance.spells[getSpellNameKey(reference)] ?? []).some(
            (tag) =>
              tag.grantType === 'fixed' &&
              isSelectedRaceOwner(tag, char) &&
              getSpellReferenceKey(reference, tag.grantSource) === target,
          )
          if (!owned)
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Racial fixed spell declarations require matching exact active-owner grants',
              path: ['spells', 'spellProfiles', profileIndex, 'fixedSpells', index],
            })
        })
        profile.choices?.forEach((choice, choiceIndex) => {
          const poolTargets = choice.pool
            ? new Set(choice.pool.map((reference) => getSpellReferenceKey(reference)))
            : undefined
          const targets = selectedRacialTargets.get(choice.id) ?? new Set<string>()
          const materialized = new Set(
            (choice.isCantrip ? profile.cantrips : profile.spellsKnown).map((reference) =>
              getSpellReferenceKey(reference),
            ),
          )
          const names = new Set(choice.selected.map(getSpellNameKey))
          if (names.size !== choice.selected.length || names.size > choice.count) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Racial spell choices require unique logical spells within their quota',
              path: ['spells', 'spellProfiles', profileIndex, 'choices', choiceIndex, 'selected'],
            })
          }
          choice.selected.forEach((reference, selectionIndex) => {
            const target = getSpellReferenceKey(reference)
            targets.add(target)
            const owned = (char.provenance.spells[getSpellNameKey(reference)] ?? []).some(
              (tag) =>
                isRacialSpellChoiceOwner(tag, char) &&
                tag.grantType === 'choice' &&
                tag.grantVariant === choice.id &&
                getSpellReferenceKey(reference, tag.grantSource) === target,
            )
            if (!materialized.has(target) || !owned || (poolTargets && !poolTargets.has(target))) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  'Racial selected spell targets must agree with materialized spells, descriptor ownership and declared pools',
                path: [
                  'spells',
                  'spellProfiles',
                  profileIndex,
                  'choices',
                  choiceIndex,
                  'selected',
                  selectionIndex,
                ],
              })
            }
          })
          selectedRacialTargets.set(choice.id, targets)
        })
      })
      Object.entries(char.provenance.spells).forEach(([name, tags]) => {
        tags.forEach((tag, index) => {
          if (
            (tag.sourceType !== 'race' && tag.sourceType !== 'subrace') ||
            tag.grantType !== 'choice'
          )
            return
          if (
            name !== getSpellNameKey(name) ||
            !isRacialSpellChoiceOwner(tag, char) ||
            !tag.grantVariant ||
            !selectedRacialTargets
              .get(tag.grantVariant)
              ?.has(getSpellReferenceKey(name, tag.grantSource))
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                'Racial choice ownership must match its selected descriptor and exact spell target',
              path: ['provenance', 'spells', name, index],
            })
          }
        })
      })
      if (char.originSystem === '2024' && hasRaceAbilityOriginGrants(char.provenance)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Revised origin cannot retain racial ability grants or choice blocks',
          path: ['provenance'],
        })
      }
      const invalidAbilityPaths = getInvalidRaceAbilityChoicePaths(char.provenance)
      for (const path of invalidAbilityPaths) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Racial ability choices require explicit rules and unique canonical owner blocks',
          path: ['provenance', ...path],
        })
      }
      if (invalidAbilityPaths.length === 0) {
        const resolved = resolveRaceAsiChoicesInLedger(
          char,
          char.provenance,
          char.raceAsiChoices ?? [],
        )
        char.provenance.choices.forEach((record, index) => {
          const expected = resolved.choices[index]
          if (
            expected !== record &&
            (record.status !== expected.status ||
              record.selected.length !== expected.selected.length ||
              record.selected.some((ability, slot) => ability !== expected.selected[slot]))
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Racial ability records must agree with the bounded saved player choices',
              path: ['provenance', 'choices', index, 'selected'],
            })
          }
        })
      }
      for (const path of getUnselectedRaceOwnerPaths(char.provenance, char)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Racial grants must belong to the selected race or subrace printing',
          path: ['provenance', ...path],
        })
      }
    }
    char.classProgression.forEach((entry, index) => {
      if (entry.subclass && !entry.subclassSource) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'subclassSource is required when subclass is selected',
          path: ['classProgression', index, 'subclassSource'],
        })
      }
    })
    if (char.classProgression.length > 0) {
      const totalLevels = char.classProgression.reduce((sum, entry) => sum + entry.levels, 0)
      if (totalLevels > MAX_CHARACTER_LEVEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: MAX_CHARACTER_LEVEL,
          type: 'number',
          inclusive: true,
          message: `Total class levels cannot exceed ${MAX_CHARACTER_LEVEL} (got ${totalLevels})`,
          path: ['classProgression'],
        })
      }
    }
  })

export const characterPersistenceSchema = characterSchema

type PersistedCharacter = z.output<typeof characterPersistenceSchema>
type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false

/** The normalized persistence output must always be safe to use as a runtime character. */
export type CharacterSchemaOutputContract = IsAssignable<PersistedCharacter, Character>
