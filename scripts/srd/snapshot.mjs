import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

export const EXTRACTOR_VERSION = 1

const ROOT_COLLECTIONS = {
  'actions.json': ['action'],
  'backgrounds.json': ['background'],
  'conditionsdiseases.json': ['condition', 'disease', 'status'],
  'cultsboons.json': ['cult', 'boon'],
  'deities.json': ['deity'],
  'feats.json': ['feat'],
  'items.json': ['item', 'itemGroup'],
  'languages.json': ['language'],
  'optionalfeatures.json': ['optionalfeature'],
  'races.json': ['race', 'subrace'],
  'rewards.json': ['reward'],
  'senses.json': ['sense'],
  'skills.json': ['skill'],
  'trapshazards.json': ['trap', 'hazard'],
  'variantrules.json': ['variantrule'],
}

const CLASS_COLLECTIONS = ['class', 'subclass', 'classFeature', 'subclassFeature']
const REFERENCE_DEPENDENCY_FILES = ['feats.json', 'optionalfeatures.json']
const DEFERRED_ROOT_FILES = new Set([...REFERENCE_DEPENDENCY_FILES, 'items.json'])
const ALLOWED_SPELL_CLASS_SOURCES = new Set(['PHB', 'XPHB'])
const SRD_MARKER_VERSIONS = new Map([
  ['srd', '5.1'],
  ['srd52', '5.2.1'],
])
const STRIPPED_METADATA_KEYS = new Set([
  'additionalEntries',
  'additionalSources',
  'basicRules',
  'basicRules2024',
  'hasFluff',
  'hasFluffImages',
  'hasRefs',
  'lootTables',
  'miscTags',
  'origin',
  'otherSources',
  'page',
  'referenceSources',
  'reprintedAs',
  'reqAttuneTags',
  'soundClip',
  'tier',
])
const PROHIBITED_PRESENTATION_KEYS = new Set([
  'fluff',
  'fluffimages',
  'foundryimg',
  'image',
  'images',
  'token',
  'tokenurl',
])
const XPHB_AMMUNITION_RECORDS = new Set([
  'Arrow',
  'Arrows (20)',
  'Bolt',
  'Bolts (20)',
  'Needle',
  'Needles (50)',
  'Sling Bullet',
  'Sling Bullets (20)',
])
const SRD_51_DEITY_DOMAINS = new Set([
  'Death',
  'Knowledge',
  'Life',
  'Light',
  'Nature',
  'Tempest',
  'Trickery',
  'War',
])
const SRD_51_IRON_FLASK_ENTRIES = [
  "This iron bottle has a brass stopper. You can use an action to speak the flask's command word, targeting a creature that you can see within 60 feet of you. If the target is native to a plane of existence other than the one you're on, the target must succeed on a {@dc 17} Wisdom saving throw or be trapped in the flask. If the target has been trapped by the flask before, it has advantage on the saving throw. Once trapped, a creature remains in the flask until released. The flask can hold only one creature at a time. A creature trapped in the flask doesn't need to breathe, eat, or drink and doesn't age.",
  "You can use an action to remove the flask's stopper and release the creature the flask contains. The creature is friendly to you and your companions for 1 hour and obeys your commands for that duration. If you give no commands or give it a command that is likely to result in its death, it defends itself but otherwise takes no actions. At the end of the duration, the creature acts in accordance with its normal disposition and alignment.",
  'An {@spell identify} spell reveals that a creature is inside the flask, but the only way to determine the type of creature is to open the flask. A newly discovered bottle might already contain a creature chosen by the GM or determined randomly.',
  {
    colLabels: ['{@dice d100}', 'Contents'],
    colStyles: ['col-1 text-center', 'col-11'],
    rows: [
      ['01-50', 'Empty'],
      ['51-54', 'Demon (type 1)'],
      ['55-58', 'Demon (type 2)'],
      ['59-62', 'Demon (type 3)'],
      ['63-64', 'Demon (type 4)'],
      ['65', 'Demon (type 5)'],
      ['66', 'Demon (type 6)'],
      ['67', '{@creature Deva}'],
      ['68-69', 'Devil (greater)'],
      ['70-73', 'Devil (lesser)'],
      ['74-75', '{@creature Djinni}'],
      ['76-77', '{@creature Efreeti}'],
      ['78-83', 'Elemental (any)'],
      ['84-86', '{@creature Invisible stalker}'],
      ['87-90', '{@creature Night hag}'],
      ['91', '{@creature Planetar}'],
      ['92-95', '{@creature Salamander}'],
      ['96', '{@creature Solar}'],
      ['97-99', '{@creature succubus||Succubus/Incubus}'],
      ['100', '{@creature Xorn}'],
    ],
    type: 'table',
  },
]
const SRD_521_IRON_FLASK_ENTRIES = [
  "While holding this brass-stoppered iron flask, you can take a {@action Magic|XPHB} action to target a creature that you can see within 60 feet of yourself. If the flask is empty and the target is native to a plane of existence other than the one you're on, the target must succeed on a {@dc 17} Wisdom saving throw or be trapped in the flask. If the target has been trapped by the flask before, it has {@variantrule Advantage|XPHB} on the save. Once trapped, a creature remains in the flask until released. The flask can hold only one creature at a time. A creature trapped in the flask doesn't age and doesn't need to breathe, eat, or drink.",
  "You can take a {@action Magic|XPHB} action to remove the flask's stopper and release the creature in the flask. The creature then obeys your commands for 1 hour, understanding those commands even if it doesn't know the language in which the commands are given. If you issue no commands or give the creature a command that is likely to result in its death or imprisonment, it defends itself but otherwise takes no actions. At the end of the duration, the creature acts in accordance with its normal disposition and alignment.",
  'An {@spell Identify|XPHB} spell reveals if the flask contains a creature, but the only way to determine the type of creature is to open the flask. A newly discovered Iron Flask might already contain a creature chosen by the GM.',
]
const SRD_521_GIANT_STRENGTH_POTIONS = [
  ['Hill', 21],
  ['Frost', 23],
  ['Stone', 23],
  ['Fire', 25],
  ['Cloud', 27],
  ['Storm', 29],
]
const SRD_51_HORN_OF_VALHALLA_VARIANTS = [
  ['Silver', '2d4 + 2', undefined],
  ['Brass', '3d4 + 3', 'proficient with all simple weapons'],
  ['Bronze', '4d4 + 4', 'proficient with all medium armor'],
  ['Iron', '5d4 + 5', 'proficient with all martial weapons'],
]
const SRD_51_HORN_OF_VALHALLA_ENTRY =
  "You can use an action to blow this horn. In response, warrior spirits from the Valhalla appear within 60 feet of you. They use the statistics of a {@creature berserker}. They return to Valhalla after 1 hour or when they drop to 0 hit points. Once you use the horn, it can't be used again until 7 days have passed."
const SRD_521_MANUAL_OF_GOLEMS_VARIANTS = [
  ['Clay', 30, '65,000'],
  ['Flesh', 60, '50,000'],
  ['Iron', 120, '100,000'],
  ['Stone', 90, '80,000'],
]
const STRUCTURED_SRD_RECORD_CORRECTIONS = new Map([
  [
    'Stabling (per day)|XPHB',
    {
      id: 'stablingCost2024',
      fields: { value: 50 },
    },
  ],
  [
    "Lolth's Sting|XDMG",
    {
      id: 'spidersSting2024',
      fields: {
        name: "Spider's Sting",
        entries: [
          "A creature subjected to Spider's Sting must succeed on a {@dc 13} Constitution saving throw or have the {@condition Poisoned|XPHB} condition for 1 hour. If the creature fails the save by 5 or more, the creature also has the {@condition Unconscious|XPHB} condition while {@condition Poisoned|XPHB} in this way. The creature wakes up if it takes damage or if another creature takes an action to shake it awake.",
        ],
      },
    },
  ],
  [
    'Staff of Withering|XDMG',
    {
      id: 'staffOfWitheringAttunement2024',
      fields: { reqAttune: true },
    },
  ],
  [
    'Iron Flask|DMG',
    {
      id: 'ironFlask2014',
      fields: { entries: SRD_51_IRON_FLASK_ENTRIES },
    },
  ],
  [
    'Iron Flask|XDMG',
    {
      id: 'ironFlask2024',
      fields: { entries: SRD_521_IRON_FLASK_ENTRIES },
    },
  ],
  ...SRD_521_GIANT_STRENGTH_POTIONS.map(([giant, strength]) => [
    `Potion of ${giant} Giant Strength|XDMG`,
    {
      id: 'giantStrengthPotionText2024',
      fields: {
        entries: [
          `When you drink this potion, your Strength score changes to ${strength} for 1 hour. The potion has no effect on you if your Strength is equal to or greater than that score.`,
          `This potion's transparent liquid has floating in it a sliver of light resembling a ${String(giant).toLowerCase()} giant's fingernail.`,
        ],
      },
    },
  ]),
  ...SRD_51_HORN_OF_VALHALLA_VARIANTS.map(([metal, dice, requirement]) => {
    const lowerMetal = String(metal).toLowerCase()
    const article = metal === 'Silver' || metal === 'Iron' ? 'The' : 'A'
    return [
      `Horn of Valhalla, ${metal}|DMG`,
      {
        id: 'hornOfValhallaText2014',
        fields: {
          entries: [
            SRD_51_HORN_OF_VALHALLA_ENTRY,
            `${article} ${lowerMetal} horn summons {@dice ${dice}} {@creature berserker||berserkers}.${requirement ? ` To use the ${lowerMetal} horn, you must be ${requirement}.` : ''}`,
            requirement
              ? 'If you blow the horn without meeting its requirement, the summoned {@creature berserker||berserkers} attack you. If you meet the requirement, they are friendly to you and your companions and follow your commands.'
              : 'The {@creature berserker||berserkers} are friendly to you and your companions and follow your commands.',
          ],
        },
      },
    ]
  }),
  ...SRD_521_MANUAL_OF_GOLEMS_VARIANTS.map(([material, days, cost]) => {
    const golem = `${String(material).toLowerCase()} golem`
    return [
      `Manual of ${material} Golems|XDMG`,
      {
        id: 'manualOfGolemsText2024',
        fields: {
          entries: [
            `This tome contains information and incantations necessary to make a {@creature ${golem}|XMM}. To decipher and use the manual, you must be a spellcaster with at least two level 5 spell slots. A creature that can't use a {@i Manual of Golems} and attempts to read it takes {@damage 6d6} Psychic damage.`,
            `To create a ${golem}, you must spend ${days} days, working without interruption with the manual at hand and resting no more than 8 hours per day. You must also pay ${cost} gp to purchase supplies.`,
            "Once you finish creating the golem, the book is consumed in eldritch flames. The golem becomes animate when the ashes of the manual are sprinkled on it. See Monsters for the golem's stat block. The golem is under your control, and it understands and obeys your commands.",
          ],
        },
      },
    ]
  }),
])

