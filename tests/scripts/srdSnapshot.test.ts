import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { buildSrdSnapshot, isSrdRoot, sha256, stableJson } from '../../scripts/srd/snapshot.mjs'

const ROOT_FIXTURES: Record<string, object> = {
  'actions.json': { action: [] },
  'backgrounds.json': { background: [] },
  'conditionsdiseases.json': { condition: [], disease: [], status: [] },
  'cultsboons.json': { cult: [], boon: [] },
  'deities.json': { deity: [] },
  'feats.json': { feat: [] },
  'items.json': {
    item: [
      {
        name: 'Rope',
        source: 'PHB',
        type: 'G',
        srd: true,
        page: 145,
        basicRules: true,
        basicRules2024: true,
        hasFluff: true,
        hasFluffImages: true,
        origin: 'Non-SRD origin detail',
        reprintedAs: ['Rope|XPHB'],
        otherSources: [{ source: 'XGE', page: 9 }],
        referenceSources: ['XGE'],
        additionalSources: [{ source: 'TCE', page: 10 }],
        classFeatures: ['replicate magic item|artificer|efa|2|efa'],
        optionalfeatures: ['replicate magic item|tce'],
        lootTables: ['Magic Item Table A'],
        miscTags: ['CNS'],
        reqAttuneTags: [{ spellcasting: true }],
        tier: 'minor',
        entries: [
          {
            type: 'entries',
            name: 'Rope',
            entries: ["The DM's useful cord is stored beside the DMG."],
            page: 146,
          },
          {
            type: 'inset',
            name: "A Bard's Repertoire",
            entries: ['Non-SRD sidebar text.'],
          },
          {
            type: 'entries',
            name: 'A Question of Enmity',
            entries: ['Non-SRD sidebar text.'],
          },
        ],
        additionalEntries: [{ source: 'MOT', entries: ['Non-SRD supplement text.'] }],
        soundClip: 'audio/rope.mp3',
        _versions: [
          {
            name: 'Rope Variant',
            source: 'PHB',
            _mod: { entries: { mode: 'appendArr', items: ['Mechanical variant.'] } },
          },
        ],
      },
      { name: 'Private Item', source: 'PRIVATE', type: 'G' },
    ],
    itemGroup: [],
  },
  'languages.json': { language: [] },
  'optionalfeatures.json': { optionalfeature: [] },
  'races.json': { race: [], subrace: [] },
  'rewards.json': { reward: [] },
  'senses.json': { sense: [] },
  'skills.json': { skill: [] },
  'trapshazards.json': { trap: [], hazard: [] },
  'variantrules.json': { variantrule: [] },
}

const provenance = {
  packVersion: 'test-pack',
  distributionStatus: 'test-only',
  snapshotGeneratedAt: '2026-09-19T00:00:00.000Z',
  documents: [
    {
      version: '5.1',
      downloadUrl: 'https://example.com/srd-5.1.pdf',
      sha256: 'a'.repeat(64),
      attribution: 'Test attribution 5.1.',
    },
    {
      version: '5.2.1',
      downloadUrl: 'https://example.com/srd-5.2.1.pdf',
      sha256: 'b'.repeat(64),
      attribution: 'Test attribution 5.2.1.',
    },
  ],
  license: { identifier: 'CC-BY-4.0' },
  transformationNotice: 'Test transformation.',
}

let temporaryRoots: string[] = []

async function writeJson(root: string, relativePath: string, value: unknown) {
  const path = join(root, ...relativePath.split('/'))
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value), 'utf8')
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'tavern-born-srd-'))
  temporaryRoots.push(root)
  for (const [relativePath, value] of Object.entries(ROOT_FIXTURES)) {
    await writeJson(root, relativePath, value)
  }
  await writeJson(root, 'items-base.json', {
    baseitem: [{ name: 'Club', source: 'PHB', type: 'M', srd: true }],
    itemMastery: [],
    itemProperty: [],
    itemType: [
      { name: 'Adventuring Gear', abbreviation: 'G', source: 'PHB' },
      { name: 'Melee Weapon', abbreviation: 'M', source: 'PHB' },
    ],
  })
  await writeJson(root, 'class/index.json', { wizard: 'class-wizard.json' })
  await writeJson(root, 'class/class-wizard.json', {
    class: [
      {
        name: 'Wizard',
        source: 'PHB',
        srd: true,
        classFeatures: ['Spellcasting|Wizard||1', 'Cantrip Formulas|Wizard||3|TCE'],
      },
      { name: 'Private Class', source: 'PRIVATE' },
    ],
    subclass: [],
    classFeature: [
      {
        name: 'Spellcasting',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
        level: 1,
        srd: true,
      },
    ],
    subclassFeature: [],
  })
  await writeJson(root, 'spells/index.json', {
    PHB: 'spells-phb.json',
    XPHB: 'spells-xphb.json',
  })
  await writeJson(root, 'spells/spells-phb.json', {
    spell: [{ name: 'Light', source: 'PHB', srd: true }],
  })
  await writeJson(root, 'spells/spells-xphb.json', {
    spell: [{ name: 'Light', source: 'XPHB', srd52: true }],
  })
  await writeJson(root, 'generated/gendata-spell-source-lookup.json', {
    phb: {
      light: {
        class: { PHB: { Wizard: true }, TCE: { Artificer: true } },
      },
    },
    xphb: {
      light: {
        class: { XPHB: { Wizard: true } },
      },
    },
  })
  return root
}

