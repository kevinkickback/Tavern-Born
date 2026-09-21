import { describe, expect, test } from 'vitest'
import {
  auditProvenanceRecords,
  buildProvenanceExceptionCsv,
  collectRecordEvidence,
  createDocumentCorpus,
  joinPdfTextItems,
  normalizeAuditText,
  toAuditText,
} from '../../scripts/srd/provenanceAudit.mjs'
import { sha256, stableJson } from '../../scripts/srd/snapshot.mjs'

function auditRecord(
  record: Record<string, unknown>,
  pages: string[],
  approvals: {
    schemaVersion: 1
    exceptions: Array<{
      documentSha256: string
      recordSha256: string
      fragmentSha256: string
      officialLocation: string
      reason: string
    }>
  } = { schemaVersion: 1, exceptions: [] },
) {
  const recordSha256 = sha256(stableJson(record))
  return auditProvenanceRecords({
    records: [
      {
        record,
        relativePath: 'data/actions.json',
        collection: 'action',
        identity: 'Attack|PHB',
        provenanceType: 'root-marker',
        marker: 'srd',
        srdVersion: '5.1',
        recordSha256,
      },
    ],
    corpora: new Map([['5.1', createDocumentCorpus('5.1', 'a'.repeat(64), pages)]]),
    approvals,
  })
}