const ITEM_ENTRY_REFERENCE_PATTERN = /^\{#itemEntry ([^}]+)}$/
const ITEM_ENTRY_TEMPLATE_PATTERN = /\{\{(?:(getFullImmRes) )?item\.([a-zA-Z0-9]+)}}/g

const EXACT_SRD_TEXT_CORRECTIONS = new Map([
  [
    'Activating some magic items requires a user to do something in particular, such as holding the item and uttering a command word, reading the item if it is a scroll, or drinking it if it is a potion. The description of each item category or individual item details how an item is activated. Certain items use one or more of the following rules related to their activation.',
    {
      id: 'activateItemIntroduction',
      replacement:
        'Activating some magic items requires a user to do something special, such as holding the item and uttering a command word. The description of each item category or individual item details how an item is activated. Certain items use the following rules for their activation.',
    },
  ],
  [
    "If an item requires an action to activate, that action isn't a function of the {@action Use an Object} action, so a feature such as the rogue's {@subclassFeature Fast Hands|Rogue||Thief||3} can't be used to activate the item.",
    {
      id: 'activateItemActionName',
      replacement:
        "If an item requires an action to activate, that action isn't a function of the Use an Item action, so a feature such as the rogue's {@subclassFeature Fast Hands|Rogue||Thief||3} can't be used to activate the item.",
    },
  ],
  [
    "A command word is a word or phrase that must be spoken audibly for the item to operate. A magic item that requires the user to speak a command word can't be activated in the area of any effect that prevents sound, such as the area created by the silence spell.",
    {
      id: 'activateItemCommandWord',
      replacement:
        "A command word is a word or phrase that must be spoken for an item to work. A magic item that requires a command word can't be activated in an area where sound is prevented, as in the area of the silence spell.",
    },
  ],
  [
    'Some items are used up when they are activated. A potion or elixir must be swallowed, or an oil applied to the body. The writing vanishes from a scroll when it is read. Once used, a consumable item loses its magic and no longer functions.',
    {
      id: 'activateItemConsumables',
      replacement:
        'Some items are used up when they are activated. A potion or an elixir must be swallowed, or an oil applied to the body. The writing vanishes from a scroll when it is read. Once used, a consumable item loses its magic.',
    },
  ],
  [
    "Some magic items allow the user to cast a spell from the item, often by expending charges from it. The spell is cast at the lowest possible spell and caster level, doesn't expend any of the user's spell slots, and requires no components unless the item's description says otherwise. The spell uses its normal casting time, range, and duration, and the user of the item must concentrate if the spell requires {@status concentration}. Certain items make exceptions to these rules, changing the casting time, duration, or other parts of a spell.",
    {
      id: 'activateItemSpells',
      replacement:
        "Some magic items allow the user to cast a spell from the item. The spell is cast at the lowest possible spell level, doesn't expend any of the user's spell slots, and requires no components, unless the item's description says otherwise. The spell uses its normal casting time, range, and duration, and the user of the item must concentrate if the spell requires {@status concentration}.",
    },
  ],
  [
    "Many items, such as potions, bypass the casting of the spell and confer the spell's effects. Such an item still uses the spell's duration unless the item's description says otherwise.",
    {
      id: 'activateItemSpellEffects',
      replacement:
        "Many items, such as potions, bypass the casting of a spell and confer the spell's effects, with their usual duration. Certain items make exceptions to these rules, changing the casting time, duration, or other parts of a spell.",
    },
  ],
  [
    'Some magic items have charges that you expend to activate its properties. The number of charges an item has remaining is revealed when an identify spell is cast on the item, or when a creature attunes to the item. Additionally, when an item regains charges, the creature attuned to that item learns how many charges it regained.',
    {
      id: 'activateItemCharges',
      replacement:
        'Some magic items have charges that must be expended to activate their properties. The number of charges an item has remaining is revealed when an {@spell identify} spell is cast on it, as well as when a creature attunes to it. Additionally, when an item regains charges, the creature attuned to it learns how many charges it regained.',
    },
  ],
  [
    "A Bedroll sleeps one Small or Medium creature. While in a Bedroll, you automatically succeed on saving throws against {@hazard extreme cold|XDMG} (see the {@book Dungeon Master's Guide|XDMG}).",
    {
      id: 'bedrollSrdSectionReference',
      replacement:
        'A Bedroll sleeps one Small or Medium creature. While in a Bedroll, you automatically succeed on saving throws against {@hazard extreme cold|XDMG} (see "Gameplay Toolbox").',
    },
  ],
  [
    "While wrapped in a blanket, you have {@variantrule Advantage|XPHB} on saving throws against {@hazard extreme cold|XDMG} (see the {@book Dungeon Master's Guide|XDMG}).",
    {
      id: 'blanketSrdSectionReference',
      replacement:
        'While wrapped in a blanket, you have {@variantrule Advantage|XPHB} on saving throws against {@hazard extreme cold|XDMG} (see "Gameplay Toolbox").',
    },
  ],
  [
    "As they overcome challenges and complete adventures, characters earn Experience Points (XP) which are awarded by the Dungeon Master. When a character's XP total crosses certain thresholds, the character's level increases. The {@book Dungeon Master's Guide|XDMG} provides guidance on awarding XP.",
    {
      id: 'experiencePointsSrdSectionReference',
      replacement:
        'As they overcome challenges and complete adventures, characters earn Experience Points (XP), which are awarded by the Game Master. When a character\'s XP total crosses certain thresholds, the character\'s level increases. See also "Level Advancement."',
    },
  ],
  [
    'Spellcasters such as wizards and clerics, as well as many monsters, have access to spells and can use them to great effect in combat. Each spell has a casting time, which specifies whether the caster must use an action, a reaction, minutes, or even hours to cast the spell. Casting a spell is, therefore, not necessarily an action. Most spells do have a casting time of 1 action, so a spellcaster often uses his or her action in combat to cast such a spell. See {@book chapter 10|phb|10|casting a spell} for the rules on spellcasting.',
    {
      id: 'castSpellSrdText',
      replacement:
        'Spellcasters such as wizards and clerics, as well as many monsters, have access to spells and can use them to great effect in combat. Each spell has a casting time, which specifies whether the caster must use an action, a reaction, minutes, or even hours to cast the spell. Casting a spell is, therefore, not necessarily an action. Most spells do have a casting time of 1 action, so a spellcaster often uses his or her action in combat to cast such a spell.',
    },
  ],
  [
    'When you take the Hide action, you make a Dexterity ({@skill Stealth}) check in an attempt to hide, following the rules in {@book chapter 7|phb|7|hiding} for hiding. If you succeed, you gain certain benefits, as described in the "{@book Unseen Attackers and Targets|PHB|9|unseen attackers and targets}" section in the Player\'s Handbook.',
    {
      id: 'hideSrdText',
      replacement:
        'When you take the Hide action, you make a Dexterity ({@skill Stealth}) check in an attempt to hide, following the rules for hiding. If you succeed, you gain certain benefits, as described in the "Unseen Attackers and Targets" section.',
    },
  ],
  [
    "If a paladin willfully violates his or her oath and shows no sign of repentance, the consequences can be more serious. At the DM's discretion, an impenitent paladin might be forced to abandon this class and adopt another, or perhaps to take the Oathbreaker paladin option that appears in the Dungeon Master's Guide.",
    {
      id: 'sacredOathSrdText',
      replacement:
        "If a paladin willfully violates his or her oath and shows no sign of repentance, the consequences can be more serious. At the GM's discretion, an impenitent paladin might be forced to abandon this class and adopt another.",
    },
  ],
  [
    "When you want to grab a creature or wrestle with it, you can use the {@action Attack} action to make a special melee attack, a grapple. If you're able to make multiple attacks with the {@action Attack} action, this attack replaces one of them. The target of your grapple must be no more than one size larger than you, and it must be within your reach.",
    {
      id: 'grappleSrdIntroduction',
      replacement:
        "When you want to grab a creature or wrestle with it, you can use the {@action Attack} action to make a special melee attack, a grapple. If you're able to make multiple attacks with the {@action Attack} action, this attack replaces one of them. The target of your grapple must be no more than one size larger than you and must be within your reach.",
    },
  ],
  [
    "Using at least one free hand, you try to seize the target by making a grapple check, a Strength ({@skill Athletics}) check contested by the target's Strength ({@skill Athletics}) or Dexterity ({@skill Acrobatics}) check (the target chooses the ability to use). You succeed automatically if the target is {@condition incapacitated}. If you succeed, you subject the target to the {@condition grappled} condition (see the appendix). The condition specifies the things that end it, and you can release the target whenever you like (no action required).",
    {
      id: 'grappleSrdContest',
      replacement:
        "Using at least one free hand, you try to seize the target by making a grapple check instead of an attack roll: a Strength ({@skill Athletics}) check contested by the target's Strength ({@skill Athletics}) or Dexterity ({@skill Acrobatics}) check (the target chooses the ability to use). If you succeed, you subject the target to the {@condition grappled} condition (see appendix A). The condition specifies the things that end it, and you can release the target whenever you like (no action required).",
    },
  ],
  [
    "The target of your shove must be no more than one size larger than you, and it must be within your reach. You make a Strength ({@skill Athletics}) check contested by the target's Strength ({@skill Athletics}) or Dexterity ({@skill Acrobatics}) check (the target chooses the ability to use). You succeed automatically if the target is {@condition incapacitated}. If you succeed, you either knock the target {@condition prone} or push it 5 feet away from you.",
    {
      id: 'shoveSrdContest',
      replacement:
        "The target must be no more than one size larger than you and must be within your reach. Instead of making an attack roll, you make a Strength ({@skill Athletics}) check contested by the target's Strength ({@skill Athletics}) or Dexterity ({@skill Acrobatics}) check (the target chooses the ability to use). If you win the contest, you either knock the target {@condition prone} or push it 5 feet away from you.",
    },
  ],
  [
    'This weapon requires two hands to use. This property is relevant only when you attack with the weapon, not when you simply hold it.',
    {
      id: 'twoHandedPropertySrdText',
      replacement: 'This weapon requires two hands when you attack with it.',
    },
  ],
  [
    'You can use a weapon that has the ammunition property to make a ranged attack only if you have ammunition to fire from the weapon. Each time you attack with the weapon, you expend one piece of ammunition. Drawing the ammunition from a quiver, case, or other container is part of the attack. Loading a one-handed weapon requires a free hand. At the end of the battle, you can recover half your expended ammunition by taking a minute to search the battlefield.',
    {
      id: 'ammunitionPropertySrdText',
      replacement:
        'You can use a weapon that has the ammunition property to make a ranged attack only if you have ammunition to fire from the weapon. Each time you attack with the weapon, you expend one piece of ammunition. Drawing the ammunition from a quiver, case, or other container is part of the attack. You need a free hand to load a one-handed weapon. At the end of the battle, you can recover half your expended ammunition by taking a minute to search the battlefield.',
    },
  ],
  [
    'If you use a weapon that has the ammunition property to make a melee attack, you treat the weapon as an improvised weapon. A sling must be loaded to deal any damage when used in this way.',
    {
      id: 'ammunitionMeleeSrdText',
      replacement:
        'If you use a weapon that has the ammunition property to make a melee attack, you treat the weapon as an improvised weapon (see "Improvised Weapons" later in the section). A sling must be loaded to deal any damage when used in this way.',
    },
  ],
  [
    "Creatures that are Small or Tiny have disadvantage on attack rolls with heavy weapons. A heavy weapon's size and bulk make it too large for a Small or Tiny creature to use effectively.",
    {
      id: 'heavyPropertySrdText',
      replacement:
        "Small creatures have disadvantage on attack rolls with heavy weapons. A heavy weapon's size and bulk make it too large for a Small creature to use effectively.",
    },
  ],
  [
    'This weapon adds 5 feet to your reach when you attack with it. This property also determines your reach for opportunity attacks with a reach weapon.',
    {
      id: 'reachPropertySrdText',
      replacement:
        'This weapon adds 5 feet to your reach when you attack with it, as well as when determining your reach for opportunity attacks with it.',
    },
  ],
  [
    'You and up to eight willing creatures who link hands in a circle are transported to a different plane of existence. You can specify a target destination in general terms, such as the City of Brass on the Elemental Plane of Fire or the palace of Dispater on the second level of the Nine Hells, and you appear in or near that destination, as determined by the DM.',
    {
      id: 'planeShiftSrdExample2024',
      replacement:
        'You and up to eight willing creatures who link hands in a circle are transported to a different plane of existence. You can specify a target destination in general terms, such as a specific city on the Elemental Plane of Fire or palace on the second level of the Nine Hells, and you appear in or near that destination, as determined by the GM.',
    },
  ],
  [
    'Some spells and other effects require Concentration to remain active, as specified in their descriptions. You can end Concentration at any time (no action required).',
    {
      id: 'endConcentrationSrdText2024',
      replacement: 'The creator can end Concentration at any time (no action required).',
    },
  ],
  [
    '{@note Additionally, the Help action may be used to {@book stabilize a creature|XPHB|1|Stabilizing a Character}.}',
    {
      id: 'helpStabilizeSrdText2024',
      replacement:
        'You can take the Help action to try to stabilize a creature with 0 Hit Points, which requires a successful {@dc 10} Wisdom ({@skill Medicine|XPHB}) check.',
    },
  ],
  [
    "With the Hide action, you try to conceal yourself. To do so, you must succeed on a {@dc 15} Dexterity ({@skill Stealth|XPHB}) check while you're {@variantrule Heavily Obscured|XPHB} or behind {@variantrule Cover|XPHB|Three-Quarters Cover or Total Cover}, and you must be out of any enemy's line of sight; if you can see a creature, you can discern whether it can see you.",
    {
      id: 'hideSrdText2024',
      replacement:
        "With the Hide action, you try to hide yourself. To do so, you must succeed on a {@dc 15} Dexterity ({@skill Stealth|XPHB}) check while you're {@variantrule Heavily Obscured|XPHB} or behind {@variantrule Cover|XPHB|Three-Quarters Cover or Total Cover}, and you must be out of any enemy's line of sight; if you can see a creature, you can discern whether it can see you.",
    },
  ],
  [
    'In a fight, everyone is constantly watching for enemies to drop their guard. You can rarely move heedlessly past your foes without putting yourself in danger; doing so provokes an opportunity attack.',
    {
      id: 'opportunityAttackIntroduction2014',
      replacement:
        'In a fight, everyone is constantly watching for a chance to strike an enemy who is fleeing or passing by. Such a strike is called an opportunity attack.',
    },
  ],
  [
    "You can make an opportunity attack when a hostile creature that you can see moves out of your reach. To make the opportunity attack, you use your reaction to make one melee attack against the provoking creature. The attack interrupts the provoking creature's movement, occurring right before the creature leaves your reach.",
    {
      id: 'opportunityAttackTiming2014',
      replacement:
        'You can make an opportunity attack when a hostile creature that you can see moves out of your reach. To make the opportunity attack, you use your reaction to make one melee attack against the provoking creature. The attack occurs right before the creature leaves your reach.',
    },
  ],
  [
    'Your Constitution score is 19 while you wear this amulet. It has no effect on you if your Constitution score is already 19 or higher without it.',
    {
      id: 'amuletOfHealth2014',
      replacement:
        'Your Constitution score is 19 while you wear this amulet. It has no effect on you if your Constitution is already 19 or higher.',
    },
  ],
  [
    'Your Constitution score is 19 while you wear this amulet. It has no effect on you if your Constitution is already 19 or higher without it.',
    {
      id: 'amuletOfHealth2024',
      replacement:
        'Your Constitution is 19 while you wear this amulet. It has no effect on you if your Constitution is 19 or higher without it.',
    },
  ],
  [
    'Your Strength score is 19 while you wear these gauntlets. They have no effect on you if your Strength is already 19 or higher without them.',
    {
      id: 'gauntletsOfOgrePower2014',
      replacement:
        'Your Strength score is 19 while you wear these gauntlets. They have no effect on you if your Strength is already 19 or higher.',
    },
  ],
  [
    'Your Strength score is 19 while you wear these gauntlets. They have no effect on you if your Strength is 19 or higher without them.',
    {
      id: 'gauntletsOfOgrePower2024',
      replacement:
        'Your Strength is 19 while you wear these gauntlets. They have no effect on you if your Strength is 19 or higher without them.',
    },
  ],
  [
    'Your Intelligence score is 19 while you wear this headband. It has no effect on you if your Intelligence is already 19 or higher without it.',
    {
      id: 'headbandOfIntellect2014',
      replacement:
        'Your Intelligence score is 19 while you wear this headband. It has no effect on you if your Intelligence is already 19 or higher.',
    },
  ],
  [
    'Your Intelligence score is 19 while you wear this headband. It has no effect on you if your Intelligence is 19 or higher without it.',
    {
      id: 'headbandOfIntellect2024',
      replacement:
        'Your Intelligence is 19 while you wear this headband. It has no effect on you if your Intelligence is 19 or higher without it.',
    },
  ],
  [
    "While wearing these gloves, climbing and swimming don't cost you extra movement, and you gain a +5 bonus to Strength ({@skill Athletics|XPHB}) checks made to climb or swim.",
    {
      id: 'glovesOfSwimmingAndClimbing2024',
      replacement:
        'While wearing these gloves, you have a Climb Speed and a Swim Speed equal to your Speed, and you gain a +5 bonus to Strength ({@skill Athletics|XPHB}) checks made to climb or swim.',
    },
  ],
  [
    'This crystal ball is about 6 inches in diameter. While touching it, you can cast the {@spell scrying} spell (save {@dc 17}) with it.',
    {
      id: 'crystalBall2014',
      replacement:
        'The typical crystal ball, a very rare item, is about 6 inches in diameter. While touching it, you can cast the {@spell scrying} spell (save {@dc 17}) with it.',
    },
  ],
  [
    "While wearing this armor, you gain a +1 bonus to AC, and you can understand and speak Abyssal. In addition, the armor's clawed gauntlets turn unarmed strikes with your hands into magic weapons that deal slashing damage, with a +1 bonus to attack and damage rolls and a damage die of {@dice 1d8}.",
    {
      id: 'demonArmor2014',
      replacement:
        "While wearing this armor, you gain a +1 bonus to AC, and you can understand and speak Abyssal. In addition, the armor's clawed gauntlets turn unarmed strikes with your hands into magic weapons that deal slashing damage, with a +1 bonus to attack rolls and damage rolls and a damage die of {@dice 1d8}.",
    },
  ],
  [
    'You gain a +3 bonus to attack rolls and damage rolls made with this magic weapon. It has {@itemProperty T|XPHB|Thrown} with a normal range of 20 feet and a long range of 60 feet. When you hit with a ranged attack using this weapon, it deals an extra {@damage 1d8} Force damage, or an extra {@damage 2d8} Force damage if the target is a Giant. Immediately after hitting or missing, the weapon flies back to your hand.',
    {
      id: 'dwarvenThrower2024',
      replacement:
        'You gain a +3 bonus to attack rolls and damage rolls made with this magic weapon. It has the {@itemProperty T|XPHB|Thrown} property with a normal range of 20 feet and a long range of 60 feet. When you hit with a ranged attack using this weapon, it deals an extra {@damage 1d8} Force damage, or an extra {@damage 2d8} Force damage if the target is a Giant. Immediately after hitting or missing, the weapon flies back to your hand.',
    },
  ],
  [
    'As a {@action Utilize|XPHB} action, you can sprinkle a pinch of the dust on an Elemental within 5 feet of yourself that is composed mostly of water (such as a {@creature Water Elemental|XMM} or a {@creature Water Weird|XMM}). Such a creature exposed to a pinch of the dust makes a {@dc 13} Constitution saving throw, taking {@damage 10d6} Necrotic damage on a failed save or half as much damage on a successful one.',
    {
      id: 'dustOfDryness2024',
      replacement:
        'As a {@action Utilize|XPHB} action, you can sprinkle a pinch of the dust on an Elemental within 5 feet of yourself that is composed mostly of water (such as a {@creature Water Elemental|XMM}). Such a creature exposed to a pinch of the dust makes a {@dc 13} Constitution saving throw, taking {@damage 10d6} Necrotic damage on a failed save or half as much damage on a successful one.',
    },
  ],
  [
    "When you roll a 20 on an attack roll made with this weapon, the target takes an extra 7 bludgeoning damage, or an extra 14 bludgeoning damage if it's a construct. If a construct has 25 hit points or fewer after taking this damage, it is destroyed.",
    {
      id: 'maceOfSmiting2014',
      replacement:
        "When you roll a 20 on an attack roll made with this weapon, the target takes an extra {@damage 2d6} bludgeoning damage, or {@damage 4d6} bludgeoning damage if it's a construct. If a construct has 25 hit points or fewer after taking this damage, it is destroyed.",
    },
  ],
  [
    "This book contains health and diet tips, and its words are charged with magic. If you spend 48 hours over a period of 6 days or fewer studying the book's contents and practicing its guidelines, your Constitution increases by 2, to a maximum of 30. The manual then loses its magic, but regains it in a century.",
    {
      id: 'manualOfBodilyHealth2024',
      replacement:
        "This book contains health and nutrition tips, and its words are charged with magic. If you spend 48 hours over a period of 6 days or fewer studying the book's contents and practicing its guidelines, your Constitution increases by 2, to a maximum of 30. The manual then loses its magic, but regains it in a century.",
    },
  ],
  [
    'This weapon has {@itemProperty T|XPHB|Thrown} with a normal range of 30 feet and a long range of 120 feet. Immediately after you make a ranged attack with the weapon, it flies back to your hand.',
    {
      id: 'quarterstaffOfTheAcrobat2024',
      replacement:
        'This weapon has the {@itemProperty T|XPHB|Thrown} property with a normal range of 30 feet and a long range of 120 feet. Immediately after you make a ranged attack with the weapon, it flies back to your hand.',
    },
  ],
  [
    'While grasping the hilt, you can take a {@variantrule Bonus Action|XPHB} to cause a blade of pure radiance to spring into existence or make the blade disappear. While the blade exists, this magic weapon functions as a Longsword with {@itemProperty F|XPHB|Finesse}. If you are proficient with Longswords or Shortswords, you are proficient with the Sun Blade.',
    {
      id: 'sunBlade2024',
      replacement:
        'While grasping the hilt, you can take a {@variantrule Bonus Action|XPHB} to cause a blade of pure radiance to spring into existence or make the blade disappear. While the blade exists, this magic weapon functions as a Longsword with the {@itemProperty F|XPHB|Finesse} property. If you are proficient with Longswords or Shortswords, you are proficient with the Sun Blade.',
    },
  ],
  [
    "While this pearl is on your person, you can use an action to speak its command word and regain one expended spell slot. If the expended slot was of 4th level or higher, the new slot is 3rd level. Once you have used the pearl, it can't be used again until the next dawn.",
    {
      id: 'pearlOfPower2014',
      replacement:
        "While this pearl is on your person, you can use an action to speak its command word and regain one expended spell slot. If the expended slot was of 4th level or higher, the new slot is 3rd level. Once you use the pearl, it can't be used again until the next dawn.",
    },
  ],
  [
    'You are immune to contracting any disease while you wear this pendant. If you are already infected with a disease, the effects of the disease are suppressed while you wear the pendant.',
    {
      id: 'periaptOfHealth2014',
      replacement:
        'You are immune to contracting any disease while you wear this pendant. If you are already infected with a disease, the effects of the disease are suppressed you while you wear the pendant.',
    },
  ],
  [
    "While you're wearing this armor, you can speak its command word as an action to gain the effect of the {@spell etherealness} spell, which lasts for 10 minutes or until you remove the armor or use an action to speak the command word again. This property of the armor can't be used again until the next dawn.",
    {
      id: 'plateArmorOfEtherealness2014',
      replacement:
        "While you're wearing this armor, you can speak its command word as an action to gain the effect of the {@spell etherealness} spell, which last for 10 minutes or until you remove the armor or use an action to speak the command word again. This property of the armor can't be used again until the next dawn.",
    },
  ],
  [
    "This ring has 3 charges, and it regains {@dice 1d3} expended charges daily at dawn. While wearing the ring, you can use an action to expend 1 to 3 of its charges to make a ranged spell attack against one creature you can see within 60 feet of you. The ring produces a spectral ram's head and makes its attack roll with a +7 bonus. On a hit, for each charge you spend, the target takes {@damage 2d10} force damage and is pushed 5 feet away from you.",
    {
      id: 'ringOfTheRam2014',
      replacement:
        "This ring has 3 charges, and it regains {@dice 1d3} expended charges daily at dawn. While wearing the ring, you can use an action to expend 1 to 3 of its charges to attack one creature you can see within 60 feet of you. The ring produces a spectral ram's head and makes its attack roll with a +7 bonus. On a hit, for each charge you spend, the target takes {@damage 2d10} force damage and is pushed 5 feet away from you.",
    },
  ],
  [
    'You have advantage on saving throws against spell and other magical effects.',
    {
      id: 'robeOfTheArchmagi2014',
      replacement: 'You have advantage on saving throws against spells and other magical effects.',
    },
  ],
  [
    "If you press button 1, the rod becomes a {@item flame tongue} as a fiery blade sprouts from the end opposite the rod's flanged head (you choose the type of sword).",
    {
      id: 'rodOfLordlyMight2014',
      replacement:
        "If you press button 1, the rod becomes a {@item flame tongue} as a fiery blade sprouts from the end opposite the rod's flanged head.",
    },
  ],
  [
    'The staff has 20 charges for the following properties. The staff regains {@dice 2d8 + 4} expended charges daily at dawn. If you expend the last charge, roll a {@dice d20}. On a 1, the staff retains its +2 bonus to attack and damage roll but loses all other properties. On a 20, the staff regain {@dice 1d8 + 2} charges.',
    {
      id: 'staffOfPower2014',
      replacement:
        'The staff has 20 charges for the following properties. The staff regains {@dice 2d8 + 4} expended charges daily at dawn. If you expend the last charge, roll a {@dice d20}. On a 1, the staff retains its +2 bonus to attack and damage rolls but loses all other properties. On a 20, the staff regains {@dice 1d8 + 2} charges.',
    },
  ],
  [
    "While holding the wand, you can use an action to expend 2 charges, causing the wand's tip to emit a 60-foot cone of amber light. Each creature in the cone must succeed on a {@dc 15} Wisdom saving throw or become {@condition frightened} of you for 1 minute. While it is {@condition frightened} in this way, a creature must spend its turns trying to move as far away from you as it can, and it can't willingly move to a space within 30 feet of you. It also can't take reactions. For its action, it can use only the {@action Dash} action or try to escape from an effect that prevent it from moving. If it has nowhere it can move, the creature can use the {@action Dodge} action. At the end of each of its turns, a creature can repeat the saving throw, ending the effect on itself on a success.",
    {
      id: 'wandOfFear2014',
      replacement:
        "While holding the wand, you can use an action to expend 2 charges, causing the wand's tip to emit a 60-foot cone of amber light. Each creature in the cone must succeed on a {@dc 15} Wisdom saving throw or become {@condition frightened} of you for 1 minute. While it is {@condition frightened} in this way, a creature must spend its turns trying to move as far away from you as it can, and it can't willingly move to a space within 30 feet of you. It also can't take reactions. For its action, it can use only the {@action Dash} action or try to escape from an effect that prevents it from moving. If it has nowhere it can move, the creature can use the {@action Dodge} action. At the end of each of its turns, a creature can repeat the saving throw, ending the effect on itself on a success.",
    },
  ],
  [
    'Ages past, on the world of Krynn, elves and humans waged a terrible war against evil dragons. When the world seemed doomed, the wizards of the Towers of High Sorcery came together and worked their greatest magic, forging five Orbs of Dragonkind (or Dragon Orbs) to help them defeat the dragons. One orb was taken to each of the five towers, and there they were used to speed the war toward a victorious end. The wizards used the orbs to lure dragons to them, then destroyed the dragons with powerful magic.',
    {
      id: 'orbOfDragonkindSettingIntroduction2014',
      replacement:
        'Ages past, elves and humans waged a terrible war against evil dragons. When the world seemed doomed, powerful wizards came together and worked their greatest magic, forging five Orbs of Dragonkind (or Dragon Orbs) to help them defeat the dragons. One orb was taken to each of the five wizard towers, and there they were used to speed the war toward a victorious end. The wizards used the orbs to lure dragons to them, then destroyed the dragons with powerful magic.',
    },
  ],
  [
    'As the Towers of High Sorcery fell in later ages, the orbs were destroyed or faded into legend, and only three are thought to survive. Their magic has been warped and twisted over the centuries, so although their primary purpose of calling dragons still functions, they also allow some measure of control over dragons.',
    {
      id: 'orbOfDragonkindWizardTowers2014',
      replacement:
        'As the wizard towers fell in later ages, the orbs were destroyed or faded into legend, and only three are thought to survive. Their magic has been warped and twisted over the centuries, so although their primary purpose of calling dragons still functions, they also allow some measure of control over dragons.',
    },
  ],
  [
    "While you are {@condition charmed} by the orb, you can't voluntarily end your attunement to it, and the orb casts {@spell suggestion} on you at will (save {@dc 18}), urging you to work toward the evil ends it desires. The dragon essence within the orb might want many things: the annihilation of a particular people, freedom from the orb, to spread suffering in the world, to advance the worship of Takhisis ({@creature Tiamat|RoT|Tiamat's} name on Krynn), or something else the DM decides.",
    {
      id: 'orbOfDragonkindTiamat2014',
      replacement:
        "While you are {@condition charmed} by the orb, you can't voluntarily end your attunement to it, and the orb casts {@spell suggestion} on you at will (save {@dc 18}), urging you to work toward the evil ends it desires. The dragon essence within the orb might want many things: the annihilation of a particular people, freedom from the orb, to spread suffering in the world, to advance the worship of Tiamat, or something else the GM decides.",
    },
  ],
])
const NON_SRD_NESTED_ENTRIES = new Map([
  ["A Bard's Repertoire", 'bardRepertoireSidebar'],
  ['A Question of Enmity', 'deckEnmitySidebar'],
])
const NON_SRD_NESTED_ENTRY_INTROS = new Map([
  [
    "A ship needs a crew of skilled hirelings to function. As per the Player's Handbook, one skilled hireling costs at least 2 gp per day. The minimum number of skilled hirelings needed to crew a ship depends on the type of vessel.",
    'shipCrewBookOnlyGuidance',
  ],
])
const NON_SRD_STRING_ENTRIES = new Map([
  ["A Lance requires two hands to wield when you aren't mounted.", 'lanceBookOnlyDescription'],
  [
    '{@note Note: According to the SRD, it is an extra {@damage 2d6} and {@damage 4d6} bludgeoning damage, although {@link this is incorrect|https://rpg.stackexchange.com/a/174522/53884}}.',
    'maceOfSmitingBookCorrectionNote',
  ],
  [
    'You have until the start of your next turn to use a readied action.',
    'readyActionExpiryOutsideSrd51',
  ],
])
const INLINE_SRD_TEXT_CORRECTIONS = [
  {
    id: 'handyHaversackSrdName',
    pattern: /\{@item Heward's [Hh]andy [Hh]aversack(?:\|XDMG)?}/g,
    replacement: 'Handy Haversack',
  },
  {
    id: 'spellsSectionReference',
    pattern: /\{@book chapter 7\|XPHB\|7}/g,
    replacement: 'Spells',
  },
  {
    id: 'challengeRatingSrdSectionReference',
    pattern:
      /The \{@book Dungeon Master's Guide\|XDMG} provides guidance to the GM on using CR while planning potential combat \{@variantrule Encounter\|XPHB\|encounters}\./g,
    replacement:
      '"Gameplay Toolbox" ("Combat Encounters") provides guidance to the GM on using CR while planning potential combat {@variantrule Encounter|XPHB|encounters}. See also "Stat Block."',
  },
  {
    id: 'monsterManualSrdSectionReference',
    pattern: /(?:the )?\{@book Monster Manual\|XMM}/g,
    replacement: 'Monsters',
  },
  {
    id: 'wildShapeSrdSectionReference',
    pattern: /see appendix B for stat block options/g,
    replacement: 'see "Animals" in "Monsters" for stat block options',
  },
  {
    id: 'wildShapeOtherSources',
    pattern: /you may look in Monsters or elsewhere for eligible Beasts/g,
    replacement: 'you may look in other sources for eligible Beasts',
  },
  {
    id: 'familiarSrdSectionReference',
    pattern: /see appendix B for the familiar's stat block/g,
    replacement: 'see "Monsters" for the familiar\'s stat block',
  },
  {
    id: 'removeNonSrdFamiliarForm',
    pattern: /, \{@creature Slaad Tadpole\|XMM}/g,
    replacement: '',
  },
  {
    id: 'foldingBoatSrdSectionReference',
    pattern: /appear in the \{@book Player's Handbook\|XPHB}/gi,
    replacement: 'appear in "Equipment"',
  },
  {
    id: 'fallingNetSrdSectionReference',
    pattern:
      /see the \{@book Player's Handbook\|XPHB} for the \{@item Net\|XPHB\|Net's} statistics/gi,
    replacement: 'see "Adventuring Gear" for the Net\'s statistics',
  },
  {
    id: 'removePactWeaponChapterReference',
    pattern: / \(see chapter 5 for weapon options\)/g,
    replacement: '',
  },
  {
    id: 'abilityScoreImprovementFeatReference2014',
    pattern:
      /If your GM allows the use of feats, you may instead take a \{@5etools feat\|feats\.html}\./g,
    replacement:
      'Using the optional feats rule, you can forgo taking that feature to take a feat of your choice instead.',
  },
  {
    id: 'abilityScoreImprovementFeatReference2024',
    pattern:
      /\{@feat Ability Score Improvement\|XPHB} feat or another \{@5etools feat\|feats\.html}/gi,
    replacement: '{@feat Ability Score Improvement|XPHB} feat (see "Feats") or another feat',
  },
  {
    id: 'epicBoonFeatReference2024',
    pattern:
      /an \{@filter Epic Boon feat\|feats\|category=EB} or another \{@5etools feat\|feats\.html}/g,
    replacement: 'an Epic Boon feat (see "Feats") or another feat',
  },
  {
    id: 'findFamiliarMonstersReference2024',
    pattern: /has the statistics of the chosen form, though/g,
    replacement: 'has the statistics of the chosen form (see "Monsters"), though',
  },
  {
    id: 'fingerOfDeathMonstersReference2024',
    pattern: /as a \{@creature Zombie\|XMM} that follows/g,
    replacement: 'as a {@creature Zombie|XMM} (see "Monsters") that follows',
  },
  {
    id: 'phantomSteedMonstersReference2024',
    pattern: /the \{@creature Riding Horse\|XMM} stat block, except/g,
    replacement: 'the {@creature Riding Horse|XMM} stat block (see "Monsters"), except',
  },
  {
    id: 'polymorphSrdGrammar2024',
    pattern: /shape-shift into Beast form/g,
    replacement: 'shape-shift into a Beast form',
  },
  {
    id: 'wishSrdScope2024',
    pattern:
      /If your wish would undo the multiverse itself, threaten the City of Sigil, or affect the Lady of Pain in any way, you see an image of her in your mind for a moment; she shakes her head, and your wish fails\./g,
    replacement: 'If your wish would undo the multiverse itself, your wish fails.',
  },
  {
    id: 'appendixAReference',
    pattern: /as explained in the appendix/g,
    replacement: 'as explained in appendix A',
  },
  {
    id: 'appendixAReference',
    pattern: /condition \(see the appendix\)/g,
    replacement: 'condition (see appendix A)',
  },
  {
    id: 'remove2014SpellcastingChapterReferences',
    pattern:
      / See \{@book chapter 10\|PHB\|10} for the general rules of spellcasting and \{@book chapter 11\|PHB\|11} for (?:a selection of |the )\{@filter [^}]+}\./g,
    replacement: '',
  },
  {
    id: 'removeReadyConcentrationChapterReference2014',
    pattern: / \(explained in \{@book chapter 10\|phb\|10\|concentration}\)/g,
    replacement: '',
  },
  {
    id: 'spellSlotClassQualifier',
    pattern:
      /to cast your \{@filter (?:bard|cleric|druid|paladin|ranger|sorcerer) spells\|spells\|class=(?:bard|cleric|druid|paladin|ranger|sorcerer)}/gi,
    replacement: 'to cast your spells',
  },
  {
    id: 'spellSlotClassQualifier',
    pattern: /to cast your wizard spells/gi,
    replacement: 'to cast your spells',
  },
  {
    id: 'wizardStudyTerminology',
    pattern: /since you learn your wizard spells through/g,
    replacement: 'since you learn your spells through',
  },
  {
    id: 'magicalSecretsClassGrammar',
    pattern: /spells from any classes/g,
    replacement: 'spells from any class',
  },
  {
    id: 'rodOfLordlyMightTypo',
    pattern: /target rakes an extra/g,
    replacement: 'target takes an extra',
  },
  {
    id: 'magicItemRollGrammar',
    pattern: /attack and damage roll(?= made| but)/g,
    replacement: 'attack and damage rolls',
  },
]

export function isSrdRoot(record) {
  return Boolean(
    record && typeof record === 'object' && (record.srd === true || record.srd52 === true),
  )
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sortObject(value[key])]),
  )
}