function createAllowlist() {
  return {
    allowedSources: ['PHB', 'DMG', 'MM', 'XPHB', 'XDMG', 'XMM'],
    referenceExclusions: [
      {
        collection: 'classFeature',
        source: 'TCE',
        reason: 'Fixture non-SRD optional feature.',
      },
    ],
    dependencies: [
      {
        collection: 'itemType',
        srdVersion: '5.1',
        officialSection: 'Equipment',
        reason: 'Fixture item type.',
        identities: ['G|PHB', 'M|PHB'],
      },
    ],
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })))
  temporaryRoots = []
})

describe('bundled SRD snapshot generator', () => {
  test('recognizes only explicit SRD root markers', () => {
    expect(isSrdRoot({ srd: true })).toBe(true)
    expect(isSrdRoot({ srd52: true })).toBe(true)
    expect(isSrdRoot({ srd: false, basicRules: true })).toBe(false)
  })

  test('serializes objects deterministically', () => {
    expect(stableJson({ z: 1, a: { d: 2, b: 1 } })).toBe(
      '{\n  "a": {\n    "b": 1,\n    "d": 2\n  },\n  "z": 1\n}\n',
    )
  })

  test('applies official wording corrections only to the exact reviewed source text', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'actions.json', {
      action: [
        {
          name: 'Activate an Item',
          source: 'DMG',
          srd: true,
          entries: [
            'Some items are used up when they are activated. A potion or elixir must be swallowed, or an oil applied to the body. The writing vanishes from a scroll when it is read. Once used, a consumable item loses its magic and no longer functions.',
            'A potion or elixir in unrelated text remains unchanged.',
            'See {@book chapter 7|XPHB|7} for details.',
            'Intro. See {@book chapter 10|PHB|10} for the general rules of spellcasting and {@book chapter 11|PHB|11} for the {@filter wizard spell list|spells|class=wizard}.',
            'The table shows slots to cast your wizard spells.',
            'Choose spells from any classes.',
            'See the {@book Monster Manual|XMM} for details.',
            "A familiar can see appendix B for the familiar's stat block.",
            "Statistics appear in the {@book Player's Handbook|XPHB}.",
            "see the {@book Player's Handbook|XPHB} for the {@item Net|XPHB|Net's} statistics.",
            'The condition is described as explained in the appendix.',
            'Choose {@creature Skeleton|XMM}, {@creature Slaad Tadpole|XMM}, or {@creature Sprite|XMM}.',
            'If your DM allows the use of feats, you may instead take a {@5etools feat|feats.html}.',
            'You gain the {@feat Ability Score Improvement|XPHB} feat or another {@5etools feat|feats.html} of your choice.',
            'You gain an {@filter Epic Boon feat|feats|category=EB} or another {@5etools feat|feats.html} of your choice.',
            "A Lance requires two hands to wield when you aren't mounted.",
            'This weapon requires two hands to use. This property is relevant only when you attack with the weapon, not when you simply hold it.',
            'The familiar has the statistics of the chosen form, though it remains a spirit.',
            'If your wish would undo the multiverse itself, threaten the City of Sigil, or affect the Lady of Pain in any way, you see an image of her in your mind for a moment; she shakes her head, and your wish fails.',
            "You and up to eight willing creatures who link hands in a circle are transported to a different plane of existence. You can specify a target destination in general terms, such as the City of Brass on the Elemental Plane of Fire or the palace of Dispater on the second level of the Nine Hells, and you appear in or near that destination. If you are trying to reach the City of Brass, for example, you might arrive in its Street of Steel, before its Gate of Ashes, or looking at the city from across the Sea of Fire, at the DM's discretion.",
            'You and up to eight willing creatures who link hands in a circle are transported to a different plane of existence. You can specify a target destination in general terms, such as the City of Brass on the Elemental Plane of Fire or the palace of Dispater on the second level of the Nine Hells, and you appear in or near that destination, as determined by the DM.',
            'Some spells and other effects require Concentration to remain active, as specified in their descriptions. You can end Concentration at any time (no action required).',
            '{@note Additionally, the Help action may be used to {@book stabilize a creature|XPHB|1|Stabilizing a Character}.}',
            "With the Hide action, you try to conceal yourself. To do so, you must succeed on a {@dc 15} Dexterity ({@skill Stealth|XPHB}) check while you're {@variantrule Heavily Obscured|XPHB} or behind {@variantrule Cover|XPHB|Three-Quarters Cover or Total Cover}, and you must be out of any enemy's line of sight; if you can see a creature, you can discern whether it can see you.",
            'In a fight, everyone is constantly watching for enemies to drop their guard. You can rarely move heedlessly past your foes without putting yourself in danger; doing so provokes an opportunity attack.',
            "You can make an opportunity attack when a hostile creature that you can see moves out of your reach. To make the opportunity attack, you use your reaction to make one melee attack against the provoking creature. The attack interrupts the provoking creature's movement, occurring right before the creature leaves your reach.",
            "When you ready a spell, holding onto the spell's magic requires {@status concentration} (explained in {@book chapter 10|phb|10|concentration}).",
            'You have until the start of your next turn to use a readied action.',
          ],
        },
      ],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist: createAllowlist(),
      upstreamRevision: 'fixture-revision',
    })
    const actions = JSON.parse(snapshot.files.get('data/actions.json') ?? '{}').action

    expect(actions[0].entries).toEqual([
      'Some items are used up when they are activated. A potion or an elixir must be swallowed, or an oil applied to the body. The writing vanishes from a scroll when it is read. Once used, a consumable item loses its magic.',
      'A potion or elixir in unrelated text remains unchanged.',
      'See Spells for details.',
      'Intro.',
      'The table shows slots to cast your spells.',
      'Choose spells from any class.',
      'See Monsters for details.',
      'A familiar can see "Monsters" for the familiar\'s stat block.',
      'Statistics appear in "Equipment".',
      'see "Adventuring Gear" for the Net\'s statistics.',
      'The condition is described as explained in appendix A.',
      'Choose {@creature Skeleton|XMM}, or {@creature Sprite|XMM}.',
      'Using the optional feats rule, you can forgo taking that feature to take a feat of your choice instead.',
      'You gain the {@feat Ability Score Improvement|XPHB} feat (see "Feats") or another feat of your choice.',
      'You gain an Epic Boon feat (see "Feats") or another feat of your choice.',
      'This weapon requires two hands when you attack with it.',
      'The familiar has the statistics of the chosen form (see "Monsters"), though it remains a spirit.',
      'If your wish would undo the multiverse itself, your wish fails.',
      "You and up to eight willing creatures who link hands in a circle are transported to a different plane of existence. You can specify a target destination in general terms, such as the City of Brass on the Elemental Plane of Fire or the palace of Dispater on the second level of the Nine Hells, and you appear in or near that destination. If you are trying to reach the City of Brass, for example, you might arrive in its Street of Steel, before its Gate of Ashes, or looking at the city from across the Sea of Fire, at the GM's discretion.",
      'You and up to eight willing creatures who link hands in a circle are transported to a different plane of existence. You can specify a target destination in general terms, such as a specific city on the Elemental Plane of Fire or palace on the second level of the Nine Hells, and you appear in or near that destination, as determined by the GM.',
      'The creator can end Concentration at any time (no action required).',
      'You can take the Help action to try to stabilize a creature with 0 Hit Points, which requires a successful {@dc 10} Wisdom ({@skill Medicine|XPHB}) check.',
      "With the Hide action, you try to hide yourself. To do so, you must succeed on a {@dc 15} Dexterity ({@skill Stealth|XPHB}) check while you're {@variantrule Heavily Obscured|XPHB} or behind {@variantrule Cover|XPHB|Three-Quarters Cover or Total Cover}, and you must be out of any enemy's line of sight; if you can see a creature, you can discern whether it can see you.",
      'In a fight, everyone is constantly watching for a chance to strike an enemy who is fleeing or passing by. Such a strike is called an opportunity attack.',
      'You can make an opportunity attack when a hostile creature that you can see moves out of your reach. To make the opportunity attack, you use your reaction to make one melee attack against the provoking creature. The attack occurs right before the creature leaves your reach.',
      "When you ready a spell, holding onto the spell's magic requires {@status concentration}.",
    ])
    expect(snapshot.manifest.coverage.textCorrections).toEqual({
      activateItemConsumables: 1,
      abilityScoreImprovementFeatReference2014: 1,
      abilityScoreImprovementFeatReference2024: 1,
      appendixAReference: 1,
      endConcentrationSrdText2024: 1,
      fallingNetSrdSectionReference: 1,
      epicBoonFeatReference2024: 1,
      familiarSrdSectionReference: 1,
      findFamiliarMonstersReference2024: 1,
      foldingBoatSrdSectionReference: 1,
      gameMasterAbbreviation: 3,
      helpStabilizeSrdText2024: 1,
      hideSrdText2024: 1,
      magicalSecretsClassGrammar: 1,
      monsterManualSrdSectionReference: 1,
      opportunityAttackIntroduction2014: 1,
      opportunityAttackTiming2014: 1,
      planeShiftSrdExample2024: 1,
      remove2014SpellcastingChapterReferences: 1,
      removeReadyConcentrationChapterReference2014: 1,
      removeNonSrdFamiliarForm: 1,
      spellsSectionReference: 1,
      spellSlotClassQualifier: 1,
      twoHandedPropertySrdText: 1,
      wishSrdScope2024: 1,
    })
    expect(snapshot.manifest.coverage.strippedContent).toEqual(
      expect.objectContaining({
        lanceBookOnlyDescription: 1,
        readyActionExpiryOutsideSrd51: 1,
      }),
    )
  })

  test('removes full-book ammunition descriptions from SRD table records', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'items-base.json', {
      baseitem: [
        { name: 'Club', source: 'PHB', type: 'M', srd: true },
        {
          name: 'Bolt',
          source: 'XPHB',
          type: 'A|XPHB',
          srd52: true,
          value: 5,
          weight: 0.075,
          entries: ['Full-book convenience text that is not present in the SRD ammunition table.'],
        },
      ],
      itemMastery: [],
      itemProperty: [],
      itemType: [
        { name: 'Adventuring Gear', abbreviation: 'G', source: 'PHB' },
        { name: 'Melee Weapon', abbreviation: 'M', source: 'PHB' },
        { name: 'Ammunition', abbreviation: 'A', source: 'XPHB' },
      ],
    })
    const allowlist = createAllowlist()
    allowlist.dependencies.push({
      collection: 'itemType',
      srdVersion: '5.2.1',
      officialSection: 'Equipment — Ammunition',
      reason: 'Fixture ammunition item type.',
      identities: ['A|XPHB'],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist,
      upstreamRevision: 'fixture-revision',
    })
    const bolt = JSON.parse(snapshot.files.get('data/items-base.json') ?? '{}').baseitem.find(
      (record: { name?: string }) => record.name === 'Bolt',
    )

    expect(bolt).not.toHaveProperty('entries')
    expect(snapshot.manifest.coverage.strippedContent).toEqual(
      expect.objectContaining({ xphbAmmunitionBookDescriptions: 1 }),
    )
  })

  test('removes supplemental domains merged into SRD deity rows', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'deities.json', {
      deity: [
        {
          name: 'Anubis',
          title: 'God of judgment and death',
          source: 'PHB',
          srd: true,
          pantheon: 'Egyptian',
          alignment: ['L', 'N'],
          domains: ['Death', 'Grave', 'Order'],
          symbol: 'Black jackal',
        },
      ],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist: createAllowlist(),
      upstreamRevision: 'fixture-revision',
    })
    const deity = JSON.parse(snapshot.files.get('data/deities.json') ?? '{}').deity[0]

    expect(deity.domains).toEqual(['Death'])
    expect(snapshot.manifest.coverage.strippedContent).toEqual(
      expect.objectContaining({ deitySupplementalDomains: 2 }),
    )
  })

  test('corrects reviewed structured values that differ from the official SRD', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'items.json', {
      item: [
        {
          name: 'Stabling (per day)',
          source: 'XPHB',
          srd52: true,
          type: 'TAH|XPHB',
          rarity: 'none',
          value: 5,
        },
        {
          name: "Lolth's Sting",
          source: 'XDMG',
          srd52: true,
          entries: ["A creature subjected to Lolth's Sting uses the wrong upstream name."],
        },
        {
          name: 'Staff of Withering',
          source: 'XDMG',
          srd52: true,
          reqAttune: 'by a cleric, druid, or warlock',
        },
        { name: 'Iron Flask', source: 'DMG', srd: true, entries: ['Full-book table.'] },
        { name: 'Iron Flask', source: 'XDMG', srd52: true, entries: ['Full-book table.'] },
        {
          name: 'Potion of Cloud Giant Strength',
          source: 'XDMG',
          srd52: true,
          entries: ['Upstream prose.', 'A literal giant fingernail.'],
        },
        {
          name: 'Horn of Valhalla, Silver',
          source: 'DMG',
          srd: true,
          entries: ['Warriors from Ysgard.'],
        },
        {
          name: 'Manual of Clay Golems',
          source: 'XDMG',
          srd52: true,
          entries: ['Full-book wording.'],
        },
        {
          name: 'Figurine of Wondrous Power, Bronze Griffon',
          source: 'XDMG',
          srd52: true,
          entries: [
            "The creature exists for a duration specific to each figurine. At the end of the duration, the creature reverts to its figurine form. It reverts to a figurine early if its creature form drops to 0 {@variantrule Hit Points|XPHB} or if you take a {@action Magic|XPHB} action while touching the creature to make it revert to figurine form. When the creature becomes a figurine again, its property can't be used again until a certain amount of time has passed, as specified below.",
          ],
        },
        {
          name: 'Figurine of Wondrous Power, Ebony Fly',
          source: 'XDMG',
          srd52: true,
          entries: [
            "This ebony statuette, carved in the likeness of a horsefly, can become a {@creature Giant Fly|XDMG} for up to 12 hours and can be ridden as a mount. Once it has been used, it can't be used again until 2 days have passed.",
          ],
        },
      ],
      itemGroup: [],
    })
    await writeJson(sourceRoot, 'items-base.json', {
      baseitem: [{ name: 'Club', source: 'PHB', type: 'M', srd: true }],
      itemMastery: [],
      itemProperty: [],
      itemType: [
        { name: 'Melee Weapon', abbreviation: 'M', source: 'PHB' },
        { name: 'Tack and Harness', abbreviation: 'TAH', source: 'XPHB' },
      ],
    })
    const allowlist = createAllowlist()
    allowlist.dependencies = [
      {
        collection: 'itemType',
        srdVersion: '5.1',
        officialSection: 'Equipment',
        reason: 'Fixture item type.',
        identities: ['M|PHB'],
      },
      {
        collection: 'itemType',
        srdVersion: '5.2.1',
        officialSection: 'Equipment',
        reason: 'Fixture item type.',
        identities: ['TAH|XPHB'],
      },
    ]

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist,
      upstreamRevision: 'fixture-revision',
    })
    const items = JSON.parse(snapshot.files.get('data/items.json') ?? '{}').item
    const stabling = items.find((item: { name: string }) => item.name === 'Stabling (per day)')
    const spidersSting = items.find((item: { name: string }) => item.name === "Spider's Sting")
    const staff = items.find((item: { name: string }) => item.name === 'Staff of Withering')
    const ironFlask2014 = items.find(
      (item: { name: string; source: string }) =>
        item.name === 'Iron Flask' && item.source === 'DMG',
    )
    const ironFlask2024 = items.find(
      (item: { name: string; source: string }) =>
        item.name === 'Iron Flask' && item.source === 'XDMG',
    )
    const giantStrengthPotion = items.find(
      (item: { name: string }) => item.name === 'Potion of Cloud Giant Strength',
    )
    const hornOfValhalla = items.find(
      (item: { name: string }) => item.name === 'Horn of Valhalla, Silver',
    )
    const manualOfGolems = items.find(
      (item: { name: string }) => item.name === 'Manual of Clay Golems',
    )

    expect(stabling.value).toBe(50)
    expect(spidersSting.entries).toEqual([
      "A creature subjected to Spider's Sting must succeed on a {@dc 13} Constitution saving throw or have the {@condition Poisoned|XPHB} condition for 1 hour. If the creature fails the save by 5 or more, the creature also has the {@condition Unconscious|XPHB} condition while {@condition Poisoned|XPHB} in this way. The creature wakes up if it takes damage or if another creature takes an action to shake it awake.",
    ])
    expect(staff.reqAttune).toBe(true)
    expect(ironFlask2014.entries[3].rows).toContainEqual(['51-54', 'Demon (type 1)'])
    expect(ironFlask2014.entries[3].rows).toContainEqual(['100', '{@creature Xorn}'])
    expect(ironFlask2024.entries).toHaveLength(3)
    expect(JSON.stringify(ironFlask2024.entries)).not.toContain('determined randomly')
    expect(giantStrengthPotion.entries).toEqual([
      'When you drink this potion, your Strength score changes to 27 for 1 hour. The potion has no effect on you if your Strength is equal to or greater than that score.',
      "This potion's transparent liquid has floating in it a sliver of light resembling a cloud giant's fingernail.",
    ])
    expect(hornOfValhalla.entries[0]).toContain('spirits from the Valhalla')
    expect(hornOfValhalla.entries[1]).toContain('2d4 + 2')
    expect(manualOfGolems.entries[0]).toContain('two level 5 spell slots')
    expect(manualOfGolems.entries[2]).toContain("See Monsters for the golem's stat block")
    expect(JSON.stringify(items)).toContain("as specified in the figurine's description")
    expect(JSON.stringify(items)).toContain('(see the accompanying stat block)')
    expect(snapshot.manifest.coverage.textCorrections).toEqual({
      ebonyFlyStatBlock2024: 1,
      figurineReuseDescription2024: 1,
    })
    expect(snapshot.manifest.coverage.structuredCorrections).toEqual({
      giantStrengthPotionText2024: 1,
      hornOfValhallaText2014: 1,
      ironFlask2014: 1,
      ironFlask2024: 1,
      manualOfGolemsText2024: 1,
      spidersSting2024: 2,
      staffOfWitheringAttunement2024: 1,
      stablingCost2024: 1,
    })
  })

  test('replaces reviewed full-book magic-item wording with the official SRD text', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'items.json', {
      item: [
        {
          name: 'Amulet of Health',
          source: 'DMG',
          srd: true,
          type: 'G',
          entries: [
            'Your Constitution score is 19 while you wear this amulet. It has no effect on you if your Constitution score is already 19 or higher without it.',
          ],
        },
        {
          name: 'Mace of Smiting',
          source: 'DMG',
          srd: true,
          entries: [
            "When you roll a 20 on an attack roll made with this weapon, the target takes an extra 7 bludgeoning damage, or an extra 14 bludgeoning damage if it's a construct. If a construct has 25 hit points or fewer after taking this damage, it is destroyed.",
            '{@note Note: According to the SRD, it is an extra {@damage 2d6} and {@damage 4d6} bludgeoning damage, although {@link this is incorrect|https://rpg.stackexchange.com/a/174522/53884}}.',
          ],
        },
        {
          name: 'Quarterstaff of the Acrobat',
          source: 'XDMG',
          srd52: true,
          entries: [
            'This weapon has {@itemProperty T|XPHB|Thrown} with a normal range of 30 feet and a long range of 120 feet. Immediately after you make a ranged attack with the weapon, it flies back to your hand.',
          ],
        },
      ],
      itemGroup: [],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist: createAllowlist(),
      upstreamRevision: 'fixture-revision',
    })
    const items = JSON.parse(snapshot.files.get('data/items.json') ?? '{}').item

    expect(
      items.find((item: { name: string }) => item.name === 'Amulet of Health').entries,
    ).toEqual([
      'Your Constitution score is 19 while you wear this amulet. It has no effect on you if your Constitution is already 19 or higher.',
    ])
    expect(items.find((item: { name: string }) => item.name === 'Mace of Smiting').entries).toEqual(
      [
        "When you roll a 20 on an attack roll made with this weapon, the target takes an extra {@damage 2d6} bludgeoning damage, or {@damage 4d6} bludgeoning damage if it's a construct. If a construct has 25 hit points or fewer after taking this damage, it is destroyed.",
      ],
    )
    expect(
      items.find((item: { name: string }) => item.name === 'Quarterstaff of the Acrobat').entries,
    ).toEqual([
      'This weapon has the {@itemProperty T|XPHB|Thrown} property with a normal range of 30 feet and a long range of 120 feet. Immediately after you make a ranged attack with the weapon, it flies back to your hand.',
    ])
    expect(snapshot.manifest.coverage.textCorrections).toEqual({
      amuletOfHealth2014: 1,
      maceOfSmiting2014: 1,
      quarterstaffOfTheAcrobat2024: 1,
    })
    expect(snapshot.manifest.coverage.strippedContent).toEqual({
      maceOfSmitingBookCorrectionNote: 1,
    })
  })

  test('materializes shared SRD item-entry templates into distributable item text', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'items.json', {
      item: [
        {
          name: 'Potion of Acid Resistance',
          source: 'XDMG',
          srd52: true,
          type: 'G|PHB',
          resist: ['acid'],
          hasRefs: true,
          entries: ['{#itemEntry Potion of Resistance|XDMG}'],
        },
      ],
      itemGroup: [],
    })
    await writeJson(sourceRoot, 'items-base.json', {
      baseitem: [{ name: 'Club', source: 'PHB', type: 'M', srd: true }],
      itemMastery: [],
      itemProperty: [],
      itemType: [
        { name: 'Adventuring Gear', abbreviation: 'G', source: 'PHB' },
        { name: 'Melee Weapon', abbreviation: 'M', source: 'PHB' },
      ],
      itemEntry: [
        {
          name: 'Potion of Resistance',
          source: 'XDMG',
          entriesTemplate: [
            'When you drink this potion, you have resistance to {{getFullImmRes item.resist}} damage for 1 hour.',
          ],
        },
      ],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist: createAllowlist(),
      upstreamRevision: 'fixture-revision',
    })
    const potion = JSON.parse(snapshot.files.get('data/items.json') ?? '{}').item[0]

    expect(potion.entries).toEqual([
      'When you drink this potion, you have resistance to acid damage for 1 hour.',
    ])
    expect(potion).not.toHaveProperty('hasRefs')
    expect(snapshot.manifest.coverage.materializedItemEntries).toEqual({
      'potion of resistance|xdmg': 1,
    })
  })

  test('fails closed when a selected SRD item has an unresolved shared entry', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'items.json', {
      item: [
        {
          name: 'Potion of Acid Resistance',
          source: 'DMG',
          srd: true,
          entries: ['{#itemEntry Potion of Resistance}'],
        },
      ],
      itemGroup: [],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow(
      'Missing item-entry template Potion of Resistance for Potion of Acid Resistance|DMG',
    )
  })

  test('records reviewed exclusions for incorrectly marked SRD roots', async () => {
    const sourceRoot = await createFixture()
    const allowlist = {
      ...createAllowlist(),
      dependencies: createAllowlist().dependencies.map((rule) => ({
        ...rule,
        identities: rule.identities.filter((identity) => identity !== 'G|PHB'),
      })),
      rootExclusions: {
        'items.json#item': {
          reason: 'The fixture record is not present in the official SRD.',
          identities: ['Rope|PHB'],
        },
      },
    }

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist,
      upstreamRevision: 'fixture-revision',
    })

    expect(JSON.parse(snapshot.files.get('data/items.json') ?? '{}').item).toEqual([])
    expect(snapshot.manifest.coverage.exclusions).toEqual(
      expect.objectContaining({ 'items.json#item': 1 }),
    )
    expect(snapshot.manifest.coverage.exclusionReasons).toEqual(
      expect.objectContaining({
        'items.json#item': 'The fixture record is not present in the official SRD.',
      }),
    )
  })

  test('filters roots and spell associations while recording approved dependencies', async () => {
    const sourceRoot = await createFixture()
    const options = {
      sourceRoot,
      provenance,
      allowlist: createAllowlist(),
      upstreamRevision: 'fixture-revision',
    }

    const first = await buildSrdSnapshot(options)
    const second = await buildSrdSnapshot(options)

    expect([...first.files.entries()]).toEqual([...second.files.entries()])
    expect(JSON.parse(first.files.get('data/items.json') ?? '{}').item).toEqual([
      expect.objectContaining({ name: 'Rope', source: 'PHB' }),
    ])
    expect(JSON.parse(first.files.get('data/items.json') ?? '{}').item[0].entries).toEqual([
      {
        type: 'entries',
        name: 'Rope',
        entries: ["The GM's useful cord is stored beside the DMG."],
      },
    ])
    expect(first.files.get('data/items.json')).not.toMatch(
      /additionalEntries|basicRules|hasFluff|reprintedAs|otherSources|additionalSources|soundClip|"page"/,
    )
    expect(JSON.parse(first.files.get('data/items.json') ?? '{}').item[0]._versions).toEqual([
      expect.objectContaining({ name: 'Rope Variant', source: 'PHB' }),
    ])
    expect(first.manifest.coverage.strippedMetadata).toEqual({
      additionalEntries: 1,
      additionalSources: 1,
      basicRules: 1,
      basicRules2024: 1,
      classFeatures: 1,
      hasFluff: 1,
      hasFluffImages: 1,
      lootTables: 1,
      miscTags: 1,
      origin: 1,
      optionalfeatures: 1,
      otherSources: 1,
      page: 2,
      referenceSources: 1,
      reprintedAs: 1,
      reqAttuneTags: 1,
      soundClip: 1,
      tier: 1,
    })
    expect(first.manifest.coverage.textCorrections).toEqual({ gameMasterAbbreviation: 1 })
    expect(first.manifest.coverage.strippedContent).toEqual({
      bardRepertoireSidebar: 1,
      deckEnmitySidebar: 1,
    })
    expect(JSON.parse(first.files.get('data/class/class-wizard.json') ?? '{}').class).toEqual([
      expect.objectContaining({
        name: 'Wizard',
        source: 'PHB',
        classFeatures: ['Spellcasting|Wizard||1'],
      }),
    ])
    expect(JSON.parse(first.files.get('data/fluff-races.json') ?? '{}')).toEqual({ raceFluff: [] })
    expect(JSON.parse(first.files.get('data/fluff-backgrounds.json') ?? '{}')).toEqual({
      backgroundFluff: [],
    })
    expect(JSON.parse(first.files.get('data/class/fluff-class-wizard.json') ?? '{}')).toEqual({
      classFluff: [],
    })
    expect(
      JSON.parse(first.files.get('data/generated/gendata-spell-source-lookup.json') ?? '{}').phb
        .light.class,
    ).toEqual({ PHB: { Wizard: true } })
    expect(first.manifest.coverage.dependencies.map((entry) => entry.identity)).toEqual([
      'G|PHB',
      'M|PHB',
    ])
    expect(first.manifest.coverage.records).toHaveLength(8)
    expect(first.manifest.coverage.records).toContainEqual({
      relativePath: 'data/items.json',
      collection: 'item',
      identity: 'Rope|PHB',
      recordSha256: sha256(
        stableJson(JSON.parse(first.files.get('data/items.json') ?? '{}').item[0]),
      ),
      provenanceType: 'root-marker',
      marker: 'srd',
      srdVersion: '5.1',
    })
    expect(first.manifest.coverage.records).toContainEqual(
      expect.objectContaining({
        relativePath: 'data/spells/spells-xphb.json',
        collection: 'spell',
        identity: 'Light|XPHB',
        provenanceType: 'root-marker',
        marker: 'srd52',
        srdVersion: '5.2.1',
      }),
    )
    expect(first.manifest.coverage.records).toContainEqual(
      expect.objectContaining({
        relativePath: 'data/items-base.json',
        collection: 'itemType',
        identity: 'G|PHB',
        provenanceType: 'approved-dependency',
        srdVersion: '5.1',
        officialSection: 'Equipment',
      }),
    )
    expect(first.manifest.coverage.references['class/class-wizard.json#classFeatures']).toEqual({
      resolved: 1,
      excluded: 1,
    })
    expect(first.manifest.coverage.referenceExclusions).toEqual([
      {
        collection: 'classFeature',
        reference: 'Cantrip Formulas|Wizard||3|TCE',
        owner: 'Wizard|PHB',
        reason: 'Fixture non-SRD optional feature.',
      },
    ])
    expect(first.manifest.files['data/items.json']).toBe(
      sha256(first.files.get('data/items.json') ?? ''),
    )

    for (const [relativePath, contents] of first.files) {
      if (!relativePath.startsWith('data/') || relativePath === 'data/items-base.json') continue
      const payload = JSON.parse(contents) as Record<string, unknown>
      for (const records of Object.values(payload)) {
        if (!Array.isArray(records)) continue
        expect(records.every(isSrdRoot), `${relativePath} contains an unmarked root`).toBe(true)
      }
    }
  })

  test('fails closed when a selected record has an unaudited missing feature reference', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'class/class-wizard.json', {
      class: [
        {
          name: 'Wizard',
          source: 'PHB',
          srd: true,
          classFeatures: ['Missing Feature|Wizard||2'],
        },
      ],
      subclass: [],
      classFeature: [],
      subclassFeature: [],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Missing classFeature dependency Missing Feature|Wizard||2')
  })

  test('closes source-qualified item references through audited item groups', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'backgrounds.json', {
      background: [
        {
          name: 'Acolyte',
          source: 'PHB',
          srd: true,
          startingEquipment: [{ a: [{ item: 'Holy Symbol|PHB' }] }],
        },
      ],
    })
    await writeJson(sourceRoot, 'items.json', {
      ...ROOT_FIXTURES['items.json'],
      itemGroup: [
        {
          name: 'Holy Symbol',
          source: 'PHB',
          items: ['Amulet|PHB'],
        },
      ],
      item: [
        ...(ROOT_FIXTURES['items.json'] as { item: unknown[] }).item,
        { name: 'Amulet', source: 'PHB', srd: true },
      ],
    })
    const allowlist = createAllowlist()
    allowlist.dependencies.push({
      collection: 'itemGroup',
      srdVersion: '5.1',
      officialSection: 'Equipment — Adventuring Gear — Holy Symbol',
      reason: 'Fixture equipment group.',
      identities: ['Holy Symbol|PHB'],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist,
      upstreamRevision: 'fixture-revision',
    })

    expect(JSON.parse(snapshot.files.get('data/items.json') ?? '{}').itemGroup).toEqual([
      expect.objectContaining({ name: 'Holy Symbol', source: 'PHB' }),
    ])
    expect(snapshot.manifest.coverage.references['distributed-data#itemReferences']).toEqual({
      resolved: 2,
      excluded: 0,
    })
    expect(snapshot.manifest.coverage.dependencies).toContainEqual(
      expect.objectContaining({
        collection: 'itemGroup',
        identity: 'Holy Symbol|PHB',
        reference: 'Holy Symbol|PHB',
      }),
    )
  })

  test('fails closed when an item reference needs an unaudited dependency', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'backgrounds.json', {
      background: [
        {
          name: 'Acolyte',
          source: 'PHB',
          srd: true,
          startingEquipment: [{ a: [{ item: 'Holy Symbol|PHB' }] }],
        },
      ],
    })
    await writeJson(sourceRoot, 'items.json', {
      ...ROOT_FIXTURES['items.json'],
      itemGroup: [{ name: 'Holy Symbol', source: 'PHB' }],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unapproved itemGroup dependency Holy Symbol|PHB')
  })

  test('closes embedded feature references and removes only audited non-SRD options', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'optionalfeatures.json', {
      optionalfeature: [{ name: 'Archery', source: 'PHB', srd: true }],
    })
    await writeJson(sourceRoot, 'feats.json', {
      feat: [{ name: 'Alert', source: 'PHB' }],
    })
    await writeJson(sourceRoot, 'class/class-wizard.json', {
      class: [
        {
          name: 'Wizard',
          source: 'PHB',
          srd: true,
          classFeatures: ['Fighting Style|Wizard||1'],
        },
      ],
      subclass: [],
      classFeature: [
        {
          name: 'Fighting Style',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          srd: true,
          entries: [
            { type: 'refClassFeature', classFeature: 'Helper|Wizard||2' },
            { type: 'refOptionalfeature', optionalfeature: 'Archery' },
            { type: 'refOptionalfeature', optionalfeature: 'Blind Fighting|TCE' },
            { type: 'refFeat', feat: 'Alert|PHB' },
          ],
        },
        {
          name: 'Helper',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 2,
          srd: true,
        },
      ],
      subclassFeature: [],
    })
    const allowlist = createAllowlist()
    allowlist.referenceExclusions = [
      {
        collection: 'optionalfeature',
        source: 'TCE',
        reason: 'Fixture non-SRD fighting style.',
      },
    ]
    allowlist.dependencies.push({
      collection: 'feat',
      srdVersion: '5.1',
      officialSection: 'Feats',
      reason: 'Fixture referenced feat.',
      identities: ['Alert|PHB'],
    })

    const snapshot = await buildSrdSnapshot({
      sourceRoot,
      provenance,
      allowlist,
      upstreamRevision: 'fixture-revision',
    })
    const classPayload = JSON.parse(snapshot.files.get('data/class/class-wizard.json') ?? '{}')

    expect(classPayload.classFeature[0].entries).toEqual([
      { type: 'refClassFeature', classFeature: 'Helper|Wizard||2' },
      { type: 'refOptionalfeature', optionalfeature: 'Archery' },
      { type: 'refFeat', feat: 'Alert|PHB' },
    ])
    expect(
      snapshot.manifest.coverage.references['class/class-wizard.json#inlineClassFeature'],
    ).toEqual({ resolved: 1, excluded: 0 })
    expect(
      snapshot.manifest.coverage.references['class/class-wizard.json#inlineOptionalfeature'],
    ).toEqual({ resolved: 1, excluded: 1 })
    expect(snapshot.manifest.coverage.references['class/class-wizard.json#inlineFeat']).toEqual({
      resolved: 1,
      excluded: 0,
    })
    expect(JSON.parse(snapshot.files.get('data/feats.json') ?? '{}').feat).toEqual([
      expect.objectContaining({ name: 'Alert', source: 'PHB' }),
    ])
    expect(snapshot.manifest.coverage.dependencies).toContainEqual({
      collection: 'feat',
      identity: 'Alert|PHB',
      reason: 'Fixture referenced feat.',
      reference: 'Alert|PHB',
      srdVersion: '5.1',
      officialSection: 'Feats',
    })
    expect(snapshot.manifest.coverage.referenceExclusions).toContainEqual({
      collection: 'optionalfeature',
      reference: 'Blind Fighting|TCE',
      owner: 'Fighting Style|PHB',
      reason: 'Fixture non-SRD fighting style.',
    })
  })

  test('fails closed on an unaudited unflagged embedded dependency', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'optionalfeatures.json', {
      optionalfeature: [{ name: 'Missing Option', source: 'PHB' }],
    })
    await writeJson(sourceRoot, 'class/class-wizard.json', {
      class: [
        {
          name: 'Wizard',
          source: 'PHB',
          srd: true,
          classFeatures: ['Fighting Style|Wizard||1'],
        },
      ],
      subclass: [],
      classFeature: [
        {
          name: 'Fighting Style',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          srd: true,
          entries: [{ type: 'refOptionalfeature', optionalfeature: 'Missing Option' }],
        },
      ],
      subclassFeature: [],
    })
    const allowlist = createAllowlist()
    allowlist.referenceExclusions = []

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist,
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unapproved optionalfeature dependency Missing Option|PHB')
  })

  test('rejects presentation assets in selected records', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'actions.json', {
      action: [{ name: 'Attack', source: 'PHB', srd: true, images: [] }],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Prohibited presentation field images in data/actions.json')
  })

  test('rejects roots with ambiguous SRD version markers', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'actions.json', {
      action: [{ name: 'Attack', source: 'PHB', srd: true, srd52: true }],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Ambiguous SRD markers on data/actions.json#action:Attack|PHB: srd, srd52')
  })

  test('rejects source-qualified data outside the audited source set', async () => {
    const sourceRoot = await createFixture()
    await writeJson(sourceRoot, 'actions.json', {
      action: [
        {
          name: 'Attack',
          source: 'PHB',
          srd: true,
          entries: [{ type: 'entries', source: 'TCE', entries: ['Not SRD content.'] }],
        },
      ],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: createAllowlist(),
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unexpected source TCE in data/actions.json')
  })

  test('fails closed when an untagged support dependency is not approved', async () => {
    const sourceRoot = await createFixture()
    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist: {
          ...createAllowlist(),
          dependencies: [],
        },
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unapproved itemType dependency')
  })

  test('rejects stale audit approvals that no longer match the source corpus', async () => {
    const sourceRoot = await createFixture()
    const allowlist = createAllowlist()
    allowlist.dependencies.push({
      collection: 'itemType',
      srdVersion: '5.1',
      officialSection: 'Equipment',
      reason: 'Stale fixture approval.',
      identities: ['UNUSED|PHB'],
    })

    await expect(
      buildSrdSnapshot({
        sourceRoot,
        provenance,
        allowlist,
        upstreamRevision: 'fixture-revision',
      }),
    ).rejects.toThrow('Unused dependency approvals: itemType:UNUSED|PHB')
  })
})
