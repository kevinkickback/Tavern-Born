import { getFeatureSourceDigest } from './featureSourceAudit'
import { DAMAGE_TYPE_LABEL_FALLBACKS } from './rulesetMetadata'

type Row = Record<string, unknown>

// The pinned printings below keep the base weapon or ammunition's physical facts.
// Qualification is independent of which bases match the template's authored requirements.
const classicAndRevised = [
  'Dancing Sword',
  'Dragon Slayer',
  'Flame Tongue',
  'Giant Slayer',
  'Nine Lives Stealer',
  'Sword of Life Stealing',
  'Sword of Sharpness',
  'Sword of Vengeance',
  'Sword of Wounding',
  'Vicious Weapon',
  'Vorpal Sword',
  'Weapon of Warning',
]
const weaponPrintings: Readonly<Record<string, readonly string[]>> = {
  AI: ['Vicious +1 Weapon'],
  AUD: ['Life-Sapping Blade', 'Thayan Sword'],
  BGDIA: ['Hellfire Weapon'],
  BMT: [
    'Bow of Conflagration',
    'Bow of Melodies',
    "Fool's Blade",
    'Forcebreaker Weapon',
    'Sword of the Planes',
  ],
  CoA: [
    'Demonbone Polearm',
    'Stygian Spear',
    'Sword of Retribution',
    'Weapon of Agonizing Paralysis',
  ],
  DMG: classicAndRevised,
  EFA: ['Dazzling Weapon', 'Returning Weapon'],
  EGW: ['Acheron Blade', 'Corpse Slayer', 'Weapon of Certain Death'],
  FTD: [
    "Ascendant Dragon's Wrath Weapon",
    'Crystal Blade',
    'Dragonlance',
    'Dragon Wing Bow',
    "Slumbering Dragon's Wrath Weapon",
    "Stirring Dragon's Wrath Weapon",
    "Wakened Dragon's Wrath Weapon",
  ],
  LLK: ['Blade of the Medusa', 'Polymorph Blade'],
  XDMG: [
    ...classicAndRevised,
    'Adamantine Weapon',
    "Executioner's Axe",
    'Moon-Touched Sword',
    'Oathbow',
    'Silvered Weapon',
    'Sylvan Talon',
    'Enspelled Weapon (Cantrip)',
    ...Array.from({ length: 8 }, (_, level) => `Enspelled Weapon (Level ${level + 1})`),
  ],
  XGE: ['Moon-Touched Sword'],
}
const ammunitionPrintings: Readonly<Record<string, readonly string[]>> = {
  AU: ['Dispelling Ammunition', 'Goading Ammunition'],
  BMT: ['Bloodseeker Ammunition', 'Dried Leech', 'Winged Ammunition'],
  DMG: ['Arrow of Slaying (*)'],
  PHB: ['Silvered Ammunition'],
  XDMG: ['Adamantine Weapon', 'Ammunition of Slaying', 'Walloping Ammunition'],
  XGE: ['Adamantine Ammunition', 'Walloping Ammunition'],
}