export function stableJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`
}

export function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(join(root, ...relativePath.split('/')), 'utf8'))
}

function selectedArray(payload, key) {
  const values = Array.isArray(payload?.[key]) ? payload[key] : []
  return values.filter(isSrdRoot)
}

function addFile(files, relativePath, payload) {
  files.set(relativePath, stableJson(payload))
}

function sanitizeSrdText(value, coverage) {
  let output = value
  const exactCorrection = EXACT_SRD_TEXT_CORRECTIONS.get(output)
  if (exactCorrection) {
    coverage.textCorrections[exactCorrection.id] =
      (coverage.textCorrections[exactCorrection.id] ?? 0) + 1
    output = exactCorrection.replacement
  }

  const abbreviatedGameMasters = output.match(/\bDM\b/g)?.length ?? 0
  if (abbreviatedGameMasters > 0) {
    coverage.textCorrections.gameMasterAbbreviation =
      (coverage.textCorrections.gameMasterAbbreviation ?? 0) + abbreviatedGameMasters
    output = output.replace(/\bDM\b/g, 'GM')
  }

  const namedGameMasters = output.match(/\bDungeon Master\b(?!['’]s\b)/g)?.length ?? 0
  if (namedGameMasters > 0) {
    coverage.textCorrections.gameMasterTerminology =
      (coverage.textCorrections.gameMasterTerminology ?? 0) + namedGameMasters
    output = output.replace(/\bDungeon Master\b(?!['’]s\b)/g, 'Game Master')
  }

  for (const correction of INLINE_SRD_TEXT_CORRECTIONS) {
    const matches = output.match(correction.pattern)?.length ?? 0
    if (matches === 0) continue
    coverage.textCorrections[correction.id] =
      (coverage.textCorrections[correction.id] ?? 0) + matches
    output = output.replace(correction.pattern, correction.replacement)
  }

  return output
}

function sanitizeDataPayload(value, coverage) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string') {
        const exclusionId = NON_SRD_STRING_ENTRIES.get(entry)
        if (exclusionId) {
          coverage.strippedContent[exclusionId] = (coverage.strippedContent[exclusionId] ?? 0) + 1
          return []
        }
      }
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const exclusionId = NON_SRD_NESTED_ENTRIES.get(entry.name)
        const introExclusionId = NON_SRD_NESTED_ENTRY_INTROS.get(entry.entries?.[0])
        const appliedExclusionId = exclusionId ?? introExclusionId
        if (appliedExclusionId) {
          coverage.strippedContent[appliedExclusionId] =
            (coverage.strippedContent[appliedExclusionId] ?? 0) + 1
          return []
        }
      }
      return [sanitizeDataPayload(entry, coverage)]
    })
  }
  if (typeof value === 'string') return sanitizeSrdText(value, coverage)
  if (!value || typeof value !== 'object') return value

  const stripXphbAmmunitionEntries =
    value.source === 'XPHB' && value.type === 'A|XPHB' && XPHB_AMMUNITION_RECORDS.has(value.name)
  const filterSrd51DeityDomains =
    value.source === 'PHB' &&
    value.srd === true &&
    typeof value.pantheon === 'string' &&
    Array.isArray(value.domains)
  const structuredCorrection = STRUCTURED_SRD_RECORD_CORRECTIONS.get(
    `${value.name ?? ''}|${value.source ?? ''}`,
  )
  const output = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'entries' && stripXphbAmmunitionEntries) {
      coverage.strippedContent.xphbAmmunitionBookDescriptions =
        (coverage.strippedContent.xphbAmmunitionBookDescriptions ?? 0) + 1
      continue
    }
    if (key === 'domains' && filterSrd51DeityDomains) {
      const filteredDomains = entry.filter((domain) => SRD_51_DEITY_DOMAINS.has(domain))
      const removedCount = entry.length - filteredDomains.length
      if (removedCount > 0) {
        coverage.strippedContent.deitySupplementalDomains =
          (coverage.strippedContent.deitySupplementalDomains ?? 0) + removedCount
      }
      output[key] = filteredDomains
      continue
    }
    if (STRIPPED_METADATA_KEYS.has(key)) {
      coverage.strippedMetadata[key] = (coverage.strippedMetadata[key] ?? 0) + 1
      continue
    }
    if (structuredCorrection && Object.hasOwn(structuredCorrection.fields, key)) {
      coverage.structuredCorrections[structuredCorrection.id] =
        (coverage.structuredCorrections[structuredCorrection.id] ?? 0) + 1
      output[key] = structuredCorrection.fields[key]
      continue
    }
    output[key] = sanitizeDataPayload(entry, coverage)
  }
  return output
}

function assertBundledDataPolicy(value, relativePath, allowedSources, path = '$') {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertBundledDataPolicy(entry, relativePath, allowedSources, `${path}[${index}]`)
    }
    return
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /\{@(?:image|img)\b/i.test(value)) {
      throw new Error(`Prohibited presentation reference in ${relativePath} at ${path}`)
    }
    return
  }

  if (typeof value.type === 'string' && value.type.toLowerCase() === 'image') {
    throw new Error(`Prohibited image payload in ${relativePath} at ${path}`)
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase()
    if (PROHIBITED_PRESENTATION_KEYS.has(normalizedKey)) {
      throw new Error(`Prohibited presentation field ${key} in ${relativePath} at ${path}`)
    }
    if (
      normalizedKey.endsWith('source') &&
      typeof entry === 'string' &&
      !allowedSources.has(entry.toUpperCase())
    ) {
      throw new Error(`Unexpected source ${entry} in ${relativePath} at ${path}.${key}`)
    }
    assertBundledDataPolicy(entry, relativePath, allowedSources, `${path}.${key}`)
  }
}

function entityIdentity(record, collection, fallback) {
  if (!record || typeof record !== 'object') return fallback
  const name = typeof record.name === 'string' ? record.name : fallback
  const source = typeof record.source === 'string' ? record.source : 'unknown'
  const base = `${name}|${source}`
  if (collection === 'classFeature') {
    return `${base}|${record.className ?? ''}|${record.classSource ?? ''}|${record.level ?? ''}`
  }
  if (collection === 'subclassFeature') {
    return `${base}|${record.className ?? ''}|${record.classSource ?? ''}|${record.subclassShortName ?? ''}|${record.subclassSource ?? ''}|${record.level ?? ''}`
  }
  return base
}

function auditIdentity(record, collection, fallback) {
  const identity = entityIdentity(record, collection, fallback)
  if (collection === 'deity' && typeof record?.pantheon === 'string') {
    return `${identity}|${record.pantheon}`
  }
  return identity
}

function normalized(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function prepareAuditPolicy(allowlist, provenance) {
  const documentVersions = new Set(provenance.documents.map((document) => document.version))
  if (!Array.isArray(allowlist?.allowedSources) || allowlist.allowedSources.length === 0) {
    throw new Error('allowedSources must contain at least one source')
  }
  const allowedSources = new Set()
  for (const source of allowlist.allowedSources) {
    const normalizedSource = requireNonEmptyString(source, 'allowedSources[]').toUpperCase()
    if (allowedSources.has(normalizedSource)) {
      throw new Error(`Duplicate allowed source ${normalizedSource}`)
    }
    allowedSources.add(normalizedSource)
  }
  const rootExclusions = new Map()
  const dependencies = new Map()
  const referenceExclusions = new Map()

  for (const [key, rule] of Object.entries(allowlist?.rootExclusions ?? {})) {
    const reason = requireNonEmptyString(rule?.reason, `rootExclusions.${key}.reason`)
    if (!Array.isArray(rule?.identities) || rule.identities.length === 0) {
      throw new Error(`rootExclusions.${key}.identities must contain at least one identity`)
    }
    const identities = new Set()
    for (const identity of rule.identities) {
      requireNonEmptyString(identity, `rootExclusions.${key}.identities[]`)
      if (identities.has(identity)) throw new Error(`Duplicate root exclusion ${key}:${identity}`)
      identities.add(identity)
    }
    rootExclusions.set(key, { identities, reason, used: new Set() })
  }

  for (const [index, rule] of (allowlist?.dependencies ?? []).entries()) {
    const collection = requireNonEmptyString(rule?.collection, `dependencies[${index}].collection`)
    const srdVersion = requireNonEmptyString(rule?.srdVersion, `dependencies[${index}].srdVersion`)
    if (!documentVersions.has(srdVersion)) {
      throw new Error(`dependencies[${index}] references unknown SRD ${srdVersion}`)
    }
    const officialSection = requireNonEmptyString(
      rule?.officialSection,
      `dependencies[${index}].officialSection`,
    )
    const reason = requireNonEmptyString(rule?.reason, `dependencies[${index}].reason`)
    if (!Array.isArray(rule?.identities) || rule.identities.length === 0) {
      throw new Error(`dependencies[${index}].identities must contain at least one identity`)
    }
    for (const identity of rule.identities) {
      requireNonEmptyString(identity, `dependencies[${index}].identities[]`)
      const key = `${collection}:${identity}`
      if (dependencies.has(key)) throw new Error(`Duplicate dependency approval ${key}`)
      dependencies.set(key, { collection, identity, srdVersion, officialSection, reason })
    }
  }

  for (const [index, rule] of (allowlist?.referenceExclusions ?? []).entries()) {
    const collection = requireNonEmptyString(
      rule?.collection,
      `referenceExclusions[${index}].collection`,
    )
    const source = requireNonEmptyString(rule?.source, `referenceExclusions[${index}].source`)
    const reason = requireNonEmptyString(rule?.reason, `referenceExclusions[${index}].reason`)
    const key = `${collection}:${source.toUpperCase()}`
    if (referenceExclusions.has(key)) throw new Error(`Duplicate reference exclusion ${key}`)
    referenceExclusions.set(key, { collection, source: source.toUpperCase(), reason, used: 0 })
  }

  return {
    allowedSources,
    rootExclusions,
    dependencies,
    referenceExclusions,
    usedDependencies: new Set(),
  }
}

function assertAuditPolicyConsumed(policy) {
  for (const [key, rule] of policy.rootExclusions) {
    const unused = [...rule.identities].filter((identity) => !rule.used.has(identity))
    if (unused.length > 0)
      throw new Error(`Unused root exclusions for ${key}: ${unused.join(', ')}`)
  }
  const unusedDependencies = [...policy.dependencies.keys()].filter(
    (key) => !policy.usedDependencies.has(key),
  )
  if (unusedDependencies.length > 0) {
    throw new Error(`Unused dependency approvals: ${unusedDependencies.join(', ')}`)
  }
  for (const [key, rule] of policy.referenceExclusions) {
    if (rule.used === 0) throw new Error(`Unused reference exclusion ${key}`)
  }
}

function assertUniqueIdentities(relativePath, collection, records) {
  const seen = new Set()
  for (const [index, record] of records.entries()) {
    const identity = entityIdentity(record, collection, `${collection}[${index}]`)
    if (seen.has(identity)) {
      throw new Error(`Duplicate ${identity} in ${relativePath}#${collection}`)
    }
    seen.add(identity)
  }
}

