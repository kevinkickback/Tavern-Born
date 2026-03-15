import { z } from 'zod'

export const RaceSchema = z.object({
  name: z.string(),
  source: z.string(),
  page: z.number().optional(),
  size: z.union([z.string(), z.array(z.string())]).optional(),
  speed: z.any().optional(),
  ability: z.array(z.any()).optional(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const RaceDataSchema = z.object({
  race: z.array(RaceSchema),
}).passthrough()

export const ClassSchema = z.object({
  name: z.string(),
  source: z.string(),
  hd: z.object({ number: z.number(), faces: z.number() }).optional(),
  proficiency: z.array(z.string()).optional(),
  startingProficiencies: z.any().optional(),
  classFeatures: z.array(z.any()).optional(),
}).passthrough()

export const ClassDataSchema = z.object({
  class: z.array(ClassSchema),
}).passthrough()

export const ClassIndexSchema = z.record(z.string())

export const BackgroundSchema = z.object({
  name: z.string(),
  source: z.string(),
  skillProficiencies: z.array(z.any()).optional(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const BackgroundDataSchema = z.object({
  background: z.array(BackgroundSchema),
}).passthrough()

export const SpellSchema = z.object({
  name: z.string(),
  source: z.string(),
  level: z.number(),
  school: z.string(),
  time: z.array(z.any()).optional(),
  range: z.any().optional(),
  components: z.any().optional(),
  duration: z.array(z.any()).optional(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const SpellDataSchema = z.object({
  spell: z.array(SpellSchema),
}).passthrough()

export const FeatSchema = z.object({
  name: z.string(),
  source: z.string(),
  entries: z.array(z.any()).optional(),
  prerequisite: z.array(z.any()).optional(),
}).passthrough()

export const FeatDataSchema = z.object({
  feat: z.array(FeatSchema),
}).passthrough()

export const ItemSchema = z.object({
  name: z.string(),
  source: z.string(),
  type: z.string().optional(),
  rarity: z.string().optional(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const ItemDataSchema = z.object({
  item: z.array(ItemSchema).optional(),
  itemGroup: z.array(ItemSchema).optional(),
  baseitem: z.array(ItemSchema).optional(),
}).passthrough()

export const BookSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string().optional(),
  group: z.string().optional(),
  published: z.string().optional(),
}).passthrough()

export const BookDataSchema = z.object({
  book: z.array(BookSchema),
}).passthrough()

export const ActionSchema = z.object({
  name: z.string(),
  source: z.string(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const ActionDataSchema = z.object({
  action: z.array(ActionSchema),
}).passthrough()

export const ConditionSchema = z.object({
  name: z.string(),
  source: z.string(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const ConditionDataSchema = z.object({
  condition: z.array(ConditionSchema).optional(),
  disease: z.array(ConditionSchema).optional(),
}).passthrough()

export const LanguageSchema = z.object({
  name: z.string(),
  source: z.string(),
  type: z.string().optional(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const LanguageDataSchema = z.object({
  language: z.array(LanguageSchema),
}).passthrough()

export const OptionalFeatureSchema = z.object({
  name: z.string(),
  source: z.string(),
  featureType: z.array(z.string()).optional(),
  entries: z.array(z.any()).optional(),
}).passthrough()

export const OptionalFeatureDataSchema = z.object({
  optionalfeature: z.array(OptionalFeatureSchema),
}).passthrough()

export const GenericSchema = z.object({
  name: z.string().optional(),
  source: z.string().optional(),
}).passthrough()

export const GenericDataSchema = z.object({
  deity: z.array(GenericSchema).optional(),
  skill: z.array(GenericSchema).optional(),
  sense: z.array(GenericSchema).optional(),
  variant: z.array(GenericSchema).optional(),
  magicvariant: z.array(GenericSchema).optional(),
  variantrule: z.array(GenericSchema).optional(),
}).passthrough()
