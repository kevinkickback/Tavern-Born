import { z } from 'zod'
import {
  ABILITY_SCORE_ABSOLUTE_MAX,
  ABILITY_SCORE_MIN,
  MAX_CHARACTER_LEVEL,
} from '@/lib/calculations/gameRules'
import { ALL_SKILLS } from '@/lib/calculations/skills'

export const sourceSchema = z
  .string()
  .min(1)
  .transform((s) => s.toUpperCase())

const levelSchema = z.number().int().min(1).max(MAX_CHARACTER_LEVEL)

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

const proficiencyTypeSchema = z.enum([
  'armor',
  'weapons',
  'tools',
  'skills',
  'languages',
  'savingThrows',
])

const variantRulesSchema = z.object({
  optionalClassFeatures: z.boolean().default(false),
  averageHitPoints: z.boolean().default(true),
  abilityScoreMethod: z.enum(['point-buy', 'standard-array', 'custom']).optional(),
  bladesingerAnyRace: z.boolean().default(false),
  battleragerAnyRace: z.boolean().default(false),

  preferNewerPrintings: z.boolean().optional(),
  ignoreEquipRestrictions: z.boolean().default(false),
})

const characterClassEntrySchema = z.object({
  name: z.string().min(1),
  source: z.string().optional(),
  levels: z.number().int().min(1).max(MAX_CHARACTER_LEVEL),
  subclass: z.string().optional(),
  subclassSource: z.string().optional(),
})

const hitPointGainSchema = z
  .object({
    className: z.string().min(1),
    classSource: z.string().optional(),
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
  properties: z.array(z.string()).optional(),
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
  max: z.number().int().min(0),
  current: z.number().int().min(0),
  temporary: z.number().int().min(0),
})

const savingThrowEntrySchema = z.object({
  proficient: z.boolean(),
  bonus: z.number().int(),
})

const savingThrowsSchema = z.object({
  strength: savingThrowEntrySchema,
  dexterity: savingThrowEntrySchema,
  constitution: savingThrowEntrySchema,
  intelligence: savingThrowEntrySchema,
  wisdom: savingThrowEntrySchema,
  charisma: savingThrowEntrySchema,
})

const skillEntrySchema = z.object({
  proficient: z.boolean(),
  expertise: z.boolean(),
  bonus: z.number().int(),
})

const skillsSchema = z.record(skillEntrySchema).transform((record) => {
  const validKeySet = new Set<string>(ALL_SKILLS)
  return Object.fromEntries(Object.entries(record).filter(([key]) => validKeySet.has(key)))
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
  alliesAndOrganizations: z.string().optional(),
})

const proficienciesSchema = z.object({
  armor: z.array(z.string()),
  weapons: z.array(z.string()),
  tools: z.array(z.string()),
  skills: z.array(z.string()),
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
})

const spellSourceTagSchema = sourceTagSchema.extend({
  spellGrantedAtLevel: z.number().int().min(1).optional(),
  spellAttributionMode: z.enum(['exact', 'inferred-lowest-eligible']).optional(),
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
  optionPool: z.array(z.string()),
  selected: z.array(z.string()),
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
  savingThrows: sourceTagListMapSchema,
})

const provenanceLedgerSchema = z.object({
  proficiencies: proficiencyProvenanceSchema,
  abilityBonuses: z.array(abilityBonusProvenanceRecordSchema),
  features: sourceTagListMapSchema,
  feats: sourceTagListMapSchema,
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

const spellSelectionSchema = z
  .object({
    spellProfiles: z.array(spellProfileSchema).min(1, 'At least one spell profile must exist'),
    spellSlots: spellSlotsSchema,
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
  classSource: z.string().optional(),
  abilityChanges: z.record(z.union([z.literal(1), z.literal(2)])),
})

export const characterSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().default('6.0.0'),
    name: z
      .string()
      .min(1)
      .max(100)
      .refine((s) => s.trim().length > 0, {
        message: 'Character name cannot be only whitespace',
      }),
    originSystem: originSystemSchema,
    race: z.string(),
    raceSource: z.string().optional(),
    subrace: z.string().optional(),
    subraceSource: z.string().optional(),
    class: z.string(),
    classSource: z.string().optional(),
    subclass: z.string().optional(),
    subclassSource: z.string().optional(),
    background: z.string(),
    backgroundSource: z.string().optional(),
    currency: currencySchema.default({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }).optional(),
    level: levelSchema,
    experiencePoints: z.number().int().min(0).default(0),
    classProgression: z.array(characterClassEntrySchema).optional(),
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
    backgroundAsiChoices: z.array(z.string()).optional(),
    backgroundCurrencyGrant: currencySchema.optional(),
    classEquipmentChoices: z.record(z.array(z.string())).optional(),
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
    armorClass: z.number().int().min(0).optional(),
    armorClassOverride: z.number().int().min(0).optional(),
    armorClassAdjustments: z.array(armorClassAdjustmentSchema).optional(),
    initiative: z.number().int(),
    speed: z.number().int(),
    damageResistances: z.array(z.string()).optional(),
    damageImmunities: z.array(z.string()).optional(),
    conditionImmunities: z.array(z.string()).optional(),
    savingThrows: savingThrowsSchema,
    skills: skillsSchema,
    details: characterDetailsSchema,
    portrait: z.string().optional(),
    portraitTransform: portraitTransformSchema.optional(),
    asiChoices: z.array(asiChoiceSchema).optional(),
    specialFeats: z.array(featSchema).optional(),
    fixedFeatOptions: z.record(featOptionSelectionsSchema).optional(),
    provenance: provenanceLedgerSchema.optional(),
    inspiration: z.boolean().optional(),
    deathSaves: z
      .object({
        successes: z.number().int().min(0).max(3),
        failures: z.number().int().min(0).max(3),
      })
      .optional(),
    conditions: z.array(z.string()).optional(),
    exhaustion: z.number().int().min(0).max(6).optional(),
    hitDiceUsed: z.number().int().min(0).optional(),
    ritualCasting: z.boolean().optional(),
    classResources: z.record(z.number().int().min(0)).optional(),
    createdAt: z.string(),
    lastModified: z.string(),
  })
  .superRefine((char, ctx) => {
    if (char.classProgression && char.classProgression.length > 0) {
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

export type AbilityName = import('./character').AbilityName
export type AbilityScores = z.infer<typeof abilityScoresSchema>
export type AbilityScoreMethod = z.infer<typeof abilityScoreMethodSchema>
export type ProficiencyType = z.infer<typeof proficiencyTypeSchema>
export type CharacterImport = z.infer<typeof characterSchema>
export type SpellSlotLevel = z.infer<typeof spellSlotLevelSchema>
export type SpellSlots = z.infer<typeof spellSlotsSchema>
export type SpellProfile = z.infer<typeof spellProfileSchema>
export type SpellSelection = z.infer<typeof spellSelectionSchema>