function filterCollections(payload, collections, relativePath, coverage, auditPolicy) {
  const output = {}
  for (const collection of collections) {
    const exclusionKey = `${relativePath}#${collection}`
    const exclusionRule = auditPolicy.rootExclusions.get(exclusionKey)
    const exclusions = exclusionRule?.identities ?? new Set()
    const candidates = selectedArray(payload, collection)
    const records = candidates.filter((record, index) => {
      const identity = auditIdentity(record, collection, `${collection}[${index}]`)
      if (!exclusions.has(identity)) return true
      exclusionRule.used.add(identity)
      return false
    })
    assertUniqueIdentities(relativePath, collection, records)
    output[collection] = records
    coverage.roots[`${relativePath}#${collection}`] = records.length
    if (candidates.length !== records.length) {
      coverage.exclusions[exclusionKey] = candidates.length - records.length
      coverage.exclusionReasons[exclusionKey] = exclusionRule.reason
    }
  }
  return output
}

function parseReference(reference) {
  const [identifier, source] = reference.split('|')
  return { identifier, source }
}

function supportIdentity(record) {
  return `${record.abbreviation}|${record.source}`
}

function findSupportRecord(records, reference) {
  const { identifier, source } = parseReference(reference)
  if (source) {
    return records.find(
      (record) => record?.abbreviation === identifier && record?.source === source,
    )
  }

  const matches = records.filter((record) => record?.abbreviation === identifier)
  if (matches.length === 1) return matches[0]
  return (
    matches.find((record) => record?.source === 'PHB') ??
    matches.find((record) => record?.source === 'DMG')
  )
}

