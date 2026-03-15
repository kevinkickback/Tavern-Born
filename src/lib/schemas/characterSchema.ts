// Character and game-data Zod schemas.
// Ported from fizbanes-forge/src/lib/ValidationSchemas.js.
// These schemas are the single source of truth for input validation — use them
// in forms, wizard steps, and service-layer entry points.

import { z } from 'zod';
import {
  ABILITY_SCORE_MIN,
  ABILITY_SCORE_ABSOLUTE_MAX,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  MAX_CHARACTER_LEVEL,
} from '@/lib/gameRules';

// ── Primitives ────────────────────────────────────────────────────────────────

export const sourceSchema = z
  .string()
  .min(1)
  .transform((s) => s.toUpperCase());

export const optionalSourceSchema = sourceSchema.default('PHB');

export const nameSchema = z.string().min(1).max(200);

export const levelSchema = z.number().int().min(1).max(MAX_CHARACTER_LEVEL);

export const sourceArraySchema = z.array(sourceSchema).min(1);

// ── Ability scores ────────────────────────────────────────────────────────────

/** Any legal ability score, including magical boosted maximums. */
export const abilityScoreSchema = z
  .number()
  .int()
  .min(ABILITY_SCORE_MIN)
  .max(ABILITY_SCORE_ABSOLUTE_MAX);

/** Score within the legal point-buy range only. */
export const pointBuyScoreSchema = z
  .number()
  .int()
  .min(POINT_BUY_MIN)
  .max(POINT_BUY_MAX);

/** Full lowercase ability name. */
export const abilityNameSchema = z.enum([
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
]);

/** Accepts both abbreviations and full names, normalises to lowercase full name. */
export const abilityNameLooseSchema = z
  .enum([
    'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
    'str', 'dex', 'con', 'int', 'wis', 'cha',
  ])
  .transform((v) => {
    const map: Record<string, string> = {
      str: 'strength', dex: 'dexterity', con: 'constitution',
      int: 'intelligence', wis: 'wisdom', cha: 'charisma',
    };
    return (map[v] ?? v) as z.infer<typeof abilityNameSchema>;
  });

export const abilityScoresSchema = z.object({
  strength: abilityScoreSchema,
  dexterity: abilityScoreSchema,
  constitution: abilityScoreSchema,
  intelligence: abilityScoreSchema,
  wisdom: abilityScoreSchema,
  charisma: abilityScoreSchema,
});

export const pointBuyScoresSchema = z.object({
  strength: pointBuyScoreSchema,
  dexterity: pointBuyScoreSchema,
  constitution: pointBuyScoreSchema,
  intelligence: pointBuyScoreSchema,
  wisdom: pointBuyScoreSchema,
  charisma: pointBuyScoreSchema,
});

export const abilityBonusSchema = z.object({
  ability: abilityNameSchema,
  value: z.number().int(),
  source: z.string().min(1),
});

// ── Proficiency ───────────────────────────────────────────────────────────────

export const proficiencyTypeSchema = z.enum([
  'armor',
  'weapons',
  'tools',
  'skills',
  'languages',
  'savingThrows',
]);

// ── 5etools entity identifiers ────────────────────────────────────────────────

export const raceIdentifierSchema = z.object({
  name: nameSchema,
  source: optionalSourceSchema,
});

export const subraceIdentifierSchema = z.object({
  raceName: nameSchema,
  subraceName: nameSchema,
  source: optionalSourceSchema,
  raceSource: optionalSourceSchema,
});

export const classIdentifierSchema = z.object({
  name: nameSchema,
  source: optionalSourceSchema,
});

export const subclassIdentifierSchema = z.object({
  className: nameSchema,
  subclassName: nameSchema,
  classSource: optionalSourceSchema,
  source: optionalSourceSchema,
  subclassShortName: z.string().optional(),
});

export const backgroundIdentifierSchema = z.object({
  name: nameSchema,
  source: optionalSourceSchema,
});

export const featIdentifierSchema = z.object({
  name: nameSchema,
  source: optionalSourceSchema,
});

export const spellIdentifierSchema = z.object({
  name: nameSchema,
  source: optionalSourceSchema,
});

export const spellFilterSchema = z.object({
  level: z.number().int().min(0).max(9).optional(),
  school: z.string().optional(),
  classes: z.array(z.string()).optional(),
  source: sourceSchema.optional(),
});

export const itemIdentifierSchema = z.object({
  name: nameSchema,
  source: optionalSourceSchema,
});

export const itemFilterSchema = z.object({
  type: z.string().optional(),
  rarity: z.string().optional(),
  source: sourceSchema.optional(),
  attunement: z.boolean().optional(),
});

// ── Variant rules ─────────────────────────────────────────────────────────────

export const variantRulesSchema = z.object({
  optionalClassFeatures: z.boolean().default(false),
  averageHitPoints: z.boolean().default(true),
});

// ── Character creation wizard ─────────────────────────────────────────────────

export const abilityScoreMethodSchema = z.enum([
  'point-buy',
  'standard-array',
  'manual',
]);

export const wizardStep1Schema = z.object({
  name: z.string().min(1, 'Character name is required').max(100, 'Name must be 100 characters or fewer'),
});

export const wizardStep2Schema = z.object({
  abilityScoreMethod: abilityScoreMethodSchema.refine((v) => !!v, {
    message: 'Please select an ability score generation method',
  }),
  allowedSources: sourceArraySchema.min(1, 'Please select at least one source book'),
});

export const wizardStep3Schema = z.object({
  race: z.string().min(1, 'Please select a race'),
});

export const wizardStep4Schema = z.object({
  class: z.string().min(1, 'Please select a class'),
});

export const wizardStep5Schema = z.object({
  background: z.string().min(1, 'Please select a background'),
});

export const wizardStep6Schema = z.object({
  abilityScores: abilityScoresSchema.optional(),
});

/** Full character schema for file import / data integrity checks. */
export const characterSchema = z.object({
  id: z.string().min(1),
  version: z.string().optional(),
  name: z.string().min(1).max(100),
  race: z.string(),
  subrace: z.string().optional(),
  class: z.string(),
  background: z.string(),
  level: levelSchema,
  experiencePoints: z.number().int().min(0).default(0),
  abilityScores: abilityScoresSchema,
  proficiencyBonus: z.number().int().min(2).max(6).optional(),
  allowedSources: z.array(z.string()).default(['PHB']),
  variantRules: variantRulesSchema.optional(),
  createdAt: z.string(),
  lastModified: z.string(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type AbilityName = z.infer<typeof abilityNameSchema>;
export type AbilityScores = z.infer<typeof abilityScoresSchema>;
export type AbilityScoreMethod = z.infer<typeof abilityScoreMethodSchema>;
export type ProficiencyType = z.infer<typeof proficiencyTypeSchema>;
export type CharacterImport = z.infer<typeof characterSchema>;
