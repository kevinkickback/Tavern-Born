import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { sha256, stableJson } from './snapshot.mjs'

export const PROVENANCE_AUDIT_VERSION = 1

const MIN_FRAGMENT_WORDS = 5
const MAX_FRAGMENT_WORDS = 28
const OVERLAP_WORDS = 5
const SEARCH_STOP_WORDS = new Set([
  'about',
  'after',
  'against',
  'also',
  'another',
  'before',
  'being',
  'creature',
  'each',
  'from',
  'have',
  'into',
  'more',
  'other',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'until',
  'when',
  'which',
  'with',
  'your',
])

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const THIRD_FIELD_DISPLAY_TAGS = new Set([
  'action',
  'class',
  'condition',
  'creature',
  'feat',
  'hazard',
  'item',
  'itemmastery',
  'itemproperty',
  'language',
  'optfeature',
  'race',
  'sense',
  'spell',
  'status',
  'variantrule',
])

function visibleTagText(tag, content) {
  const normalizedTag = tag.toLowerCase()
  const fields = content.split('|').map((field) => field.trim())
  const primary = fields[0] ?? ''
  if (normalizedTag === 'h') return 'Hit'
  if (normalizedTag === 'hit') return primary ? `+${primary}` : ''
  if (normalizedTag === 'dc') return primary ? `DC ${primary}` : ''
  if (normalizedTag === 'chance') return primary ? `${primary} percent` : ''
  if (normalizedTag === 'recharge') return `(Recharge ${primary || '5'}-6)`
  if (normalizedTag === 'dice') return fields[1] || primary
  if (normalizedTag === 'scaledamage' || normalizedTag === 'scaledice') {
    return fields[2] || primary
  }
  if (normalizedTag === 'book') return primary
  if (normalizedTag === 'quickref') return fields[4] || primary
  if (THIRD_FIELD_DISPLAY_TAGS.has(normalizedTag)) return fields[2] || primary
  return primary
}

function replaceVisibleTags(value) {
  let output = value
  for (let pass = 0; pass < 20; pass += 1) {
    const replaced = output.replace(
      /\{@([a-zA-Z0-9]+)(?:\s+([^{}]*))?}/g,
      (_match, tag, content = '') => visibleTagText(tag, content),
    )
    if (replaced === output) return output
    output = replaced
  }
  return output
}