function collectItemSupportReferences(items) {
  const itemType = new Set()
  const itemProperty = new Set()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.type === 'string') itemType.add(item.type)
    if (Array.isArray(item.property)) {
      for (const property of item.property) {
        if (typeof property === 'string') itemProperty.add(property)
      }
    }
  }
  return { itemType, itemProperty }
}

function selectApprovedSupport(records, references, collection, auditPolicy, coverage) {
  const selected = []
  const seen = new Set()

  for (const reference of [...references].sort()) {
    const record = findSupportRecord(records, reference)
    if (!record) throw new Error(`Missing ${collection} dependency for ${reference}`)
    const identity = supportIdentity(record)
    const approvalKey = `${collection}:${identity}`
    const approval = auditPolicy.dependencies.get(approvalKey)
    if (!approval) {
      throw new Error(
        `Unapproved ${collection} dependency ${identity} (referenced as ${reference})`,
      )
    }
    auditPolicy.usedDependencies.add(approvalKey)
    if (seen.has(identity)) continue
    seen.add(identity)
    selected.push(record)
    coverage.dependencies.push({
      collection,
      identity,
      reason: approval.reason,
      reference,
      srdVersion: approval.srdVersion,
      officialSection: approval.officialSection,
    })
  }

  return selected.sort((left, right) => supportIdentity(left).localeCompare(supportIdentity(right)))
}