describe('SRD provenance audit', () => {
  test('normalizes PDF line-wrap hyphenation and visible 5etools markup', () => {
    expect(
      normalizeAuditText('The pro-\nvided {@action Attack|PHB} rules.', { pdfText: true }),
    ).toBe('the provided attack rules')
    expect(normalizeAuditText('See appendix PH-A.', { pdfText: true })).toBe('see appendix a')
    expect(toAuditText('{@dc 15} Dexterity ({@skill Stealth|XPHB})')).toBe(
      'DC 15 Dexterity (Stealth)',
    )
    expect(
      toAuditText(
        '{@variantrule Proficiency|XPHB|Proficiency Bonus}; {@chance 50}; {@action Opportunity Attack|XPHB|Opportunity Attacks}; {@itemProperty L|XPHB|Light}; {@scaledamage 5d8|3-9|1d8}; {@quickref Cover||3||total cover}',
      ),
    ).toBe('Proficiency Bonus; 50 percent; Opportunity Attacks; Light; 1d8; total cover')
    expect(toAuditText('{@note Use {@book Stabilizing a Character|XPHB|1|stabilize}}')).toBe(
      'Use Stabilizing a Character',
    )
    expect(toAuditText('Choose another {@5etools feat|feats.html}.')).toBe('Choose another feat.')
  })

  test('rejoins words that a PDF font split into adjacent text items', () => {
    expect(
      joinPdfTextItems([
        { str: 'you can see the att', transform: [1, 0, 0, 1, 10, 50], width: 40, height: 10 },
        { str: 'acker', transform: [1, 0, 0, 1, 50.02, 50], width: 12, height: 10 },
        { str: '', transform: [1, 0, 0, 1, 10, 40], width: 0, height: 0, hasEOL: true },
        { str: 'on the next line', transform: [1, 0, 0, 1, 10, 40], width: 30, height: 10 },
      ]),
    ).toBe('you can see the attacker\non the next line')
  })

  test('matches compound words split or joined by PDF layout extraction', () => {
    const report = auditRecord(
      {
        entries: ['A long dead sage stands inside a 40 foot high cylinder for the whole duration.'],
      },
      ['A longdead sage stands inside a 40 foothigh cylinder for the whole duration.'],
    )

    expect(report.records[0]?.status).toBe('matched')
  })

  test('collects long user-facing passages while ignoring short references', () => {
    const evidence = collectRecordEvidence({
      name: 'A Deliberately Long Structural Record Name',
      source: 'PHB',
      template: '{{prop_name_lower}} {{item.range}} ft.',
      classFeatures: ['Spellcasting|Wizard||1'],
      entries: [
        {
          type: 'entries',
          name: 'A User-Facing Section Heading With Enough Words',
          entries: [
            'Make one melee or ranged attack with a weapon that you are currently wielding.',
          ],
        },
      ],
    })

    expect(evidence).toEqual([
      {
        path: '$.entries[0].name',
        text: 'a user facing section heading with enough words',
      },
      {
        path: '$.entries[0].entries[0]',
        text: 'make one melee or ranged attack with a weapon that you are currently wielding',
      },
    ])
  })

  test('does not duplicate an overlapping tail when chunking a long passage', () => {
    const passage = Array.from({ length: 48 }, (_value, index) => `word${index + 1}`).join(' ')
    const evidence = collectRecordEvidence({ entries: [passage] })

    expect(evidence).toHaveLength(2)
    expect(evidence[1].text).toContain('word48')
    expect(evidence[1].text.match(/word47/g)).toHaveLength(1)
    expect(evidence[1].text.match(/word48/g)).toHaveLength(1)
  })

  test('reconstructs weapon table rows from structured records', () => {
    expect(
      collectRecordEvidence(
        {
          name: 'Dagger',
          source: 'XPHB',
          weapon: true,
          dmg1: '1d4',
          dmgType: 'P',
          property: ['F|XPHB', 'L|XPHB', 'T|XPHB'],
          range: '20/60',
          mastery: ['Nick|XPHB'],
          weight: 1,
          value: 200,
        },
        { collection: 'baseitem', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredWeaponRow',
      text: 'dagger 1d4 piercing finesse light thrown range 20 60 nick 1 lb 2 gp',
    })
    expect(
      collectRecordEvidence(
        {
          name: 'Musket',
          weapon: true,
          dmg1: '1d12',
          dmgType: 'P',
          property: ['A|XPHB', 'LD|XPHB', '2H|XPHB'],
          range: '40/120',
          ammoType: 'firearm bullet|xphb',
          mastery: ['Slow|XPHB'],
          weight: 10,
          value: 50000,
        },
        { collection: 'baseitem', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredWeaponRow',
      text: 'musket 1d12 piercing ammunition range 40 120 bullet loading two handed slow 10 lb 500 gp',
    })
    expect(
      collectRecordEvidence(
        { name: "Alchemist's Supplies", value: 5000, weight: 8 },
        { collection: 'baseitem', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'alchemist s supplies 50 gp 8 lb',
    })
    expect(
      collectRecordEvidence(
        { name: 'Crossbow Bolt', value: 5, weight: 0.075 },
        { collection: 'baseitem', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'crossbow bolts 20 1 gp 11 2 lb',
    })
    expect(
      collectRecordEvidence(
        { name: 'Bolt', value: 5, weight: 0.075 },
        { collection: 'baseitem', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'bolts 20 case 11 2 lb 1 gp',
    })
    expect(
      collectRecordEvidence(
        { name: 'Wooden Staff', value: 500, weight: 4 },
        { collection: 'baseitem', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'wooden staff also a quarterstaff 4 lb 5 gp',
    })
    expect(
      collectRecordEvidence(
        { name: 'Yew Wand', rarity: 'none', type: 'SCF|XPHB', value: 1000, weight: 1 },
        { collection: 'item', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'yew wand 1 lb 10 gp',
    })
    expect(
      collectRecordEvidence(
        {
          name: 'Camel',
          rarity: 'none',
          type: 'MNT|XPHB',
          carryingCapacity: 450,
          value: 5000,
        },
        { collection: 'item', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'camel 450 lb 50 gp',
    })
    expect(
      collectRecordEvidence(
        {
          name: 'Keelboat',
          rarity: 'none',
          type: 'SHP|XPHB',
          vehSpeed: 1,
          crew: 1,
          capPassenger: 6,
          capCargo: 0.5,
          vehAc: 15,
          vehHp: 100,
          vehDmgThresh: 10,
          value: 300000,
        },
        { collection: 'item', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredVehicleRow',
      text: 'keelboat 1 mph 1 6 1 2 15 100 10 3 000 gp',
    })
    expect(
      collectRecordEvidence(
        {
          name: 'Hand Crossbow',
          weapon: true,
          dmg1: '1d6',
          dmgType: 'P',
          property: ['A|PHB', 'L|PHB', 'LD|PHB'],
          range: '30/120',
          value: 7500,
          weight: 3,
        },
        { collection: 'baseitem', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredWeaponRow',
      text: 'hand 75 gp 1d6 piercing 3 lb ammunition range 30 120 light loading',
    })
    expect(
      collectRecordEvidence(
        {
          name: 'Chain Mail',
          armor: true,
          type: 'HA',
          ac: 16,
          strength: '13',
          stealth: true,
          value: 7500,
          weight: 55,
        },
        { collection: 'baseitem', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredArmorRow',
      text: 'chain mail 75 gp 16 str 13 disadvantage 55 lb',
    })
    expect(
      collectRecordEvidence(
        {
          name: 'Plate Armor',
          armor: true,
          type: 'HA|XPHB',
          ac: 18,
          strength: '15',
          stealth: true,
          value: 150000,
          weight: 65,
        },
        { collection: 'baseitem', srdVersion: '5.2.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredArmorRow',
      text: 'plate armor 18 str 15 disadvantage 65 lb 1 500 gp',
    })
    expect(
      collectRecordEvidence(
        { name: 'Abacus', value: 200, weight: 2 },
        { collection: 'item', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'abacus 2 gp 2 lb',
    })
    expect(
      collectRecordEvidence(
        { name: 'Bell', value: 100 },
        { collection: 'item', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredEquipmentRow',
      text: 'bell 1 gp',
    })
    expect(
      collectRecordEvidence(
        { name: 'Cinnamon', type: 'TG', value: 200, weight: 1 },
        { collection: 'item', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredTradeGoodsRow',
      text: '2 gp 1 lb of cinnamon or pepper or one sheep',
    })
    expect(
      collectRecordEvidence(
        {
          name: 'Abyssal',
          typicalSpeakers: ['{@filter demons|bestiary|tag=demon}'],
          script: 'Infernal',
        },
        { collection: 'language', srdVersion: '5.1' },
      ),
    ).toEqual([
      {
        path: '$.__structuredLanguageRow',
        text: 'abyssal demons infernal',
      },
    ])
    expect(
      collectRecordEvidence(
        { name: 'Not an SRD Language', type: 'standard' },
        { collection: 'language', srdVersion: '5.2.1' },
      ),
    ).toEqual([])
    expect(
      collectRecordEvidence(
        { name: 'Common Sign Language', type: 'standard' },
        { collection: 'language', srdVersion: '5.2.1' },
      ),
    ).toEqual([
      {
        path: '$.__structuredLanguageTable',
        text: 'standard languages 1d12 language common 1 common sign language 2 draconic 3 4 dwarvish 5 6 elvish 7 giant 8 gnomish 9 goblin 10 11 halfling 12 orc',
      },
    ])
    expect(
      collectRecordEvidence(
        {
          name: 'Anubis',
          title: 'God of judgment and death',
          alignment: ['L', 'N'],
          domains: ['Death'],
          symbol: 'Black jackal',
        },
        { collection: 'deity', srdVersion: '5.1' },
      ),
    ).toContainEqual({
      path: '$.__structuredDeityRow',
      text: 'anubis god of judgment and death ln death black jackal',
    })
  })

  test('audits exact action representations against their official table rows', () => {
    expect(
      collectRecordEvidence(
        {
          name: 'Don or Doff a Shield',
          entries: ['A {@item Shield|XPHB} can be donned or doffed as an action.'],
        },
        { collection: 'action', srdVersion: '5.2.1' },
      ),
    ).toEqual([
      {
        path: '$.__exactShieldActionRepresentation',
        text: 'shield utilize action to don or doff shield',
      },
    ])
    expect(
      collectRecordEvidence(
        {
          name: 'Don or Doff a Shield',
          entries: ['This changed representation must return to review.'],
        },
        { collection: 'action', srdVersion: '5.2.1' },
      ),
    ).not.toContainEqual(expect.objectContaining({ path: '$.__exactShieldActionRepresentation' }))
  })

  test('audits an exact inline magic-item table representation as official prose and rows', () => {
    const source =
      'As a bonus action, you can move each sphere up to 30 feet, but no farther than 120 feet away from you. When a creature other than you comes within 5 feet of a sphere, the sphere discharges lightning at that creature and disappears. That creature must make a {@dc 15} Dexterity saving throw. On a failed save, the creature takes lightning damage based on the number of spheres you created. (4 spheres = {@damage 2d4}, 3 spheres = {@damage 2d6}, 2 spheres = {@damage 5d4}, 1 sphere = {@damage 4d12})'

    expect(collectRecordEvidence({ entries: [source] })).toEqual([
      expect.objectContaining({ path: '$.entries[0].__exactRepresentation[0]' }),
      expect.objectContaining({ path: '$.entries[0].__exactRepresentation[1]' }),
    ])
    expect(collectRecordEvidence({ entries: [`${source} Changed.`] })).not.toContainEqual(
      expect.objectContaining({ path: expect.stringContaining('__exactRepresentation') }),
    )
  })

  test('audits generated magic-item variants only when their complete representation is exact', () => {
    const potion = {
      entries: [
        'When you drink this potion, you have {@variantrule Resistance|XPHB} to acid damage for 1 hour.',
      ],
      name: 'Potion of Acid Resistance',
      rarity: 'uncommon',
      resist: ['acid'],
      source: 'XDMG',
      srd52: true,
      type: 'P|XPHB',
      weight: 0.5,
    }
    const ring = {
      detail1: 'pearl',
      entries: [
        'You have resistance to acid damage while wearing this ring. The ring is set with pearl.',
      ],
      name: 'Ring of Acid Resistance',
      rarity: 'rare',
      reqAttune: true,
      resist: ['acid'],
      source: 'DMG',
      srd: true,
      type: 'RG|DMG',
    }
    const armor = {
      ac: 14,
      baseItem: 'scale mail|xphb',
      bonusAc: '+1',
      detail1: 'black',
      entries: [
        'Dragon Scale Mail is made of the scales of one kind of dragon. Sometimes dragons collect their cast-off scales and gift them. Other times, hunters carefully preserve the hide of a dead dragon. In either case, Dragon Scale Mail is highly valued.',
        'While wearing this armor, you gain a +1 bonus to {@variantrule Armor Class|XPHB}, you have {@variantrule Advantage|XPHB} on saving throws against the breath weapons of Dragons, and you have {@variantrule Resistance|XPHB} to acid damage.',
        "Additionally, you can focus your senses as a {@action Magic|XPHB} action to discern the distance and direction to the closest black dragon within 30 miles of yourself. This action can't be used again until the next dawn.",
      ],
      name: 'Black Dragon Scale Mail',
      rarity: 'very rare',
      reqAttune: true,
      resist: ['acid'],
      source: 'XDMG',
      srd52: true,
      stealth: true,
      type: 'MA|XPHB',
      weight: 45,
    }
    const wand = {
      bonusSpellAttack: '+1',
      entries: [
        'While you are holding this wand, you gain a +1 bonus to spell attack rolls. In addition, you ignore {@quickref Cover||3||half cover} when making a spell attack.',
      ],
      name: '+1 Wand of the War Mage',
      rarity: 'uncommon',
      reqAttune: 'by a spellcaster',
      source: 'DMG',
      srd: true,
      type: 'WD|DMG',
      weight: 1,
    }
    const healingPotion = {
      entries: [
        "You regain {@dice 4d4 + 4} {@variantrule Hit Points|XPHB} when you drink this potion. The potion's red liquid glimmers when agitated.",
      ],
      name: 'Potion of Greater Healing',
      rarity: 'uncommon',
      source: 'XDMG',
      srd52: true,
      type: 'P|XPHB',
      weight: 0.5,
    }
    const giantStrengthBelt = {
      ability: { static: { str: 23 } },
      entries: [
        "While wearing this belt, your Strength score changes to 23. The item has no effect on you if your Strength without the belt is equal to or greater than the belt's score.",
      ],
      name: 'Belt of Frost Giant Strength',
      rarity: 'very rare',
      reqAttune: true,
      source: 'XDMG',
      srd52: true,
      wondrous: true,
    }
    const giantStrengthPotion = {
      ability: { static: { str: 27 } },
      entries: [
        'When you drink this potion, your Strength score changes to 27 for 1 hour. The potion has no effect on you if your Strength is equal to or greater than that score.',
        "This potion's transparent liquid has floating in it a sliver of light resembling a cloud giant's fingernail.",
      ],
      name: 'Potion of Cloud Giant Strength',
      rarity: 'very rare',
      source: 'XDMG',
      srd52: true,
      type: 'P|XPHB',
      weight: 0.5,
    }
    const flyingCarpet = {
      entries: [
        "You can make this carpet hover and fly by taking a {@action Magic|XPHB} action and using the carpet's command word. It moves according to your directions if you are within 30 feet of it.",
        'A 3 ft. × 5 ft. carpet can carry up to 200 lb. at a fly speed of 80 feet. A carpet can carry up to twice the weight shown on the table, but its {@variantrule Fly Speed|XPHB} is halved if it carries more than its normal capacity.',
      ],
      name: 'Carpet of Flying, 3 ft. × 5 ft.',
      rarity: 'very rare',
      source: 'XDMG',
      srd52: true,
      wondrous: true,
    }
    const elementalGem = {
      entries: [
        'This gem contains a mote of elemental energy. When you take a {@action Utilize|XPHB} action to break the gem, an {@creature Air Elemental|XMM} is summoned, and the gem ceases to be magical. The elemental appears in an unoccupied space as close to the broken gem as possible, understands your languages, obeys your commands, and takes its turn immediately after you on your {@variantrule Initiative|XPHB} count. The elemental disappears after 1 hour, when it dies, or when you dismiss it as a {@variantrule Bonus Action|XPHB}.',
      ],
      name: 'Elemental Gem, Blue Sapphire',
      rarity: 'uncommon',
      source: 'XDMG',
      srd52: true,
      wondrous: true,
    }
    const bagOfTricks = {
      entries: [
        'This bag made from gray cloth appears empty. Reaching inside the bag, however, reveals the presence of a small, fuzzy object.',
        "You can take a {@action Magic|XPHB} action to pull the fuzzy object from the bag and throw it up to 20 feet. When the object lands, it transforms into a creature you determine by rolling on the table below. See Monsters for the creature's stat block. The creature vanishes at the next dawn or when it is reduced to 0 {@variantrule Hit Points|XPHB}.",
        'The creature is {@variantrule Friendly [Attitude]|XPHB|Friendly} to you and your allies, and it acts immediately after you on your {@variantrule Initiative|XPHB} count. You can take a {@variantrule Bonus Action|XPHB} to command how the creature moves and what action it takes on its next turn, such as attacking an enemy. In the absence of such orders, the creature acts in a fashion appropriate to its nature.',
        "Once three fuzzy objects have been pulled from the bag, the bag can't be used again until the next dawn.",
        {
          colLabels: ['1d8', 'Creature'],
          colStyles: ['col-2 text-center', 'col-10'],
          rows: [
            ['1', '{@creature Weasel|XMM}'],
            ['2', '{@creature Giant Rat|XMM}'],
            ['3', '{@creature Badger|XMM}'],
            ['4', '{@creature Boar|XMM}'],
            ['5', '{@creature Panther|XMM}'],
            ['6', '{@creature Giant Badger|XMM}'],
            ['7', '{@creature Dire Wolf|XMM}'],
            ['8', '{@creature Giant Elk|XMM}'],
          ],
          type: 'table',
        },
      ],
      name: 'Bag of Tricks, Gray',
      rarity: 'uncommon',
      recharge: 'dawn',
      source: 'XDMG',
      srd52: true,
      wondrous: true,
    }
    const armorOfVulnerability = {
      ac: 18,
      baseItem: 'plate armor|phb',
      curse: true,
      entries: [
        'While wearing this armor, you have resistance to bludgeoning damage.',
        {
          entries: [
            'This armor is cursed, a fact that is revealed only when an {@spell identify} spell is cast on the armor or you attune to it. Attuning to the armor curses you until you are targeted by the {@spell remove curse} spell or similar magic; removing the armor fails to end the curse. While cursed you have vulnerability to piercing and slashing damage.',
          ],
          name: 'Curse',
          type: 'entries',
        },
      ],
      name: 'Armor of Vulnerability (Bludgeoning)',
      rarity: 'rare',
      reqAttune: true,
      resist: ['bludgeoning'],
      source: 'DMG',
      srd: true,
      stealth: true,
      strength: '15',
      type: 'HA',
      vulnerable: ['piercing', 'slashing'],
      weight: 65,
    }
    const hornOfValhalla = {
      baseItem: 'horn|xphb',
      entries: [
        "You can take a {@action Magic|XPHB} action to blow this horn. In response, warrior spirits from the plane of Ysgard appear in unoccupied spaces within 60 feet of you. Each spirit uses the {@creature Berserker|XMM} stat block and returns to Ysgard after 1 hour or when it drops to 0 {@variantrule Hit Points|XPHB}. The spirits look like living, breathing warriors, and they have {@variantrule Immunity|XPHB} to the {@condition Charmed|XPHB} and {@condition Frightened|XPHB} conditions. Once you use the horn, it can't be used again until 7 days have passed.",
        'A silver horn summons 2 {@creature Berserker|XMM|Berserkers}. They are {@variantrule Friendly [Attitude]|XPHB|Friendly} to you and your allies and follow your commands.',
      ],
      name: 'Horn of Valhalla, Silver',
      rarity: 'rare',
      source: 'XDMG',
      srd52: true,
      type: 'INS|XPHB',
      wondrous: true,
    }
    const manualOfGolems = {
      entries: [
        "This tome contains information and incantations necessary to make a {@creature clay golem|XMM}. To decipher and use the manual, you must be a spellcaster with at least two level 5 spell slots. A creature that can't use a {@i Manual of Golems} and attempts to read it takes {@damage 6d6} Psychic damage.",
        'To create a clay golem, you must spend 30 days, working without interruption with the manual at hand and resting no more than 8 hours per day. You must also pay 65,000 gp to purchase supplies.',
        "Once you finish creating the golem, the book is consumed in eldritch flames. The golem becomes animate when the ashes of the manual are sprinkled on it. See Monsters for the golem's stat block. The golem is under your control, and it understands and obeys your commands.",
      ],
      name: 'Manual of Clay Golems',
      rarity: 'very rare',
      source: 'XDMG',
      srd52: true,
      weight: 5,
      wondrous: true,
    }
    const spellScroll = {
      entries: [
        "A Spell Scroll bears the words of a single spell, written in a mystical cipher. If the spell is on your spell list, you can read the scroll and cast its spell without Material components. Otherwise, the scroll is unintelligible. Casting the spell by reading the scroll requires the spell's normal casting time. Once the spell is cast, the scroll crumbles to dust. If the casting is interrupted, the scroll isn't lost.",
        'If the spell is on your spell list but of a higher level than you can normally cast, you make a {@dc 12} ability check using your spellcasting ability to determine whether you cast the spell. On a failed check, the spell disappears from the scroll with no other effect.',
        'If the spell requires a saving throw or an attack roll, the spell save DC is 13, and the attack bonus is {@hit 5}.',
        {
          entries: [
            'A Wizard spell on a Spell Scroll can be copied into a spellbook. When a level 2 spell is copied in this way, the copier must succeed on a {@dc 12} Intelligence ({@skill Arcana|XPHB}). On a successful check, the spell is copied. Whether the check succeeds or fails, the Spell Scroll is destroyed.',
          ],
          name: 'Copying a Scroll into a Spellbook',
          type: 'entries',
        },
      ],
      name: 'Spell Scroll (Level 2)',
      rarity: 'uncommon',
      source: 'XDMG',
      spellScrollLevel: 2,
      srd52: true,
      type: 'SC|XPHB',
    }

    for (const [record, srdVersion] of [
      [potion, '5.2.1'],
      [ring, '5.1'],
      [armor, '5.2.1'],
      [wand, '5.1'],
      [healingPotion, '5.2.1'],
      [giantStrengthBelt, '5.2.1'],
      [giantStrengthPotion, '5.2.1'],
      [flyingCarpet, '5.2.1'],
      [elementalGem, '5.2.1'],
      [bagOfTricks, '5.2.1'],
      [armorOfVulnerability, '5.1'],
      [hornOfValhalla, '5.2.1'],
      [manualOfGolems, '5.2.1'],
      [spellScroll, '5.2.1'],
    ] as const) {
      expect(collectRecordEvidence(record, { collection: 'item', srdVersion })).toContainEqual(
        expect.objectContaining({ path: '$.__exactGeneratedMagicItemParent' }),
      )
    }

    expect(
      collectRecordEvidence(
        { ...potion, resist: ['fire'] },
        { collection: 'item', srdVersion: '5.2.1' },
      ),
    ).not.toContainEqual(expect.objectContaining({ path: '$.__exactGeneratedMagicItemParent' }))
  })

  test('matches normalized evidence and records the official PDF page', () => {
    const record = {
      name: 'Attack',
      source: 'PHB',
      srd: true,
      entries: ['Make one melee or ranged attack with a weapon you are wielding.'],
    }
    const audit = auditRecord(record, [
      'Other rules.',
      'Attack. Make one melee or ranged attack with a weapon you are wielding.',
    ])

    expect(audit.records[0]).toMatchObject({
      status: 'matched',
      evidenceCount: 1,
      unmatchedCount: 0,
      matchedPages: [2],
    })
    expect(audit.staleApprovals).toEqual([])
  })

  test('matches exact evidence split across adjacent PDF pages after removing page headers', () => {
    const record = {
      name: 'Attack',
      source: 'PHB',
      srd: true,
      entries: ['Make one melee or ranged attack with a weapon you are wielding.'],
    }
    const audit = auditRecord(record, [
      'System Reference Document 5.1 1 Make one melee or ranged',
      'System Reference Document 5.1 2 attack with a weapon you are wielding.',
    ])

    expect(audit.records[0]).toMatchObject({
      status: 'matched',
      unmatchedCount: 0,
      matchedPages: [1, 2],
    })
  })

  test('reports unmatched evidence and accepts only a hash-bound exception approval', () => {
    const record = {
      name: 'Attack',
      source: 'PHB',
      srd: true,
      entries: ['This transformed passage needs a documented provenance exception.'],
    }
    const first = auditRecord(record, [
      'A transformed passage requires a documented provenance decision.',
    ])
    const evidence = first.records[0].evidence[0]

    expect(first.records[0]).toMatchObject({ status: 'needs-review', unmatchedCount: 1 })
    const likelyPage = evidence.likelyPages?.[0]
    expect(likelyPage).toBeDefined()
    if (!likelyPage) throw new Error('Expected a likely PDF page suggestion.')
    expect(likelyPage).toMatchObject({ page: 1 })
    expect(likelyPage.tokenCoverage).toBeCloseTo(2 / 3)
    expect(evidence.closestExcerpt).toMatchObject({ page: 1 })
    expect(evidence.closestExcerpt?.similarity).toBeGreaterThan(0.6)

    const second = auditRecord(
      record,
      ['A transformed passage requires a documented provenance decision.'],
      {
        schemaVersion: 1,
        exceptions: [
          {
            documentSha256: 'a'.repeat(64),
            recordSha256: sha256(stableJson(record)),
            fragmentSha256: evidence.fragmentSha256,
            officialLocation: 'SRD 5.1, p. 92',
            reason: 'Structured wording verified against the named section.',
          },
        ],
      },
    )

    expect(second.records[0]).toMatchObject({
      status: 'approved-with-exceptions',
      unmatchedCount: 0,
      approvedExceptionCount: 1,
    })
    expect(second.staleApprovals).toEqual([])
  })

  test('rejects stale approvals and emits only exception rows to CSV', () => {
    const record = {
      name: 'Attack',
      source: 'PHB',
      srd: true,
      entries: ['This transformed passage still needs a provenance decision.'],
    }
    const audit = auditRecord(record, ['The official Attack rules are different.'], {
      schemaVersion: 1,
      exceptions: [
        {
          documentSha256: 'a'.repeat(64),
          recordSha256: 'f'.repeat(64),
          fragmentSha256: 'e'.repeat(64),
          officialLocation: 'Old location',
          reason: 'Old approval',
        },
      ],
    })
    const report = { records: audit.records }

    expect(audit.staleApprovals).toHaveLength(1)
    expect(buildProvenanceExceptionCsv(report)).toContain(
      '"this transformed passage still needs a provenance decision"',
    )
  })
})