const manualFields = new Set([
  'attachedSpells',
  'charges',
  'light',
  'otherSources',
  'recharge',
  'rechargeAmount',
  'spellScrollLevel',
])
const fields = new Set(['nameSuffix', 'reqAttune', 'curse', ...manualFields])
// Exact attack-and-damage declarations from the pinned configured catalog.
// Digest input is [reqAttune or null, bonusWeapon, inherited entries].
const fixedBonusDigests = new Map<string, string>([
  ['Acheron Blade|EGW', 'eaff5aa0275c95d5083551edf9ac50adc10d188c844defad461a320364651f86'],
  [
    "Ascendant Dragon's Wrath Weapon|FTD",
    '396add46e6dae082531f38043974ed33c983cfca33eb10e20301afe227985b45',
  ],
  ['Corpse Slayer|EGW', '291ef77471180ef390f7e35df0900cf00b2db4b36044da9c469a78a71ab49dab'],
  ['Dazzling Weapon|EFA', 'eb605f5d5233e54870e7a2ae50b27b7a9f4f483694c31dcb90e0321f45247da3'],
  ['Demonbone Polearm|CoA', '271d708bd6717d3b4e1c11cf9582c86bd7b9cc9775287af75c3dce1ec8a2a916'],
  ['Dragon Slayer|DMG', '82fe1efa6f8be4f4d98f0f2902fcb30c3318cbf61abe08245c44019a336edccb'],
  ['Dragon Slayer|XDMG', '240cf57fb26c93e21c093f78fadd31a4dce1489ed1a257e5f9d5e9c21095e5ef'],
  ['Dragonlance|FTD', '72d48f0cfb0cae1f99dc08edaebe741d5c7fd25e6865bad0da61b6ed34fab144'],
  ["Executioner's Axe|XDMG", 'f464f1a2f2b2af227374ec4523821a824cf4e8f732acb032556bc0f5df0fc9dd'],
  ["Fool's Blade|BMT", '70d59a641eba5873b29d7dcbb9becbc03511ed27c58fc7185e4982796cfee2d7'],
  ['Forcebreaker Weapon|BMT', '72a88475efe2322edfd5d885e34cb416e8bac2e919ec31fb17e466e476ccffa0'],
  ['Giant Slayer|DMG', '65080f1e71c186d8d96ccaf786a2d7b7b9ce40ecfeac80bc08d74d9859aa58af'],
  ['Giant Slayer|XDMG', '79500d5326d272fa2f3fd4135289bb755a32e725d4f750106519d71684ad8238'],
  ['Life-Sapping Blade|AUD', 'd7430ecad373912a4762ceb8d2c77485520a33ac44fb61cd92a39dbbfa33481b'],
  ['Nine Lives Stealer|DMG', '7462dadfe8bd6dc622cc1897b47ced877cc9604708347dc8e2c4095f7058e735'],
  ['Nine Lives Stealer|XDMG', '2f0758d3ff8ba8e0c9323384c34e4295b3382985e65309e8c8f4871662dc1b34'],
  ['Returning Weapon|EFA', 'bdbabf0fd01c63267b13cd95566f0a0ff6d7a6ef0dd8129390d469aee64d6aec'],
  [
    "Stirring Dragon's Wrath Weapon|FTD",
    'e7d2967ff78cdef88ede0f7acc88e0d9d5491e4dd9604545ef1a5a0cd74235ac',
  ],
  ['Stygian Spear|CoA', '68d10f95ffab54c6aa6d84d9dfedce20e5145297cec4593547a468e23b5f6f62'],
  ['Sword of Retribution|CoA', 'ba6807ec0f0adce55d22dff1f46cbb754694fb8f6f186c6cff3b32f9f8efab2a'],
  ['Sword of the Planes|BMT', '5e7224d14e929dfc7c929713db286664319e75d40add8113820d697b21ed5b78'],
  ['Sword of Vengeance|DMG', '3ecba9591fe6f452d137484ece3222fecd6bdaa59909a07c34a6f0be772b9271'],
  ['Sword of Vengeance|XDMG', 'b235e6481ea186b721996ade4e349b689a22b112da2392ca0bc46985a27ac744'],
  ['Thayan Sword|AUD', 'd8469fab3a8833ca773e955e9143735e3c3ec31ae1cb9f13e796f7fd781fa5fa'],
  ['Vicious +1 Weapon|AI', '9125370bb1f9d831e5f42dec80eb209ae41ed3ab448c57c48f81b9bde4c1910a'],
  ['Vorpal Sword|DMG', 'f94eae3f78a48a6a22c7a39aedd05cc967deadf0b436cdb19f05db672389bf54'],
  ['Vorpal Sword|XDMG', '01ef787df9a3cf24ef3c334d33059b45ac00dae16ca656f3344038eb83635d6c'],
  [
    "Wakened Dragon's Wrath Weapon|FTD",
    '658f809bc04c25316fe5b078b827b9821511098c5c3e867bf9d31ede93031908',
  ],
  [
    'Weapon of Agonizing Paralysis|CoA',
    'f63a065ec6b5cdb67fc79be2849b181536de3370ab82aa11c3f57ab3cc47d307',
  ],
])

// 5etools b9061583 render.js:2500–2559,12321–12333. Only the observed
// scalar display fields and modifiers used by these printings are supported.
export const weaponTemplateBaseFields = new Set([
  'baseName/l',
  'baseName/a',
  'baseName/at',
  'dmgType',
])

export function getWeaponTemplateBaseText(field: string, base: Row): string | undefined {
  if (field === 'dmgType') return DAMAGE_TYPE_LABEL_FALLBACKS[String(base.dmgType)]?.toLowerCase()
  const name = String(base.name)
  if (!name || /[|{}<>]/.test(name)) return undefined
  if (field === 'baseName/l') return name.toLowerCase()
  const article = /^[aeiou]/i.test(name) ? 'an' : 'a'
  if (field === 'baseName/a') return article
  if (field === 'baseName/at') return article === 'an' ? 'An' : 'A'
  return undefined
}

export function qualifyWeaponTemplate(definition: Row, inherited: Row, ammunition: boolean) {
  const name = String(definition.name)
  const source = String(definition.source)
  const approved = (ammunition ? ammunitionPrintings : weaponPrintings)[source]
  if (!Array.isArray(approved) || !approved.includes(name)) return undefined

  const mundaneAmmunition =
    (source === 'PHB' && name === 'Silvered Ammunition') ||
    (source === 'XGE' && name === 'Adamantine Ammunition')
  const entries = mundaneAmmunition ? definition.entries : inherited.entries
  const { reqAttune, bonusWeapon } = inherited
  const expectedBonusDigest = fixedBonusDigests.get(`${name}|${source}`)
  const hasFixedBonus =
    expectedBonusDigest !== undefined &&
    getFeatureSourceDigest([reqAttune ?? null, bonusWeapon, entries], false) === expectedBonusDigest
  const affixes = [inherited.namePrefix, inherited.nameSuffix].filter((part) => part !== undefined)
  const valid =
    (definition.type === 'GV|DMG' || definition.type === 'GV|XDMG') &&
    affixes.length === 1 &&
    affixes.every((part) => typeof part === 'string' && !!part.trim() && !/[|{}<>]/.test(part)) &&
    (bonusWeapon === undefined ||
      (typeof bonusWeapon === 'string' && /^\+[1-3]$/.test(bonusWeapon))) &&
    (reqAttune === undefined || reqAttune === true) &&
    (inherited.curse === undefined || typeof inherited.curse === 'boolean')
  return {
    valid,
    entries,
    fields,
    manualFields,
    hasFixedBonus,
    mundaneAmmunition,
    mixedAmmunitionTemplate: ammunition && source === 'XDMG' && name === 'Adamantine Weapon',
  }
}