function parseClassFeatureReference(rawReference, owner) {
  const reference =
    typeof rawReference === 'string'
      ? rawReference
      : rawReference && typeof rawReference === 'object'
        ? rawReference.classFeature
        : undefined
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error(`Invalid classFeature reference on ${owner.name}|${owner.source}`)
  }
  const parts = reference.split('|')
  const level = Number.parseInt(parts[3] ?? '', 10)
  return {
    reference,
    name: parts[0] ?? '',
    className: parts[1] || owner.name || '',
    classSource: parts[2] || owner.source || '',
    level: Number.isNaN(level) ? undefined : level,
    source: parts[4] || parts[2] || owner.source || '',
  }
}

function parseSubclassFeatureReference(reference, owner) {
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error(`Invalid subclassFeature reference on ${owner.name}|${owner.source}`)
  }
  const parts = reference.split('|')
  const level = Number.parseInt(parts[5] ?? '', 10)
  return {
    reference,
    name: parts[0] ?? '',
    className: parts[1] || owner.className || '',
    classSource: parts[2] || owner.classSource || owner.source || '',
    subclassShortName: parts[3] || owner.shortName || owner.subclassShortName || '',
    subclassSource: parts[4] || owner.source || '',
    level: Number.isNaN(level) ? undefined : level,
    source: parts[6] || parts[4] || owner.source || '',
  }
}

function matchesReference(record, reference, fields) {
  return fields.every((field) => {
    if (field === 'level') return reference.level === undefined || record?.level === reference.level
    return normalized(record?.[field]) === normalized(reference[field])
  })
}

function findClassFeatureRecord(records, reference) {
  return records.find((record) =>
    matchesReference(record, reference, ['name', 'source', 'className', 'classSource', 'level']),
  )
}

function findSubclassFeatureRecord(records, reference) {
  return records.find((record) =>
    matchesReference(record, reference, [
      'name',
      'source',
      'className',
      'classSource',
      'subclassShortName',
      'subclassSource',
      'level',
    ]),
  )
}

function parseNamedReference(rawReference, owner, field) {
  if (typeof rawReference !== 'string' || rawReference.length === 0) {
    throw new Error(`Invalid ${field} reference on ${owner.name}|${owner.source}`)
  }
  const [name, source] = rawReference.split('|')
  return {
    reference: rawReference,
    name,
    source: source || owner.source || '',
  }
}

function findNamedRecord(records, reference) {
  return records.find(
    (record) =>
      normalized(record?.name) === normalized(reference.name) &&
      normalized(record?.source) === normalized(reference.source),
  )
}

function isSourceQualifiedItemReference(value) {
  if (typeof value !== 'string' || value.includes('{@')) return false
  const [name, source] = value.split('|')
  return Boolean(name?.trim() && source?.trim() && /^[a-z0-9-]+$/i.test(source.trim()))
}

function collectItemReferences(value, references, includeItemArrays = false) {
  if (Array.isArray(value)) {
    for (const entry of value) collectItemReferences(entry, references, includeItemArrays)
    return
  }
  if (!value || typeof value !== 'object') return

  if (isSourceQualifiedItemReference(value.item)) references.add(value.item)
  if (includeItemArrays && Array.isArray(value.items)) {
    for (const entry of value.items) {
      if (isSourceQualifiedItemReference(entry)) references.add(entry)
    }
  }
  for (const entry of Object.values(value)) {
    collectItemReferences(entry, references, includeItemArrays)
  }
}

function parseItemReference(reference) {
  const [name, source] = reference.split('|')
  if (!name?.trim() || !source?.trim()) {
    throw new Error(`Invalid source-qualified item reference ${reference}`)
  }
  return { reference, name, source }
}

function findItemReferenceMatches(collections, reference) {
  return collections.flatMap(({ collection, records }) =>
    records
      .filter(
        (record) =>
          normalized(record?.name) === normalized(reference.name) &&
          normalized(record?.source) === normalized(reference.source),
      )
      .map((record) => ({ collection, record })),
  )
}

function closeItemReferences({
  payloads,
  outputCollections,
  sourceCollections,
  auditPolicy,
  coverage,
}) {
  const references = new Set()
  for (const payload of payloads) collectItemReferences(payload, references)
  const processed = new Set()

  while (processed.size < references.size) {
    const rawReference = [...references].filter((entry) => !processed.has(entry)).sort()[0]
    processed.add(rawReference)
    const reference = parseItemReference(rawReference)
    const outputMatches = findItemReferenceMatches(outputCollections, reference)
    if (outputMatches.length > 1) {
      throw new Error(`Ambiguous item dependency ${rawReference}`)
    }
    if (outputMatches.length === 1) continue

    const sourceMatches = findItemReferenceMatches(sourceCollections, reference)
    if (sourceMatches.length === 0) throw new Error(`Missing item dependency ${rawReference}`)
    if (sourceMatches.length > 1) throw new Error(`Ambiguous item dependency ${rawReference}`)

    const dependency = sourceMatches[0]
    const identity = entityIdentity(dependency.record, dependency.collection, rawReference)
    const approvalKey = `${dependency.collection}:${identity}`
    const approval = auditPolicy.dependencies.get(approvalKey)
    if (!approval) {
      throw new Error(
        `Unapproved ${dependency.collection} dependency ${identity} (referenced as ${rawReference})`,
      )
    }

    auditPolicy.usedDependencies.add(approvalKey)
    outputCollections
      .find(({ collection }) => collection === dependency.collection)
      .records.push(dependency.record)
    coverage.dependencies.push({
      collection: dependency.collection,
      identity,
      reason: approval.reason,
      reference: rawReference,
      srdVersion: approval.srdVersion,
      officialSection: approval.officialSection,
    })
    collectItemReferences(dependency.record, references, true)
  }

  recordReferenceCoverage(coverage, 'distributed-data#itemReferences', processed.size, 0)
}

function recordReferenceCoverage(coverage, key, resolved, excluded) {
  coverage.references[key] = { resolved, excluded }
}

function filterAuditedFeatureReferences({
  owners,
  records,
  field,
  collection,
  relativePath,
  parseReference,
  findRecord,
  auditPolicy,
  coverage,
}) {
  let resolved = 0
  let excluded = 0
  const exclusionReasons = new Set()
  const output = owners.map((owner) => {
    if (!Array.isArray(owner?.[field])) return owner
    const references = owner[field].filter((rawReference) => {
      const reference = parseReference(rawReference, owner)
      if (findRecord(records, reference)) {
        resolved += 1
        return true
      }
      const exclusionKey = `${collection}:${reference.source.toUpperCase()}`
      const exclusion = auditPolicy.referenceExclusions.get(exclusionKey)
      if (!exclusion) {
        throw new Error(
          `Missing ${collection} dependency ${reference.reference} in ${relativePath}`,
        )
      }
      exclusion.used += 1
      excluded += 1
      exclusionReasons.add(exclusion.reason)
      coverage.referenceExclusions.push({
        collection,
        reference: reference.reference,
        owner: `${owner.name}|${owner.source}`,
        reason: exclusion.reason,
      })
      return false
    })
    return { ...owner, [field]: references }
  })
  const coverageKey = `${relativePath}#${field}`
  recordReferenceCoverage(coverage, coverageKey, resolved, excluded)
  if (excluded > 0) {
    coverage.exclusions[coverageKey] = excluded
    coverage.exclusionReasons[coverageKey] = [...exclusionReasons].sort().join(' ')
  }
  return output
}

const OMIT_REFERENCE = Symbol('omit-reference')

