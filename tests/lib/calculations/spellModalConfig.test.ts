import { describe, expect, it } from 'vitest';
import { buildSpellModalConfig } from '@/lib/calculations/spellModalConfig';
import type { Spell5e } from '@/types/5etools';
import type { SpellProfile } from '@/types/character';

function makeSpell(name: string, level: number): Spell5e {
  return {
    name,
    source: 'PHB',
    level,
    school: 'A',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'self' } },
    components: { v: true },
    duration: [{ type: 'instant' }],
  } as Spell5e;
}

describe('buildSpellModalConfig', () => {
  it('returns unrestricted config for special profile', () => {
    const specialProfile: SpellProfile = {
      id: 'special:unrestricted',
      type: 'special',
      label: 'Unrestricted',
      cantrips: ['Light'],
      spellsKnown: ['Magic Missile'],
      preparedSpells: [],
      alwaysPrepared: true,
    };

    const result = buildSpellModalConfig({
      activeProfile: specialProfile,
      spellProfiles: [specialProfile],
      detailsByProfileId: new Map(),
      spellByName: new Map<string, Spell5e>([
        ['light|', makeSpell('Light', 0)],
        ['magic missile|', makeSpell('Magic Missile', 1)],
      ]),
    });

    expect(result).not.toBeNull();
    expect(result?.allowedLevels.has('0')).toBe(true);
    expect(result?.allowedLevels.has('9')).toBe(true);
    expect(result?.categories).toHaveLength(2);
  });

  it('respects cantrip and spell limits for class profile', () => {
    const classProfile: SpellProfile = {
      id: 'class:Wizard|PHB',
      type: 'class',
      label: 'Wizard',
      className: 'Wizard',
      classSource: 'PHB',
      cantrips: ['Light'],
      spellsKnown: ['Magic Missile'],
      preparedSpells: ['Magic Missile'],
    };

    const result = buildSpellModalConfig({
      activeProfile: classProfile,
      spellProfiles: [classProfile],
      detailsByProfileId: new Map([
        [
          classProfile.id,
          {
            cantripLimit: 3,
            knownSpellLimit: 4,
            isPreparedCaster: true,
            maxSpellLevel: 2,
          },
        ],
      ]),
      spellByName: new Map<string, Spell5e>([
        ['light|', makeSpell('Light', 0)],
        ['magic missile|', makeSpell('Magic Missile', 1)],
      ]),
    });

    expect(result).not.toBeNull();
    expect(result?.allowedLevels.has('0')).toBe(true);
    expect(result?.allowedLevels.has('2')).toBe(true);
    expect(result?.categories[0].max).toBe(3);
    expect(result?.categories[1].max).toBe(4);
  });

  it('does not add leveled spell levels when effectiveSpellLimit is zero', () => {
    const classProfile: SpellProfile = {
      id: 'class:Artificer|TCE',
      type: 'class',
      label: 'Artificer',
      className: 'Artificer',
      classSource: 'TCE',
      cantrips: [],
      spellsKnown: [],
      preparedSpells: [],
    };

    const result = buildSpellModalConfig({
      activeProfile: classProfile,
      spellProfiles: [classProfile],
      detailsByProfileId: new Map([
        [
          classProfile.id,
          {
            cantripLimit: 2,
            knownSpellLimit: 0,
            isPreparedCaster: false,
            maxSpellLevel: 1,
          },
        ],
      ]),
      spellByName: new Map<string, Spell5e>(),
    });

    expect(result).not.toBeNull();
    expect(result?.allowedLevels.has('0')).toBe(true);
    expect(result?.allowedLevels.has('1')).toBe(false);
    expect(result?.categories).toHaveLength(1);
    expect(result?.categories[0].key).toBe('cantrips');
  });
});