export function toAuditText(value) {
  return replaceVisibleTags(String(value ?? '').replace(/\{#itemEntry [^}]+}/g, ' '))
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

export function normalizeAuditText(value, { pdfText = false } = {}) {
  let text = toAuditText(value).normalize('NFKC')
  if (pdfText) text = text.replace(/([\p{L}])-\s*\r?\n\s*([\p{Ll}])/gu, '$1$2')
  const normalized = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return pdfText ? normalized.replace(/\bappendix ph ([a-z])\b/g, 'appendix $1') : normalized
}

function isReferenceOnly(value) {
  const text = value.trim()
  return /^\{#[^}]+}$/.test(text) || (/^[^.!?]+(?:\|[^.!?]*)+$/.test(text) && !/[.!?]/.test(text))
}

function chunkWords(words) {
  if (words.length <= MAX_FRAGMENT_WORDS) return [words.join(' ')]
  const chunks = []
  const step = MAX_FRAGMENT_WORDS - OVERLAP_WORDS
  for (let index = 0; index < words.length; index += step) {
    const chunk = words.slice(index, index + MAX_FRAGMENT_WORDS)
    if (chunk.length < MIN_FRAGMENT_WORDS && chunks.length > 0) {
      break
    }
    chunks.push(chunk.join(' '))
  }
  return chunks
}

function splitEvidence(value) {
  if (isReferenceOnly(value)) return []
  const normalized = normalizeAuditText(value)
  const words = normalized.split(' ').filter(Boolean)
  if (words.length < MIN_FRAGMENT_WORDS) return []
  return chunkWords(words)
}

const NON_PROSE_EVIDENCE_FIELDS = new Set(['colStyles', 'fonts', 'seeAlsoDeck', 'template'])
const ROOT_IDENTITY_FIELDS = new Set([
  'className',
  'classSource',
  'name',
  'shortName',
  'source',
  'subclassShortName',
  'subclassSource',
])
const WEAPON_DAMAGE_TYPES = new Map([
  ['B', 'Bludgeoning'],
  ['P', 'Piercing'],
  ['S', 'Slashing'],
])
const WEAPON_PROPERTY_NAMES = new Map([
  ['2H', 'Two-Handed'],
  ['F', 'Finesse'],
  ['H', 'Heavy'],
  ['L', 'Light'],
  ['LD', 'Loading'],
  ['R', 'Reach'],
  ['S', 'Special'],
])
const SRD_51_AMMUNITION_PACKS = new Map([
  ['Arrow', { name: 'Arrows (20)', quantity: 20 }],
  ['Blowgun Needle', { name: 'Blowgun Needles (50)', quantity: 50 }],
  ['Crossbow Bolt', { name: 'Crossbow Bolts (20)', quantity: 20 }],
  ['Sling Bullet', { name: 'Sling Bullets (20)', quantity: 20 }],
])
const SRD_51_CROSSBOW_TABLE_NAMES = new Map([
  ['Hand Crossbow', 'Hand'],
  ['Heavy Crossbow', 'Heavy'],
  ['Light Crossbow', 'Light'],
])
const SRD_521_AMMUNITION_PACKS = new Map([
  ['Arrow', { name: 'Arrows', amount: 20, storage: 'Quiver', multiplier: 20 }],
  ['Arrows (20)', { name: 'Arrows', amount: 20, storage: 'Quiver', multiplier: 1 }],
  ['Bolt', { name: 'Bolts', amount: 20, storage: 'Case', multiplier: 20 }],
  ['Bolts (20)', { name: 'Bolts', amount: 20, storage: 'Case', multiplier: 1 }],
  ['Needle', { name: 'Needles', amount: 50, storage: 'Pouch', multiplier: 50 }],
  ['Needles (50)', { name: 'Needles', amount: 50, storage: 'Pouch', multiplier: 1 }],
  ['Sling Bullet', { name: 'Bullets, Sling', amount: 20, storage: 'Pouch', multiplier: 20 }],
  ['Sling Bullets (20)', { name: 'Bullets, Sling', amount: 20, storage: 'Pouch', multiplier: 1 }],
])
const SRD_521_FOCUS_TABLE_NAMES = new Map([
  ['Crystal', 'Crystal'],
  ['Orb', 'Orb'],
  ['Rod', 'Rod'],
  ['Sprig of Mistletoe', 'Sprig of Mistletoe'],
  ['Staff', 'Staff (also a Quarterstaff)'],
  ['Wand', 'Wand'],
  ['Wooden Staff', 'Wooden Staff (also a Quarterstaff)'],
  ['Yew Wand', 'Yew Wand'],
])
const SRD_51_TRADE_GOODS_ROWS = new Map([
  [1, '1 CP 1 lb. of wheat'],
  [2, '2 CP 1 lb. of flour or one chicken'],
  [5, '5 CP 1 lb. of salt'],
  [10, '1 SP 1 lb. of iron or 1 sq. yd. of canvas'],
  [50, '5 SP 1 lb. of copper or 1 sq. yd. of cotton cloth'],
  [100, '1 GP 1 lb. of ginger or one goat'],
  [200, '2 GP 1 lb. of cinnamon or pepper or one sheep'],
  [300, '3 GP 1 lb. of cloves or one pig'],
  [500, '5 GP 1 lb. of silver or 1 sq. yd. of linen'],
  [1000, '10 GP 1 sq. yd. of silk or one cow'],
  [1500, '15 GP 1 lb. of saffron or one ox'],
  [5000, '50 GP 1 lb. of gold'],
  [50000, '500 GP 1 lb. of platinum'],
])
const SRD_521_EQUIPMENT_TABLE_NAMES = new Map([
  ['Common Wine (bottle)', 'Wine (bottle), Common'],
  ['Draft Horse', 'Horse, Draft'],
  ['Fine Wine (bottle)', 'Wine (bottle), Fine'],
  ['Riding Horse', 'Horse, Riding'],
])
const SRD_521_STANDARD_LANGUAGES = new Set([
  'Common',
  'Common Sign Language',
  'Draconic',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
])
const SRD_521_RARE_LANGUAGES = new Set([
  'Abyssal',
  'Celestial',
  'Deep Speech',
  'Druidic',
  'Infernal',
  'Primordial',
  'Sylvan',
  "Thieves' Cant",
  'Undercommon',
])
const SRD_521_STANDARD_LANGUAGE_TABLE =
  'Standard Languages 1d12 Language Common 1 Common Sign Language 2 Draconic 3–4 Dwarvish 5–6 Elvish 7 Giant 8 Gnomish 9 Goblin 10–11 Halfling 12 Orc'
const SRD_521_RARE_LANGUAGE_TABLE =
  "Rare Languages Language Language Abyssal Primordial Celestial Sylvan Deep Speech Thieves' Cant Druidic Undercommon Infernal Primordial includes the Aquan, Auran, Ignan, and Terran dialects."
const RESISTANCE_VARIANTS = new Map([
  ['Acid', { damage: 'acid', roll: 1, gem: 'Pearl' }],
  ['Cold', { damage: 'cold', roll: 2, gem: 'Tourmaline' }],
  ['Fire', { damage: 'fire', roll: 3, gem: 'Garnet' }],
  ['Force', { damage: 'force', roll: 4, gem: 'Sapphire' }],
  ['Lightning', { damage: 'lightning', roll: 5, gem: 'Citrine' }],
  ['Necrotic', { damage: 'necrotic', roll: 6, gem: 'Jet' }],
  ['Poison', { damage: 'poison', roll: 7, gem: 'Amethyst' }],
  ['Psychic', { damage: 'psychic', roll: 8, gem: 'Jade' }],
  ['Radiant', { damage: 'radiant', roll: 9, gem: 'Topaz' }],
  ['Thunder', { damage: 'thunder', roll: 10, gem: 'Spinel' }],
])
const DRAGON_SCALE_VARIANTS = new Map([
  ['Black', { damage: 'acid' }],
  ['Blue', { damage: 'lightning' }],
  ['Brass', { damage: 'fire' }],
  ['Bronze', { damage: 'lightning' }],
  ['Copper', { damage: 'acid' }],
  ['Gold', { damage: 'fire' }],
  ['Green', { damage: 'poison' }],
  ['Red', { damage: 'fire' }],
  ['Silver', { damage: 'cold' }],
  ['White', { damage: 'cold' }],
])
const MAGIC_ITEM_BONUS_RARITIES = new Map([
  [1, 'uncommon'],
  [2, 'rare'],
  [3, 'very rare'],
])
const HEALING_POTION_VARIANTS = new Map([
  ['Potion of Healing', { dice: '2d4 + 2', rarity: 'common', tableName: 'Healing' }],
  [
    'Potion of Greater Healing',
    { dice: '4d4 + 4', rarity: 'uncommon', tableName: 'Greater Healing' },
  ],
  [
    'Potion of Superior Healing',
    { dice: '8d4 + 8', rarity: 'rare', tableName: 'Superior Healing' },
  ],
  [
    'Potion of Supreme Healing',
    { dice: '10d4 + 20', rarity: 'very rare', tableName: 'Supreme Healing' },
  ],
])
const SPELL_SCROLL_VARIANTS = new Map([
  [0, { rarity: 'common', saveDc: 13, attackBonus: 5 }],
  [1, { rarity: 'common', saveDc: 13, attackBonus: 5 }],
  [2, { rarity: 'uncommon', saveDc: 13, attackBonus: 5 }],
  [3, { rarity: 'uncommon', saveDc: 15, attackBonus: 7 }],
  [4, { rarity: 'rare', saveDc: 15, attackBonus: 7 }],
  [5, { rarity: 'rare', saveDc: 17, attackBonus: 9 }],
  [6, { rarity: 'very rare', saveDc: 17, attackBonus: 9 }],
  [7, { rarity: 'very rare', saveDc: 18, attackBonus: 10 }],
  [8, { rarity: 'very rare', saveDc: 18, attackBonus: 10 }],
  [9, { rarity: 'legendary', saveDc: 19, attackBonus: 11 }],
])
const GENERATED_MAGIC_ITEM_PARENT_TEXT = {
  5.1: {
    wand: "Wand of the War Mage, +1, +2, or +3 Wand, uncommon (+1), rare (+2), or very rare (+3) (requires attunement by a spellcaster) While holding this wand, you gain a bonus to spell attack rolls determined by the wand's rarity. In addition, you ignore half cover when making a spell attack.",
    healing:
      "Potion of Healing Potion, rarity varies You regain hit points when you drink this potion. The number of hit points depends on the potion's rarity, as shown in the Potions of Healing table. Whatever its potency, the potion's red liquid glimmers when agitated.",
    scroll:
      "Spell Scroll Scroll, varies A spell scroll bears the words of a single spell, written in a mystical cipher. If the spell is on your class's spell list, you can read the scroll and cast its spell without providing any material components. Otherwise, the scroll is unintelligible. Casting the spell by reading the scroll requires the spell's normal casting time. Once the spell is cast, the words on the scroll fade, and it crumbles to dust. If the casting is interrupted, the scroll is not lost.",
    potion:
      'Potion of Resistance Potion, uncommon When you drink this potion, you gain resistance to one type of damage for 1 hour. The GM chooses the type or determines it randomly from the options below.',
    ring: 'Ring of Resistance Ring, rare (requires attunement) You have resistance to one damage type while wearing this ring. The gem in the ring indicates the type, which the GM chooses or determines randomly.',
    dragon:
      "Dragon Scale Mail Armor (scale mail), very rare (requires attunement) Dragon scale mail is made of the scales of one kind of dragon. Sometimes dragons collect their cast-off scales and gift them to humanoids. Other times, hunters carefully skin and preserve the hide of a dead dragon. In either case, dragon scale mail is highly valued. While wearing this armor, you gain a +1 bonus to AC, you have advantage on saving throws against the Frightful Presence and breath weapons of dragons, and you have resistance to one damage type that is determined by the kind of dragon that provided the scales (see the table). Additionally, you can focus your senses as an action to magically discern the distance and direction to the closest dragon within 30 miles of you that is of the same type as the armor. This special action can't be used again until the next dawn.",
  },
  '5.2.1': {
    wand: "Wand of the War Mage, +1, +2, or +3 Wand, Uncommon (+1), Rare (+2), or Very Rare (+3) (Requires Attunement by a Spellcaster) While holding this wand, you gain a bonus to spell attack rolls determined by the wand's rarity. In addition, you ignore Half Cover when making a spell attack roll.",
    healing:
      "Potions of Healing Potion, Rarity Varies You regain Hit Points when you drink this potion. The number of Hit Points depends on the potion's rarity, as shown in the table below. Whatever its potency, the potion's red liquid glimmers when agitated.",
    scroll:
      "Spell Scroll Scroll, Rarity Varies A Spell Scroll bears the words of a single spell, written in a mystical cipher. If the spell is on your spell list, you can read the scroll and cast its spell without Material components. Otherwise, the scroll is unintelligible. Casting the spell by reading the scroll requires the spell's normal casting time. Once the spell is cast, the scroll crumbles to dust. If the casting is interrupted, the scroll isn't lost.",
    potion:
      'Potion of Resistance Potion, Uncommon When you drink this potion, you have Resistance to one type of damage for 1 hour. The GM chooses the type or determines it randomly by rolling on the following table.',
    ring: 'Ring of Resistance Ring, Rare You have Resistance to one damage type while wearing this ring. The gemstone in the ring indicates the type, which the GM chooses or determines randomly by rolling on the following table.',
    dragon:
      "Dragon Scale Mail Armor (Scale Mail), Very Rare (Requires Attunement) Dragon Scale Mail is made of the scales of one kind of dragon. Sometimes dragons collect their cast-off scales and gift them. Other times, hunters carefully preserve the hide of a dead dragon. In either case, Dragon Scale Mail is highly valued. While wearing this armor, you gain a +1 bonus to Armor Class, you have Advantage on saving throws against the breath weapons of Dragons, and you have Resistance to one damage type determined by the kind of dragon that provided the scales (see the accompanying table). Additionally, you can focus your senses as a Magic action to discern the distance and direction to the closest dragon within 30 miles of yourself that is of the same type as the armor. This action can't be used again until the next dawn.",
  },
}
const EXACT_TEXT_REPRESENTATIONS = new Map([
  [
    'As a bonus action, you can move each sphere up to 30 feet, but no farther than 120 feet away from you. When a creature other than you comes within 5 feet of a sphere, the sphere discharges lightning at that creature and disappears. That creature must make a {@dc 15} Dexterity saving throw. On a failed save, the creature takes lightning damage based on the number of spheres you created. (4 spheres = {@damage 2d4}, 3 spheres = {@damage 2d6}, 2 spheres = {@damage 5d4}, 1 sphere = {@damage 4d12})',
    [
      'As a bonus action, you can move each sphere up to 30 feet, but no farther than 120 feet away from you. When a creature other than you comes within 5 feet of a sphere, the sphere discharges lightning at that creature and disappears. That creature must make a DC 15 Dexterity saving throw. On a failed save, the creature takes lightning damage based on the number of spheres you created.',
      'Spheres Lightning Damage 4 2d4 3 2d6 2 5d4 1 4d12',
    ],
  ],
])

function collectLongStrings(value, path, output) {
  if (typeof value === 'string') {
    const exactRepresentation = EXACT_TEXT_REPRESENTATIONS.get(value)
    if (exactRepresentation) {
      exactRepresentation.forEach((text, index) => {
        output.push({
          path: `${path}.__exactRepresentation[${index}]`,
          text: normalizeAuditText(text),
        })
      })
      return
    }
    for (const fragment of splitEvidence(value)) output.push({ path, text: fragment })
    return
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries())
      collectLongStrings(entry, `${path}[${index}]`, output)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value)) {
    if (NON_PROSE_EVIDENCE_FIELDS.has(key) || (path === '$' && ROOT_IDENTITY_FIELDS.has(key))) {
      continue
    }
    collectLongStrings(entry, path === '$' ? `$.${key}` : `${path}.${key}`, output)
  }
}

function referenceName(value) {
  if (typeof value === 'string') return value.split('|')[0]
  if (value && typeof value === 'object' && typeof value.uid === 'string') {
    return value.uid.split('|')[0]
  }
  return ''
}

function formatCopperValue(value) {
  if (!Number.isFinite(value)) return ''
  if (value % 100 === 0) return `${(value / 100).toLocaleString('en-US')} GP`
  if (value % 10 === 0) return `${value / 10} SP`
  return `${value} CP`
}

function formatWeight(value) {
  if (!Number.isFinite(value) || value === 0) return ''
  if (value === 0.25) return '1/4 lb.'
  if (value === 0.5) return '1/2 lb.'
  if (value === 1.5) return '1½ lb.'
  return `${value} lb.`
}

function formatTableNumber(value) {
  if (!Number.isFinite(value)) return ''
  if (value === 0.5) return '½'
  if (value === 1.5) return '1½'
  if (value === 2.5) return '2½'
  return value.toLocaleString('en-US')
}

function formatWeaponProperty(property, record, srdVersion) {
  const code = referenceName(property)
  if (code === 'A') {
    const ammunitionType = referenceName(record.ammoType).split(' ').filter(Boolean).at(-1)
    const ammunition =
      srdVersion === '5.2.1' && ammunitionType
        ? `; ${ammunitionType.replace(/^./, (letter) => letter.toUpperCase())}`
        : ''
    return `Ammunition (Range ${record.range}${ammunition})`
  }
  if (code === 'T') return `Thrown (Range ${record.range})`
  if (code === 'V') return `Versatile (${record.dmg2})`
  const name = WEAPON_PROPERTY_NAMES.get(code) ?? code
  return property && typeof property === 'object' && typeof property.note === 'string'
    ? `${name} (${property.note})`
    : name
}

function collectStructuredEvidence(record, collection, srdVersion) {
  if (collection === 'deity' && srdVersion === '5.1' && typeof record?.name === 'string') {
    return [
      {
        path: '$.__structuredDeityRow',
        text: normalizeAuditText(
          [
            record.name,
            record.title,
            Array.isArray(record.alignment) ? record.alignment.join('') : '',
            Array.isArray(record.domains) ? record.domains.join(' ') : '',
            record.symbol,
          ]
            .filter(Boolean)
            .join(' '),
        ),
      },
    ]
  }
  if (collection === 'language' && typeof record?.name === 'string') {
    if (srdVersion === '5.2.1') {
      const table =
        record.type === 'standard' && SRD_521_STANDARD_LANGUAGES.has(record.name)
          ? SRD_521_STANDARD_LANGUAGE_TABLE
          : record.type === 'rare' && SRD_521_RARE_LANGUAGES.has(record.name)
            ? SRD_521_RARE_LANGUAGE_TABLE
            : undefined
      return table ? [{ path: '$.__structuredLanguageTable', text: normalizeAuditText(table) }] : []
    }
    const fields = [
      record.name,
      Array.isArray(record.typicalSpeakers)
        ? record.typicalSpeakers.map((speaker) => toAuditText(speaker)).join(', ')
        : '',
      record.script,
    ]
    return [
      {
        path: '$.__structuredLanguageRow',
        text: normalizeAuditText(fields.filter(Boolean).join(' ')),
      },
    ]
  }
  if (collection !== 'baseitem' && collection !== 'item') return []
  if (collection !== 'baseitem' || record?.weapon !== true) {
    if (typeof record?.name !== 'string') return []
    if (
      collection === 'baseitem' &&
      (record.armor === true || referenceName(record.type) === 'S')
    ) {
      const armorType = referenceName(record.type)
      const name = srdVersion === '5.1' ? record.name.replace(/ Armor$/, '') : record.name
      const armorClass =
        armorType === 'S'
          ? `+${record.ac}`
          : armorType === 'LA'
            ? `${record.ac} + Dex modifier`
            : armorType === 'MA'
              ? `${record.ac} + Dex modifier (max 2)`
              : String(record.ac ?? '')
      const fields = [
        name,
        armorClass,
        record.strength ? `Str ${record.strength}` : '',
        record.stealth ? 'Disadvantage' : '',
        formatWeight(record.weight),
        formatCopperValue(record.value),
      ]
      if (srdVersion === '5.1') {
        fields.splice(1, 0, fields.pop())
      }
      const text = normalizeAuditText(fields.filter(Boolean).join(' '))
      return [{ path: '$.__structuredArmorRow', text }]
    }
    if (srdVersion === '5.2.1') {
      const ammunitionPack = SRD_521_AMMUNITION_PACKS.get(record.name)
      if (ammunitionPack) {
        return [
          {
            path: '$.__structuredEquipmentRow',
            text: normalizeAuditText(
              [
                ammunitionPack.name,
                ammunitionPack.amount,
                ammunitionPack.storage,
                formatWeight(record.weight * ammunitionPack.multiplier),
                formatCopperValue(record.value * ammunitionPack.multiplier),
              ].join(' '),
            ),
          },
        ]
      }
      const focusName = SRD_521_FOCUS_TABLE_NAMES.get(record.name)
      if (focusName) {
        return [
          {
            path: '$.__structuredEquipmentRow',
            text: normalizeAuditText(
              [focusName, formatWeight(record.weight), formatCopperValue(record.value)].join(' '),
            ),
          },
        ]
      }
      if (record.rarity !== 'none') return []
      const type = referenceName(record.type)
      if (type === 'SHP') {
        return [
          {
            path: '$.__structuredVehicleRow',
            text: normalizeAuditText(
              [
                record.name,
                `${formatTableNumber(record.vehSpeed)} MPH`,
                formatTableNumber(record.crew),
                formatTableNumber(record.capPassenger),
                formatTableNumber(record.capCargo),
                formatTableNumber(record.vehAc),
                formatTableNumber(record.vehHp),
                formatTableNumber(record.vehDmgThresh),
                formatCopperValue(record.value),
              ]
                .filter(Boolean)
                .join(' '),
            ),
          },
        ]
      }
      const tableName = SRD_521_EQUIPMENT_TABLE_NAMES.get(record.name) ?? record.name
      const fields =
        type === 'MNT'
          ? [
              tableName,
              Number.isFinite(record.carryingCapacity)
                ? `${record.carryingCapacity.toLocaleString('en-US')} lb.`
                : '',
              formatCopperValue(record.value),
            ]
          : [tableName, formatWeight(record.weight), formatCopperValue(record.value)]
      return [
        {
          path: '$.__structuredEquipmentRow',
          text: normalizeAuditText(fields.filter(Boolean).join(' ')),
        },
      ]
    }
    if (srdVersion !== '5.1') return []
    if (referenceName(record.type) === 'TG' && Number.isFinite(record.value)) {
      const row = SRD_51_TRADE_GOODS_ROWS.get(record.value)
      return row ? [{ path: '$.__structuredTradeGoodsRow', text: normalizeAuditText(row) }] : []
    }
    const ammunitionPack = SRD_51_AMMUNITION_PACKS.get(record.name)
    const quantity = ammunitionPack?.quantity ?? 1
    const text = normalizeAuditText(
      [
        ammunitionPack?.name ?? record.name,
        formatCopperValue(record.value * quantity),
        formatWeight(record.weight * quantity),
      ]
        .filter(Boolean)
        .join(' '),
    )
    return text ? [{ path: '$.__structuredEquipmentRow', text }] : []
  }
  const damageType = WEAPON_DAMAGE_TYPES.get(record.dmgType) ?? record.dmgType ?? ''
  const properties = Array.isArray(record.property)
    ? record.property
        .map((property) => formatWeaponProperty(property, record, srdVersion))
        .join(', ')
    : ''
  const mastery = Array.isArray(record.mastery) ? referenceName(record.mastery[0]) : ''
  const weight = formatWeight(record.weight)
  const cost = formatCopperValue(record.value)
  const name =
    srdVersion === '5.1'
      ? (SRD_51_CROSSBOW_TABLE_NAMES.get(record.name) ?? record.name)
      : record.name
  const fields =
    srdVersion === '5.2.1'
      ? [name, record.dmg1, damageType, properties, mastery, weight, cost]
      : [name, cost, record.dmg1, damageType, weight, properties]
  const text = normalizeAuditText(fields.filter(Boolean).join(' '))
  return text.split(' ').length >= MIN_FRAGMENT_WORDS
    ? [{ path: '$.__structuredWeaponRow', text }]
    : []
}

function exactGeneratedMagicItemEvidence(record, srdVersion) {
  if (!GENERATED_MAGIC_ITEM_PARENT_TEXT[srdVersion]) return undefined

  const wandMatch = record?.name?.match(/^\+(\d) Wand of the War Mage$/)
  const wandBonus = wandMatch ? Number(wandMatch[1]) : undefined
  const wandRarity = MAGIC_ITEM_BONUS_RARITIES.get(wandBonus)
  if (wandRarity) {
    const expected = {
      bonusSpellAttack: `+${wandBonus}`,
      entries: [
        srdVersion === '5.1'
          ? `While you are holding this wand, you gain a +${wandBonus} bonus to spell attack rolls. In addition, you ignore {@quickref Cover||3||half cover} when making a spell attack.`
          : `While holding this wand, you gain a +${wandBonus} bonus to spell attack rolls. In addition, you ignore {@variantrule Cover|XPHB|Half Cover} when making a spell attack roll.`,
      ],
      name: record.name,
      rarity: wandRarity,
      reqAttune: 'by a spellcaster',
      source: srdVersion === '5.1' ? 'DMG' : 'XDMG',
      ...(srdVersion === '5.1' ? { srd: true } : { srd52: true }),
      type: srdVersion === '5.1' ? 'WD|DMG' : 'WD|XDMG',
      weight: 1,
    }
    if (stableJson(record) !== stableJson(expected)) return undefined
    return [
      {
        path: '$.__exactGeneratedMagicItemParent',
        text: normalizeAuditText(GENERATED_MAGIC_ITEM_PARENT_TEXT[srdVersion].wand),
      },
    ]
  }

  const healingVariant = HEALING_POTION_VARIANTS.get(record?.name)
  if (healingVariant) {
    const commonPotion = record.name === 'Potion of Healing'
    const expected = {
      entries: [
        srdVersion === '5.1'
          ? `You regain {@dice ${healingVariant.dice}} hit points when you drink this potion. The potion's red liquid glimmers when agitated.`
          : commonPotion
            ? `This potion is a magic item. As a {@variantrule Bonus Action|XPHB}, you can drink it or administer it to another creature within 5 feet of yourself. The creature that drinks the magical red fluid in this vial regains {@dice ${healingVariant.dice}} {@variantrule Hit Points|XPHB}. The potion's red liquid glimmers when agitated.`
            : `You regain {@dice ${healingVariant.dice}} {@variantrule Hit Points|XPHB} when you drink this potion. The potion's red liquid glimmers when agitated.`,
      ],
      name: record.name,
      rarity: healingVariant.rarity,
      source: srdVersion === '5.1' ? 'DMG' : 'XDMG',
      ...(srdVersion === '5.1' ? { srd: true } : { srd52: true }),
      type: srdVersion === '5.1' ? 'P' : 'P|XPHB',
      ...(commonPotion ? { value: 5000 } : {}),
      ...(commonPotion || srdVersion === '5.2.1' ? { weight: 0.5 } : {}),
    }
    if (stableJson(record) !== stableJson(expected)) return undefined
    const rowName =
      srdVersion === '5.1'
        ? healingVariant.tableName
        : commonPotion
          ? 'Potion of Healing'
          : `Potion of Healing, ${healingVariant.tableName.replace(' Healing', '')}`
    const evidence = [
      {
        path: '$.__exactGeneratedMagicItemParent',
        text: normalizeAuditText(GENERATED_MAGIC_ITEM_PARENT_TEXT[srdVersion].healing),
      },
      {
        path: '$.__exactGeneratedMagicItemRow',
        text: normalizeAuditText(
          srdVersion === '5.1'
            ? `${rowName} ${healingVariant.rarity} ${healingVariant.dice}`
            : `${rowName} ${healingVariant.dice} ${healingVariant.rarity}`,
        ),
      },
    ]
    if (srdVersion === '5.2.1' && commonPotion) {
      evidence.push({
        path: '$.__exactGeneratedMagicItemEquipmentEntry',
        text: normalizeAuditText(
          'Potion of Healing 50 GP This potion is a magic item. As a Bonus Action, you can drink it or administer it to another creature within 5 feet of yourself. The creature that drinks the magical red fluid in this vial regains 2d4 + 2 Hit Points.',
        ),
      })
    }
    return evidence
  }

  const scrollMatch =
    srdVersion === '5.1'
      ? record?.name?.match(/^Spell Scroll \((Cantrip|\d(?:st|nd|rd|th) Level)\)$/)
      : record?.name?.match(/^Spell Scroll \((Cantrip|Level \d)\)$/)
  const scrollLevel = scrollMatch
    ? scrollMatch[1] === 'Cantrip'
      ? 0
      : Number(scrollMatch[1].match(/\d/)?.[0])
    : undefined
  const scrollVariant = SPELL_SCROLL_VARIANTS.get(scrollLevel)
  if (scrollVariant) {
    const checkDc = 10 + scrollLevel
    const entries =
      srdVersion === '5.1'
        ? [
            "A spell scroll bears the words of a single spell, written as a mystical cipher. If the spell is on your class's spell list, you can read the scroll and cast its spell without providing any material components. Otherwise, the scroll is unintelligible. Casting the spell by reading the scroll requires the spell's normal casting time. Once the spell is cast, the words on the scroll fade, and it crumbles to dust. If the casting is interrupted, the scroll is not lost.",
            `If the spell is on your class's spell list but of a higher level than you can normally cast, you must make an ability check using your spellcasting ability to determine whether you cast it successfully. The DC is ${checkDc}. On a failed check, the spell disappears from the scroll with no other effect.`,
            'Once the spell is cast, the words on the scroll fade, and the scroll itself crumbles to dust.',
            `A spell cast from this scroll has a save DC of ${scrollVariant.saveDc} and an attack bonus of {@hit ${scrollVariant.attackBonus}}.`,
            ...(scrollLevel === 0
              ? []
              : [
                  `A wizard spell on a spell scroll can be copied just as spells in spellbooks can be copied. When a spell is copied from a spell scroll, the copier must succeed on a {@dc ${checkDc}} Intelligence ({@skill Arcana}) check. If the check succeeds, the spell is successfully copied. Whether the check succeeds or fails, the spell scroll is destroyed.`,
                ]),
          ]
        : [
            "A Spell Scroll bears the words of a single spell, written in a mystical cipher. If the spell is on your spell list, you can read the scroll and cast its spell without Material components. Otherwise, the scroll is unintelligible. Casting the spell by reading the scroll requires the spell's normal casting time. Once the spell is cast, the scroll crumbles to dust. If the casting is interrupted, the scroll isn't lost.",
            `If the spell is on your spell list but of a higher level than you can normally cast, you make a {@dc ${checkDc}} ability check using your spellcasting ability to determine whether you cast the spell. On a failed check, the spell disappears from the scroll with no other effect.`,
            `If the spell requires a saving throw or an attack roll, the spell save DC is ${scrollVariant.saveDc}, and the attack bonus is {@hit ${scrollVariant.attackBonus}}.`,
            ...(scrollLevel === 0
              ? []
              : [
                  {
                    entries: [
                      `A Wizard spell on a Spell Scroll can be copied into a spellbook. When a level ${scrollLevel} spell is copied in this way, the copier must succeed on a {@dc ${checkDc}} Intelligence ({@skill Arcana|XPHB}). On a successful check, the spell is copied. Whether the check succeeds or fails, the Spell Scroll is destroyed.`,
                    ],
                    name: 'Copying a Scroll into a Spellbook',
                    type: 'entries',
                  },
                ]),
          ]
    const expected = {
      entries,
      name: record.name,
      rarity: scrollVariant.rarity,
      source: srdVersion === '5.1' ? 'DMG' : 'XDMG',
      spellScrollLevel: scrollLevel,
      ...(srdVersion === '5.1' ? { srd: true } : { srd52: true }),
      type: srdVersion === '5.1' ? 'SC|DMG' : 'SC|XPHB',
      ...(srdVersion === '5.2.1' && scrollLevel === 0
        ? { value: 3000 }
        : srdVersion === '5.2.1' && scrollLevel === 1
          ? { value: 5000 }
          : {}),
    }
    if (stableJson(record) !== stableJson(expected)) return undefined
    const tableLevel =
      scrollLevel === 0
        ? 'Cantrip'
        : srdVersion === '5.1'
          ? scrollMatch[1].replace(' Level', '')
          : String(scrollLevel)
    return [
      {
        path: '$.__exactGeneratedMagicItemParent',
        text: normalizeAuditText(GENERATED_MAGIC_ITEM_PARENT_TEXT[srdVersion].scroll),
      },
      {
        path: '$.__exactGeneratedMagicItemRow',
        text: normalizeAuditText(
          `${tableLevel} ${scrollVariant.rarity} ${scrollVariant.saveDc} +${scrollVariant.attackBonus}`,
        ),
      },
    ]
  }

  const potionMatch = record?.name?.match(/^Potion of (.+) Resistance$/)
  const potionVariant = potionMatch && RESISTANCE_VARIANTS.get(potionMatch[1])
  if (potionVariant) {
    const expected =
      srdVersion === '5.1'
        ? {
            entries: [
              `When you drink this potion, you gain resistance to ${potionVariant.damage} damage for 1 hour.`,
            ],
            name: record.name,
            rarity: 'uncommon',
            resist: [potionVariant.damage],
            source: 'DMG',
            srd: true,
            type: 'P',
          }
        : {
            entries: [
              `When you drink this potion, you have {@variantrule Resistance|XPHB} to ${potionVariant.damage} damage for 1 hour.`,
            ],
            name: record.name,
            rarity: 'uncommon',
            resist: [potionVariant.damage],
            source: 'XDMG',
            srd52: true,
            type: 'P|XPHB',
            weight: 0.5,
          }
    if (stableJson(record) !== stableJson(expected)) return undefined
    return [
      {
        path: '$.__exactGeneratedMagicItemParent',
        text: normalizeAuditText(GENERATED_MAGIC_ITEM_PARENT_TEXT[srdVersion].potion),
      },
      {
        path: '$.__exactGeneratedMagicItemRow',
        text: normalizeAuditText(`${potionVariant.roll} ${potionMatch[1]}`),
      },
    ]
  }

  const ringMatch = record?.name?.match(/^Ring of (.+) Resistance$/)
  const ringVariant = ringMatch && RESISTANCE_VARIANTS.get(ringMatch[1])
  if (ringVariant) {
    const expected =
      srdVersion === '5.1'
        ? {
            detail1: ringVariant.gem.toLowerCase(),
            entries: [
              `You have resistance to ${ringVariant.damage} damage while wearing this ring. The ring is set with ${ringVariant.gem.toLowerCase()}.`,
            ],
            name: record.name,
            rarity: 'rare',
            reqAttune: true,
            resist: [ringVariant.damage],
            source: 'DMG',
            srd: true,
            type: 'RG|DMG',
          }
        : {
            detail1: ringVariant.gem.toLowerCase(),
            entries: [
              `You have {@variantrule Resistance|XPHB} to ${ringVariant.damage} damage while wearing this ring. The ring is set with ${ringVariant.gem.toLowerCase()}.`,
            ],
            name: record.name,
            rarity: 'rare',
            resist: [ringVariant.damage],
            source: 'XDMG',
            srd52: true,
            type: 'RG|XDMG',
          }
    if (stableJson(record) !== stableJson(expected)) return undefined
    return [
      {
        path: '$.__exactGeneratedMagicItemParent',
        text: normalizeAuditText(GENERATED_MAGIC_ITEM_PARENT_TEXT[srdVersion].ring),
      },
      {
        path: '$.__exactGeneratedMagicItemRow',
        text: normalizeAuditText(`${ringVariant.roll} ${ringMatch[1]} ${ringVariant.gem}`),
      },
    ]
  }

  const dragonMatch = record?.name?.match(/^(.+) Dragon Scale Mail$/)
  const dragonVariant = dragonMatch && DRAGON_SCALE_VARIANTS.get(dragonMatch[1])
  if (!dragonVariant) return undefined
  const color = dragonMatch[1].toLowerCase()
  const expected =
    srdVersion === '5.1'
      ? {
          ac: 14,
          bonusAc: '+1',
          entries: [
            `Dragon scale mail is made of the scales of one kind of dragon. Sometimes dragons collect their cast-off scales and gift them to humanoids. Other times, hunters carefully skin and preserve the hide of a dead dragon. In either case, dragon scale mail is highly valued. While wearing this armor, you gain a +1 bonus to AC, you have advantage on saving throws against the Frightful Presence and breath weapons of dragons, and you have resistance to ${dragonVariant.damage} damage.`,
            `Additionally, you can focus your senses as an action to magically discern the distance and direction to the closest ${color} dragon within 30 miles of you. This special action can't be used again until the next dawn.`,
          ],
          name: record.name,
          rarity: 'very rare',
          reqAttune: true,
          resist: [dragonVariant.damage],
          source: 'DMG',
          srd: true,
          stealth: true,
          type: 'MA',
          weight: 45,
        }
      : {
          ac: 14,
          baseItem: 'scale mail|xphb',
          bonusAc: '+1',
          detail1: color,
          entries: [
            'Dragon Scale Mail is made of the scales of one kind of dragon. Sometimes dragons collect their cast-off scales and gift them. Other times, hunters carefully preserve the hide of a dead dragon. In either case, Dragon Scale Mail is highly valued.',
            `While wearing this armor, you gain a +1 bonus to {@variantrule Armor Class|XPHB}, you have {@variantrule Advantage|XPHB} on saving throws against the breath weapons of Dragons, and you have {@variantrule Resistance|XPHB} to ${dragonVariant.damage} damage.`,
            `Additionally, you can focus your senses as a {@action Magic|XPHB} action to discern the distance and direction to the closest ${color} dragon within 30 miles of yourself. This action can't be used again until the next dawn.`,
          ],
          name: record.name,
          rarity: 'very rare',
          reqAttune: true,
          resist: [dragonVariant.damage],
          source: 'XDMG',
          srd52: true,
          stealth: true,
          type: 'MA|XPHB',
          weight: 45,
        }
  if (stableJson(record) !== stableJson(expected)) return undefined
  return [
    {
      path: '$.__exactGeneratedMagicItemParent',
      text: normalizeAuditText(GENERATED_MAGIC_ITEM_PARENT_TEXT[srdVersion].dragon),
    },
    {
      path: '$.__exactGeneratedMagicItemRow',
      text: normalizeAuditText(`${dragonMatch[1]} ${dragonVariant.damage}`),
    },
  ]
}

function collectExactRepresentationEvidence(record, collection, srdVersion) {
  if (collection === 'item') {
    const generatedMagicItemEvidence = exactGeneratedMagicItemEvidence(record, srdVersion)
    if (generatedMagicItemEvidence) return generatedMagicItemEvidence
  }
  if (collection !== 'action' || record?.name !== 'Don or Doff a Shield') return undefined
  const expectedEntry =
    srdVersion === '5.1'
      ? "The time it takes to don or doff armor {@table Getting Into and Out of Armor; Donning and Doffing Armor|phb|depends on the armor's category}. A {@item shield|phb} can be donned or doffed as an action."
      : srdVersion === '5.2.1'
        ? 'A {@item Shield|XPHB} can be donned or doffed as an action.'
        : undefined
  if (!expectedEntry || record.entries?.length !== 1 || record.entries[0] !== expectedEntry) {
    return undefined
  }
  const row =
    srdVersion === '5.1'
      ? 'Shield 1 action 1 action'
      : 'Shield Utilize action to don or doff Shield'
  return [{ path: '$.__exactShieldActionRepresentation', text: normalizeAuditText(row) }]
}

export function collectRecordEvidence(record, metadata = {}) {
  const exactRepresentation = collectExactRepresentationEvidence(
    record,
    metadata.collection,
    metadata.srdVersion,
  )
  if (exactRepresentation) return exactRepresentation
  const fragments = []
  collectLongStrings(record, '$', fragments)
  const structuredEvidence = collectStructuredEvidence(
    record,
    metadata.collection,
    metadata.srdVersion,
  )
  fragments.push(
    ...structuredEvidence.filter(
      ({ path }) =>
        fragments.length === 0 ||
        (path !== '$.__structuredEquipmentRow' && path !== '$.__structuredLanguageRow'),
    ),
  )
  const seen = new Set()
  return fragments.filter(({ text }) => {
    const fingerprint = sha256(text)
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

export function createDocumentCorpus(version, sha256Hash, pages) {
  const normalizedHeader = normalizeAuditText(`System Reference Document ${version}`)
  const normalizedPages = pages.map((text, index) => {
    const normalizedText = normalizeAuditText(text, { pdfText: true }).replace(
      new RegExp(`^${normalizedHeader.replaceAll(' ', '\\s+')}\\s+${index + 1}\\s+`),
      '',
    )
    return {
      page: index + 1,
      text: normalizedText,
      compactText: normalizedText.replaceAll(' ', ''),
    }
  })
  const tokenPages = new Map()
  for (const { page, text } of normalizedPages) {
    for (const token of new Set(text.split(' ').filter(isSearchToken))) {
      const matches = tokenPages.get(token) ?? []
      matches.push(page)
      tokenPages.set(token, matches)
    }
  }
  return {
    version,
    sha256: sha256Hash,
    pages: normalizedPages,
    tokenPages,
  }
}

function isSearchToken(token) {
  return token.length >= 4 && !SEARCH_STOP_WORDS.has(token)
}

function findFragmentPages(corpus, fragment) {
  const directMatches = corpus.pages
    .filter(({ text }) => text.includes(fragment))
    .map(({ page }) => page)
  if (directMatches.length > 0) return directMatches

  // PDF extraction sometimes joins or separates a compound word at a visual line break. Require
  // the complete normalized fragment to match after removing only spaces before treating that
  // layout artifact as equivalent.
  const compactFragment = fragment.replaceAll(' ', '')
  const compactMatches = corpus.pages
    .filter(({ compactText }) => compactText.includes(compactFragment))
    .map(({ page }) => page)
  if (compactMatches.length > 0) return compactMatches

  for (let index = 0; index < corpus.pages.length - 1; index += 1) {
    const current = corpus.pages[index]
    const next = corpus.pages[index + 1]
    if (`${current.text} ${next.text}`.includes(fragment)) return [current.page, next.page]
    if (`${current.compactText}${next.compactText}`.includes(compactFragment)) {
      return [current.page, next.page]
    }
  }
  return []
}

function findLikelyPages(corpus, fragment) {
  const tokens = [...new Set(fragment.split(' ').filter(isSearchToken))]
  if (tokens.length === 0) return []
  const scores = new Map()
  for (const token of tokens) {
    for (const page of corpus.tokenPages.get(token) ?? []) {
      scores.set(page, (scores.get(page) ?? 0) + 1)
    }
  }
  return [...scores.entries()]
    .map(([page, matches]) => ({ page, tokenCoverage: matches / tokens.length }))
    .filter(({ tokenCoverage }) => tokenCoverage >= 0.35)
    .sort((left, right) => right.tokenCoverage - left.tokenCoverage || left.page - right.page)
    .slice(0, 3)
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length]
}

function findClosestExcerpt(corpus, fragment, likelyPages) {
  const fragmentTokens = fragment.split(' ').filter(Boolean)
  if (fragmentTokens.length < MIN_FRAGMENT_WORDS || likelyPages.length === 0) return undefined
  const searchableTokens = fragmentTokens.filter(isSearchToken)
  const anchor = [...new Set(searchableTokens)].sort(
    (left, right) =>
      (corpus.tokenPages.get(left)?.length ?? Number.MAX_SAFE_INTEGER) -
      (corpus.tokenPages.get(right)?.length ?? Number.MAX_SAFE_INTEGER),
  )[0]
  if (!anchor) return undefined
  const fragmentAnchorIndex = fragmentTokens.indexOf(anchor)
  let best

  for (const { page } of likelyPages.slice(0, 1)) {
    const pageText = corpus.pages[page - 1]?.text
    if (!pageText) continue
    const pageTokens = pageText.split(' ').filter(Boolean)
    const anchorIndexes = pageTokens
      .map((token, index) => (token === anchor ? index : -1))
      .filter((index) => index >= 0)
      .slice(0, 12)
    for (const anchorIndex of anchorIndexes) {
      const expectedStart = anchorIndex - fragmentAnchorIndex
      for (let startOffset = -2; startOffset <= 2; startOffset += 1) {
        const start = Math.max(0, expectedStart + startOffset)
        for (let lengthOffset = -3; lengthOffset <= 3; lengthOffset += 1) {
          const length = Math.max(MIN_FRAGMENT_WORDS, fragmentTokens.length + lengthOffset)
          const excerptTokens = pageTokens.slice(start, start + length)
          if (excerptTokens.length < MIN_FRAGMENT_WORDS) continue
          const distance = editDistance(fragmentTokens, excerptTokens)
          const similarity = 1 - distance / Math.max(fragmentTokens.length, excerptTokens.length)
          if (!best || similarity > best.similarity) {
            best = { page, similarity, text: excerptTokens.join(' ') }
          }
        }
      }
    }
  }
  return best
}

function evidenceHash(recordSha256, path, text) {
  return sha256(`${recordSha256}\n${path}\n${text}`)
}

function approvalKey(documentSha256, recordSha256, fragmentSha256) {
  return `${documentSha256}:${recordSha256}:${fragmentSha256}`
}

function buildApprovalMap(approvals) {
  if (approvals?.schemaVersion !== 1 || !Array.isArray(approvals.exceptions)) {
    throw new Error(
      'Provenance exceptions must use schema version 1 and contain an exceptions array.',
    )
  }
  const output = new Map()
  for (const approval of approvals.exceptions) {
    if (
      !/^[a-f0-9]{64}$/.test(approval.documentSha256) ||
      !/^[a-f0-9]{64}$/.test(approval.recordSha256) ||
      !/^[a-f0-9]{64}$/.test(approval.fragmentSha256) ||
      typeof approval.officialLocation !== 'string' ||
      approval.officialLocation.trim() === '' ||
      typeof approval.reason !== 'string' ||
      approval.reason.trim() === ''
    ) {
      throw new Error(
        'Every provenance exception must bind document, record, and fragment hashes and explain its official location and reason.',
      )
    }
    const key = approvalKey(approval.documentSha256, approval.recordSha256, approval.fragmentSha256)
    if (output.has(key)) throw new Error(`Duplicate provenance exception approval ${key}.`)
    output.set(key, approval)
  }
  return output
}

export function auditProvenanceRecords({
  records,
  corpora,
  approvals = { schemaVersion: 1, exceptions: [] },
}) {
  const approvalMap = buildApprovalMap(approvals)
  const usedApprovals = new Set()
  const auditedRecords = records.map(({ record, ...metadata }) => {
    const corpus = corpora.get(metadata.srdVersion)
    if (!corpus) throw new Error(`No verified SRD ${metadata.srdVersion} document was supplied.`)
    const collectedEvidence = collectRecordEvidence(record, metadata)
    if (collectedEvidence.length === 0) {
      collectedEvidence.push({
        path: '$',
        text: '[No sufficiently long textual evidence; inspect the complete structured record.]',
      })
    }
    const evidence = collectedEvidence.map(({ path, text }) => {
      const pages = findFragmentPages(corpus, text)
      const fragmentSha256 = evidenceHash(metadata.recordSha256, path, text)
      const key = approvalKey(corpus.sha256, metadata.recordSha256, fragmentSha256)
      const approval = approvalMap.get(key)
      if (pages.length > 0) return { path, text, fragmentSha256, status: 'matched', pages }
      if (approval) {
        usedApprovals.add(key)
        return {
          path,
          text,
          fragmentSha256,
          status: 'approved-exception',
          officialLocation: approval.officialLocation,
          reason: approval.reason,
        }
      }
      const likelyPages = findLikelyPages(corpus, text)
      return {
        path,
        text,
        fragmentSha256,
        status: 'needs-review',
        likelyPages,
        closestExcerpt: findClosestExcerpt(corpus, text, likelyPages),
      }
    })
    const unmatchedCount = evidence.filter(({ status }) => status === 'needs-review').length
    const approvedExceptionCount = evidence.filter(
      ({ status }) => status === 'approved-exception',
    ).length
    const status =
      unmatchedCount > 0
        ? 'needs-review'
        : approvedExceptionCount > 0
          ? 'approved-with-exceptions'
          : 'matched'
    const matchedPages = [...new Set(evidence.flatMap(({ pages = [] }) => pages))].sort(
      (left, right) => left - right,
    )
    return {
      ...metadata,
      status,
      evidenceCount: evidence.length,
      unmatchedCount,
      approvedExceptionCount,
      matchedPages,
      evidence,
    }
  })
  const staleApprovals = (approvals?.exceptions ?? []).filter(
    (approval) =>
      !usedApprovals.has(
        approvalKey(approval.documentSha256, approval.recordSha256, approval.fragmentSha256),
      ),
  )
  return { records: auditedRecords, staleApprovals }
}

async function loadPdfPages(path) {
  const bytes = new Uint8Array(await readFile(path))
  const document = await getDocument({ data: bytes, disableWorker: true }).promise
  try {
    const pages = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      pages.push(joinPdfTextItems(content.items))
    }
    return pages
  } finally {
    await document.destroy()
  }
}

export function joinPdfTextItems(items) {
  let output = ''
  let previous
  let separator = ''
  for (const item of items) {
    const text = typeof item?.str === 'string' ? item.str : ''
    if (text.trim() === '') {
      if (item?.hasEOL) separator = '\n'
      else if (text !== '') separator = separator || ' '
      continue
    }

    if (previous) {
      const sameLine = Math.abs((item.transform?.[5] ?? 0) - (previous.transform?.[5] ?? 0)) < 0.5
      const previousEnd = (previous.transform?.[4] ?? 0) + (previous.width ?? 0)
      const horizontalGap = (item.transform?.[4] ?? 0) - previousEnd
      const joinsSplitWord =
        sameLine &&
        horizontalGap >= -0.5 &&
        horizontalGap <= Math.max(0.5, (item.height ?? 0) * 0.08)
      output += separator || (joinsSplitWord ? '' : ' ')
    }
    output += text
    previous = item
    separator = item.hasEOL ? '\n' : ''
  }
  return output.trim()
}

export async function loadVerifiedDocument(documentMetadata, path) {
  const contents = await readFile(path)
  const actualHash = createHash('sha256').update(contents).digest('hex')
  if (actualHash !== documentMetadata.sha256) {
    throw new Error(
      `SRD ${documentMetadata.version} PDF hash mismatch: expected ${documentMetadata.sha256}, received ${actualHash}.`,
    )
  }
  return createDocumentCorpus(documentMetadata.version, actualHash, await loadPdfPages(path))
}

async function resolveManifestRecords(reviewRoot, manifest) {
  const fileCache = new Map()
  const records = []
  for (const metadata of manifest.coverage?.records ?? []) {
    let payload = fileCache.get(metadata.relativePath)
    if (!payload) {
      payload = JSON.parse(
        await readFile(join(reviewRoot, ...metadata.relativePath.split('/')), 'utf8'),
      )
      fileCache.set(metadata.relativePath, payload)
    }
    const candidates = Array.isArray(payload?.[metadata.collection])
      ? payload[metadata.collection]
      : []
    const matches = candidates.filter(
      (record) => sha256(stableJson(record)) === metadata.recordSha256,
    )
    if (matches.length !== 1) {
      throw new Error(
        `Could not resolve exactly one ${metadata.collection}:${metadata.identity} record in ${metadata.relativePath}.`,
      )
    }
    records.push({ ...metadata, record: matches[0] })
  }
  return records
}

function summarize(records, staleApprovalCount) {
  return {
    totalRecords: records.length,
    matchedRecords: records.filter(({ status }) => status === 'matched').length,
    approvedWithExceptions: records.filter(({ status }) => status === 'approved-with-exceptions')
      .length,
    recordsNeedingReview: records.filter(({ status }) => status === 'needs-review').length,
    matchedEvidence: records.reduce(
      (count, record) =>
        count + record.evidence.filter(({ status }) => status === 'matched').length,
      0,
    ),
    approvedExceptions: records.reduce(
      (count, record) =>
        count + record.evidence.filter(({ status }) => status === 'approved-exception').length,
      0,
    ),
    evidenceNeedingReview: records.reduce((count, record) => count + record.unmatchedCount, 0),
    staleApprovals: staleApprovalCount,
  }
}

export async function auditSrdSnapshot({ reviewRoot, documentPaths, approvals }) {
  const manifest = JSON.parse(await readFile(join(reviewRoot, 'manifest.json'), 'utf8'))
  if (!Array.isArray(manifest.coverage?.records)) {
    throw new Error('SRD review manifest has no record inventory.')
  }
  const corpora = new Map()
  for (const documentMetadata of manifest.documents ?? []) {
    const path = documentPaths.get(documentMetadata.version)
    if (!path) throw new Error(`Missing PDF path for SRD ${documentMetadata.version}.`)
    corpora.set(documentMetadata.version, await loadVerifiedDocument(documentMetadata, path))
  }
  const resolvedRecords = await resolveManifestRecords(reviewRoot, manifest)
  const audit = auditProvenanceRecords({ records: resolvedRecords, corpora, approvals })
  return {
    schemaVersion: 1,
    auditVersion: PROVENANCE_AUDIT_VERSION,
    packId: manifest.packId,
    packVersion: manifest.packVersion,
    upstreamRevision: manifest.upstreamRevision,
    documents: [...corpora.values()].map(({ version, sha256: hash, pages }) => ({
      version,
      sha256: hash,
      pageCount: pages.length,
    })),
    summary: summarize(audit.records, audit.staleApprovals.length),
    staleApprovals: audit.staleApprovals,
    records: audit.records,
  }
}

export function buildProvenanceExceptionCsv(report) {
  const columns = [
    'relativePath',
    'collection',
    'identity',
    'srdVersion',
    'recordSha256',
    'recordStatus',
    'evidencePath',
    'fragmentSha256',
    'unmatchedText',
    'likelyPages',
    'closestOfficialText',
    'closestSimilarity',
    'officialLocation',
    'reason',
  ]
  const rows = []
  for (const record of report.records) {
    const reviewEvidence = record.evidence.filter(({ status }) => status !== 'matched')
    for (const evidence of reviewEvidence) {
      rows.push({
        ...record,
        evidencePath: evidence.path,
        fragmentSha256: evidence.fragmentSha256,
        unmatchedText: evidence.text,
        likelyPages: evidence.likelyPages
          ?.map(({ page, tokenCoverage }) => `${page} (${Math.round(tokenCoverage * 100)}%)`)
          .join('; '),
        closestOfficialText: evidence.closestExcerpt?.text,
        closestSimilarity:
          evidence.closestExcerpt && `${Math.round(evidence.closestExcerpt.similarity * 100)}%`,
        officialLocation: evidence.officialLocation,
        reason: evidence.reason,
      })
    }
  }
  return `${[
    columns.map(csvCell).join(','),
    ...rows.map((row) =>
      [
        row.relativePath,
        row.collection,
        row.identity,
        row.srdVersion,
        row.recordSha256,
        row.status,
        row.evidencePath,
        row.fragmentSha256,
        row.unmatchedText,
        row.likelyPages,
        row.closestOfficialText,
        row.closestSimilarity,
        row.officialLocation,
        row.reason,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n')}\n`
}