function filterAuditedInlineReferences({
  records,
  relativePath,
  referenceCollections,
  auditPolicy,
  coverage,
}) {
  const counts = new Map(
    [...referenceCollections.values()].map(({ collection }) => [
      collection,
      { resolved: 0, excluded: 0, reasons: new Set() },
    ]),
  )

  function visit(candidate, owner) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((entry) => visit(entry, owner))
        .filter((entry) => entry !== OMIT_REFERENCE)
    }
    if (!candidate || typeof candidate !== 'object') return candidate

    const referenceCollection = referenceCollections.get(candidate.type)
    if (referenceCollection) {
      const reference = referenceCollection.parse(candidate[referenceCollection.field], owner)
      const count = counts.get(referenceCollection.collection)
      let resolvedRecord = referenceCollection.find(referenceCollection.records, reference)
      let unapprovedIdentity
      if (!resolvedRecord && referenceCollection.sourceRecords) {
        const dependency = referenceCollection.find(referenceCollection.sourceRecords, reference)
        if (dependency) {
          const identity = auditIdentity(
            dependency,
            referenceCollection.collection,
            reference.reference,
          )
          const approvalKey = `${referenceCollection.collection}:${identity}`
          const approval = auditPolicy.dependencies.get(approvalKey)
          if (approval) {
            auditPolicy.usedDependencies.add(approvalKey)
            referenceCollection.records.push(dependency)
            coverage.dependencies.push({
              collection: referenceCollection.collection,
              identity,
              reason: approval.reason,
              reference: reference.reference,
              srdVersion: approval.srdVersion,
              officialSection: approval.officialSection,
            })
            resolvedRecord = dependency
          } else {
            unapprovedIdentity = identity
          }
        }
      }
      if (resolvedRecord) {
        count.resolved += 1
      } else {
        const exclusionKey = `${referenceCollection.collection}:${reference.source.toUpperCase()}`
        const exclusion = auditPolicy.referenceExclusions.get(exclusionKey)
        if (!exclusion) {
          if (unapprovedIdentity) {
            throw new Error(
              `Unapproved ${referenceCollection.collection} dependency ${unapprovedIdentity} (referenced as ${reference.reference})`,
            )
          }
          throw new Error(
            `Missing ${referenceCollection.collection} dependency ${reference.reference} in ${relativePath}`,
          )
        }
        exclusion.used += 1
        count.excluded += 1
        count.reasons.add(exclusion.reason)
        coverage.referenceExclusions.push({
          collection: referenceCollection.collection,
          reference: reference.reference,
          owner: `${owner.name}|${owner.source}`,
          reason: exclusion.reason,
        })
        return OMIT_REFERENCE
      }
    }

    return Object.fromEntries(
      Object.entries(candidate)
        .map(([key, entry]) => [key, visit(entry, owner)])
        .filter(([, entry]) => entry !== OMIT_REFERENCE),
    )
  }

  const output = records.map((record) => visit(record, record))
  for (const [collection, count] of counts) {
    const coverageKey = `${relativePath}#inline${collection[0].toUpperCase()}${collection.slice(1)}`
    recordReferenceCoverage(coverage, coverageKey, count.resolved, count.excluded)
    if (count.excluded > 0) {
      coverage.exclusions[coverageKey] = count.excluded
      coverage.exclusionReasons[coverageKey] = [...count.reasons].sort().join(' ')
    }
  }
  return output
}

function validateBaseItemReferences(items, baseitems, coverage) {
  let resolved = 0
  for (const item of items) {
    if (typeof item?.baseItem !== 'string') continue
    const [name, source] = item.baseItem.split('|')
    const matches = baseitems.filter(
      (baseitem) =>
        normalized(baseitem?.name) === normalized(name) &&
        (!source || normalized(baseitem?.source) === normalized(source)),
    )
    if (matches.length !== 1) {
      throw new Error(
        `${matches.length === 0 ? 'Missing' : 'Ambiguous'} baseitem dependency ${item.baseItem} for ${item.name}|${item.source}`,
      )
    }
    resolved += 1
  }
  recordReferenceCoverage(coverage, 'items.json#baseItem', resolved, 0)
}

function itemEntryTemplateValue(record, field, helper, reference) {
  const rawValue = record?.[field]
  const values = Array.isArray(rawValue) ? rawValue : [rawValue]
  if (
    values.length === 0 ||
    values.some((value) => typeof value !== 'string' || value.trim() === '')
  ) {
    throw new Error(
      `Item-entry reference ${reference} for ${record?.name}|${record?.source} requires item.${field}.`,
    )
  }
  const rendered = values.join(', ')
  if (!helper || helper === 'getFullImmRes') return rendered
  throw new Error(`Unsupported item-entry template helper ${helper} in ${reference}.`)
}

function renderItemEntryTemplate(value, record, reference) {
  if (typeof value === 'string') {
    const rendered = value.replace(ITEM_ENTRY_TEMPLATE_PATTERN, (_match, helper, field) =>
      itemEntryTemplateValue(record, field, helper, reference),
    )
    if (/\{\{[^}]+}}/.test(rendered)) {
      throw new Error(`Unsupported item-entry template expression in ${reference}.`)
    }
    return rendered
  }
  if (Array.isArray(value)) {
    return value.map((entry) => renderItemEntryTemplate(entry, record, reference))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      renderItemEntryTemplate(entry, record, reference),
    ]),
  )
}

function materializeItemEntryReferences(items, itemEntries, coverage) {
  const entriesByIdentity = new Map()
  for (const entry of itemEntries ?? []) {
    if (typeof entry?.name !== 'string' || typeof entry?.source !== 'string') continue
    const key = `${normalized(entry.name)}|${normalized(entry.source)}`
    if (entriesByIdentity.has(key)) throw new Error(`Duplicate item-entry template ${key}.`)
    entriesByIdentity.set(key, entry)
  }

  const visit = (value, record) => {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => {
        if (typeof entry !== 'string') return [visit(entry, record)]
        const match = entry.match(ITEM_ENTRY_REFERENCE_PATTERN)
        if (!match) return [entry]
        const [name, source = record.source] = match[1].split('|')
        const key = `${normalized(name)}|${normalized(source)}`
        const template = entriesByIdentity.get(key)
        if (!template || !Array.isArray(template.entriesTemplate)) {
          throw new Error(
            `Missing item-entry template ${match[1]} for ${record.name}|${record.source}.`,
          )
        }
        coverage.materializedItemEntries[key] = (coverage.materializedItemEntries[key] ?? 0) + 1
        const rendered = renderItemEntryTemplate(template.entriesTemplate, record, match[1])
        return visit(rendered, record)
      })
    }
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, visit(entry, record)]),
    )
  }

  return items.map((record) => {
    const {
      classFeatures: _classFeatures,
      optionalfeatures: _optionalfeatures,
      ...distributedRecord
    } = record
    if (Object.hasOwn(record, 'classFeatures')) {
      coverage.strippedMetadata.classFeatures = (coverage.strippedMetadata.classFeatures ?? 0) + 1
    }
    if (Object.hasOwn(record, 'optionalfeatures')) {
      coverage.strippedMetadata.optionalfeatures =
        (coverage.strippedMetadata.optionalfeatures ?? 0) + 1
    }
    return {
      ...distributedRecord,
      ...(Array.isArray(record?.entries) ? { entries: visit(record.entries, record) } : {}),
    }
  })
}

function filterSpellLookupEntry(entry) {
  if (!entry || typeof entry !== 'object') return {}
  const output = {}

  if (entry.class && typeof entry.class === 'object') {
    const classLookup = Object.fromEntries(
      Object.entries(entry.class).filter(([source]) => ALLOWED_SPELL_CLASS_SOURCES.has(source)),
    )
    if (Object.keys(classLookup).length > 0) output.class = classLookup
  }

  if (entry.subclass && typeof entry.subclass === 'object') {
    const subclassLookup = {}
    for (const [classSource, classNames] of Object.entries(entry.subclass)) {
      if (
        !ALLOWED_SPELL_CLASS_SOURCES.has(classSource) ||
        !classNames ||
        typeof classNames !== 'object'
      ) {
        continue
      }
      const filteredClassNames = {}
      for (const [className, subclassSources] of Object.entries(classNames)) {
        if (!subclassSources || typeof subclassSources !== 'object') continue
        const filteredSubclassSources = Object.fromEntries(
          Object.entries(subclassSources).filter(([source]) =>
            ALLOWED_SPELL_CLASS_SOURCES.has(source),
          ),
        )
        if (Object.keys(filteredSubclassSources).length > 0) {
          filteredClassNames[className] = filteredSubclassSources
        }
      }
      if (Object.keys(filteredClassNames).length > 0)
        subclassLookup[classSource] = filteredClassNames
    }
    if (Object.keys(subclassLookup).length > 0) output.subclass = subclassLookup
  }

  return output
}

function filterSpellLookup(payload, spellsBySource) {
  const output = {}
  for (const [source, spells] of spellsBySource) {
    const sourceKey = source.toLowerCase()
    const sourceLookup = payload?.[sourceKey]
    if (!sourceLookup || typeof sourceLookup !== 'object') continue
    const selectedNames = new Set(spells.map((spell) => String(spell.name).toLowerCase()))
    const entries = Object.fromEntries(
      Object.entries(sourceLookup)
        .filter(([name]) => selectedNames.has(name.toLowerCase()))
        .map(([name, entry]) => [name, filterSpellLookupEntry(entry)]),
    )
    output[sourceKey] = entries
  }
  return output
}

function recordInventoryIdentity(record, collection, fallback) {
  if (
    (collection === 'itemProperty' || collection === 'itemType') &&
    typeof record?.abbreviation === 'string' &&
    typeof record?.source === 'string'
  ) {
    return supportIdentity(record)
  }
  return auditIdentity(record, collection, fallback)
}

function buildDistributedRecordInventory(files, coverage, provenance) {
  const documentVersions = new Set(provenance.documents.map((document) => document.version))
  const dependencies = new Map(
    coverage.dependencies.map((dependency) => [
      `${dependency.collection}:${dependency.identity}`,
      dependency,
    ]),
  )
  const usedDependencies = new Set()
  const seenIdentities = new Set()
  const records = []

  for (const [relativePath, contents] of [...files.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!relativePath.startsWith('data/')) continue
    const payload = JSON.parse(contents)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue

    for (const [collection, candidates] of Object.entries(payload).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!Array.isArray(candidates)) continue
      for (const [index, record] of candidates.entries()) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          throw new Error(`Invalid distributed record in ${relativePath}#${collection}[${index}]`)
        }
        const identity = recordInventoryIdentity(record, collection, `${collection}[${index}]`)
        const identityKey = `${collection}:${identity}`
        if (seenIdentities.has(identityKey)) {
          throw new Error(`Duplicate distributed identity ${identityKey}`)
        }
        seenIdentities.add(identityKey)

        const markers = [...SRD_MARKER_VERSIONS.keys()].filter((marker) => record[marker] === true)
        const base = {
          relativePath,
          collection,
          identity,
          recordSha256: sha256(stableJson(record)),
        }

        if (markers.length > 0) {
          if (markers.length !== 1) {
            throw new Error(
              `Ambiguous SRD markers on ${relativePath}#${collection}:${identity}: ${markers.join(', ')}`,
            )
          }
          const marker = markers[0]
          const srdVersion = SRD_MARKER_VERSIONS.get(marker)
          if (!documentVersions.has(srdVersion)) {
            throw new Error(
              `Distributed record ${relativePath}#${collection}:${identity} references unknown SRD ${srdVersion}`,
            )
          }
          records.push({
            ...base,
            provenanceType: 'root-marker',
            marker,
            srdVersion,
          })
          continue
        }

        const dependency = dependencies.get(identityKey)
        if (!dependency) {
          throw new Error(`Unprovenanced distributed record ${relativePath}#${identityKey}`)
        }
        if (usedDependencies.has(identityKey)) {
          throw new Error(`Duplicate distributed dependency ${identityKey}`)
        }
        usedDependencies.add(identityKey)
        records.push({
          ...base,
          provenanceType: 'approved-dependency',
          srdVersion: dependency.srdVersion,
          officialSection: dependency.officialSection,
          reason: dependency.reason,
        })
      }
    }
  }

  const missingDependencies = [...dependencies.keys()].filter((key) => !usedDependencies.has(key))
  if (missingDependencies.length > 0) {
    throw new Error(`Approved dependencies missing from output: ${missingDependencies.join(', ')}`)
  }
  return records
}

function buildManifest({ files, coverage, provenance, upstreamRevision }) {
  const checksums = Object.fromEntries(
    [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relativePath, contents]) => [relativePath, sha256(contents)]),
  )

  return {
    schemaVersion: 1,
    packId: 'tavern-born-srd-core',
    packVersion: provenance.packVersion,
    distributionStatus: provenance.distributionStatus,
    generatedAt: provenance.snapshotGeneratedAt,
    extractorVersion: EXTRACTOR_VERSION,
    upstreamRevision,
    documents: provenance.documents,
    license: provenance.license,
    transformationNotice: provenance.transformationNotice,
    coverage,
    files: checksums,
  }
}

export async function buildSrdSnapshot({ sourceRoot, provenance, allowlist, upstreamRevision }) {
  if (!sourceRoot) throw new Error('sourceRoot is required')
  if (!upstreamRevision) throw new Error('upstreamRevision is required')
  if (
    !provenance?.packVersion ||
    !provenance.snapshotGeneratedAt ||
    !Array.isArray(provenance.documents)
  ) {
    throw new Error('A valid provenance document is required')
  }
  for (const document of provenance.documents) {
    if (
      typeof document?.version !== 'string' ||
      typeof document?.downloadUrl !== 'string' ||
      !/^[a-f0-9]{64}$/.test(document?.sha256 ?? '') ||
      typeof document?.attribution !== 'string'
    ) {
      throw new Error(`Incomplete provenance for SRD ${document?.version ?? 'unknown'}`)
    }
  }

  const auditPolicy = prepareAuditPolicy(allowlist, provenance)
  const files = new Map()
  const coverage = {
    roots: {},
    dependencies: [],
    references: {},
    referenceExclusions: [],
    exclusions: {},
    exclusionReasons: {},
    strippedMetadata: {},
    strippedContent: {},
    materializedItemEntries: {},
    structuredCorrections: {},
    textCorrections: {},
  }
  const addDataFile = (relativePath, payload) => {
    const sanitized = sanitizeDataPayload(payload, coverage)
    assertBundledDataPolicy(sanitized, relativePath, auditPolicy.allowedSources)
    addFile(files, relativePath, sanitized)
  }
  const rootOutputs = new Map()
  const rootInputs = new Map()
  const itemReferencePayloads = []

  for (const [relativePath, collections] of Object.entries(ROOT_COLLECTIONS)) {
    const input = await readJson(sourceRoot, relativePath)
    const output = filterCollections(input, collections, relativePath, coverage, auditPolicy)
    rootInputs.set(relativePath, input)
    rootOutputs.set(relativePath, output)
    itemReferencePayloads.push(output)
    if (!DEFERRED_ROOT_FILES.has(relativePath)) {
      addDataFile(`data/${relativePath}`, output)
    }
  }

  addDataFile('data/books.json', { book: [] })
  addDataFile('data/adventures.json', { adventure: [] })
  addDataFile('data/magicvariants.json', { magicvariant: [] })
  addDataFile('data/fluff-races.json', { raceFluff: [] })
  addDataFile('data/fluff-backgrounds.json', { backgroundFluff: [] })

  const classIndex = await readJson(sourceRoot, 'class/index.json')
  const bundledClassIndex = {}
  for (const [slug, filename] of Object.entries(classIndex)) {
    if (typeof filename !== 'string') continue
    const relativePath = `class/${filename}`
    const output = filterCollections(
      await readJson(sourceRoot, relativePath),
      CLASS_COLLECTIONS,
      relativePath,
      coverage,
      auditPolicy,
    )
    if (output.class.length === 0 && output.subclass.length === 0) continue
    output.class = filterAuditedFeatureReferences({
      owners: output.class,
      records: output.classFeature,
      field: 'classFeatures',
      collection: 'classFeature',
      relativePath,
      parseReference: parseClassFeatureReference,
      findRecord: findClassFeatureRecord,
      auditPolicy,
      coverage,
    })
    output.subclass = filterAuditedFeatureReferences({
      owners: output.subclass,
      records: output.subclassFeature,
      field: 'subclassFeatures',
      collection: 'subclassFeature',
      relativePath,
      parseReference: parseSubclassFeatureReference,
      findRecord: findSubclassFeatureRecord,
      auditPolicy,
      coverage,
    })
    const referenceCollections = new Map([
      [
        'refClassFeature',
        {
          collection: 'classFeature',
          field: 'classFeature',
          records: output.classFeature,
          parse: parseClassFeatureReference,
          find: findClassFeatureRecord,
        },
      ],
      [
        'refSubclassFeature',
        {
          collection: 'subclassFeature',
          field: 'subclassFeature',
          records: output.subclassFeature,
          parse: parseSubclassFeatureReference,
          find: findSubclassFeatureRecord,
        },
      ],
      [
        'refOptionalfeature',
        {
          collection: 'optionalfeature',
          field: 'optionalfeature',
          records: rootOutputs.get('optionalfeatures.json')?.optionalfeature ?? [],
          sourceRecords: rootInputs.get('optionalfeatures.json')?.optionalfeature ?? [],
          parse: (reference, owner) => parseNamedReference(reference, owner, 'optionalfeature'),
          find: findNamedRecord,
        },
      ],
      [
        'refFeat',
        {
          collection: 'feat',
          field: 'feat',
          records: rootOutputs.get('feats.json')?.feat ?? [],
          sourceRecords: rootInputs.get('feats.json')?.feat ?? [],
          parse: (reference, owner) => parseNamedReference(reference, owner, 'feat'),
          find: findNamedRecord,
        },
      ],
    ])
    const classRecordCounts = CLASS_COLLECTIONS.map((collection) => output[collection].length)
    const filteredClassRecords = filterAuditedInlineReferences({
      records: CLASS_COLLECTIONS.flatMap((collection) => output[collection]),
      relativePath,
      referenceCollections,
      auditPolicy,
      coverage,
    })
    let recordOffset = 0
    for (const [index, collection] of CLASS_COLLECTIONS.entries()) {
      const nextOffset = recordOffset + classRecordCounts[index]
      output[collection] = filteredClassRecords.slice(recordOffset, nextOffset)
      recordOffset = nextOffset
    }
    itemReferencePayloads.push(output)
    bundledClassIndex[slug] = filename
    addDataFile(`data/${relativePath}`, output)
    addDataFile(`data/class/${filename.replace(/^class-/, 'fluff-class-')}`, {
      classFluff: [],
    })
  }
  addDataFile('data/class/index.json', bundledClassIndex)

  for (const relativePath of REFERENCE_DEPENDENCY_FILES) {
    addDataFile(`data/${relativePath}`, rootOutputs.get(relativePath))
  }

  const spellIndex = await readJson(sourceRoot, 'spells/index.json')
  const bundledSpellIndex = {}
  const spellsBySource = new Map()
  for (const source of ['PHB', 'XPHB']) {
    const filename = spellIndex[source]
    if (typeof filename !== 'string') throw new Error(`Missing ${source} spell index entry`)
    const relativePath = `spells/${filename}`
    const spells = selectedArray(await readJson(sourceRoot, relativePath), 'spell')
    assertUniqueIdentities(relativePath, 'spell', spells)
    coverage.roots[`${relativePath}#spell`] = spells.length
    bundledSpellIndex[source] = filename
    spellsBySource.set(source, spells)
    itemReferencePayloads.push({ spell: spells })
    addDataFile(`data/${relativePath}`, { spell: spells })
  }
  addDataFile('data/spells/index.json', bundledSpellIndex)

  const lookup = await readJson(sourceRoot, 'generated/gendata-spell-source-lookup.json')
  addDataFile(
    'data/generated/gendata-spell-source-lookup.json',
    filterSpellLookup(lookup, spellsBySource),
  )

  const itemsBase = await readJson(sourceRoot, 'items-base.json')
  const baseitems = selectedArray(itemsBase, 'baseitem')
  const itemMasteries = selectedArray(itemsBase, 'itemMastery')
  assertUniqueIdentities('items-base.json', 'baseitem', baseitems)
  assertUniqueIdentities('items-base.json', 'itemMastery', itemMasteries)
  coverage.roots['items-base.json#baseitem'] = baseitems.length
  coverage.roots['items-base.json#itemMastery'] = itemMasteries.length

  const itemOutput = rootOutputs.get('items.json')
  itemOutput.item = materializeItemEntryReferences(
    itemOutput?.item ?? [],
    itemsBase.itemEntry,
    coverage,
  )
  itemOutput.itemGroup = materializeItemEntryReferences(
    itemOutput?.itemGroup ?? [],
    itemsBase.itemEntry,
    coverage,
  )
  itemReferencePayloads.push({ baseitem: baseitems, itemMastery: itemMasteries })
  closeItemReferences({
    payloads: itemReferencePayloads,
    outputCollections: [
      { collection: 'item', records: itemOutput?.item ?? [] },
      { collection: 'itemGroup', records: itemOutput?.itemGroup ?? [] },
      { collection: 'baseitem', records: baseitems },
    ],
    sourceCollections: [
      { collection: 'item', records: rootInputs.get('items.json')?.item ?? [] },
      { collection: 'itemGroup', records: rootInputs.get('items.json')?.itemGroup ?? [] },
      { collection: 'baseitem', records: itemsBase.baseitem ?? [] },
    ],
    auditPolicy,
    coverage,
  })
  addDataFile('data/items.json', itemOutput)
  validateBaseItemReferences(
    [...(itemOutput?.item ?? []), ...(itemOutput?.itemGroup ?? [])],
    baseitems,
    coverage,
  )
  const supportReferences = collectItemSupportReferences([
    ...baseitems,
    ...(itemOutput?.item ?? []),
    ...(itemOutput?.itemGroup ?? []),
  ])
  const itemProperties = selectApprovedSupport(
    itemsBase.itemProperty ?? [],
    supportReferences.itemProperty,
    'itemProperty',
    auditPolicy,
    coverage,
  )
  const itemTypes = selectApprovedSupport(
    itemsBase.itemType ?? [],
    supportReferences.itemType,
    'itemType',
    auditPolicy,
    coverage,
  )
  addDataFile('data/items-base.json', {
    baseitem: baseitems,
    itemMastery: itemMasteries,
    itemProperty: itemProperties,
    itemType: itemTypes,
  })

  assertAuditPolicyConsumed(auditPolicy)
  coverage.records = buildDistributedRecordInventory(files, coverage, provenance)
  const manifest = buildManifest({ files, coverage, provenance, upstreamRevision })
  addFile(files, 'manifest.json', manifest)
  return { files, manifest }
}

export function describeSnapshot(snapshot) {
  const rootCount = Object.values(snapshot.manifest.coverage.roots).reduce(
    (total, count) => total + count,
    0,
  )
  return {
    fileCount: snapshot.files.size,
    rootCount,
    dependencyCount: snapshot.manifest.coverage.dependencies.length,
    packVersion: snapshot.manifest.packVersion,
    manifestFile: basename('manifest.json'),
  }
}
