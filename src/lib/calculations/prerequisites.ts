import type { Raw5ePrereq } from '@/types/5etools';
import type { AbilityName } from './abilityScores';

export interface PrereqCharacterSnapshot {
  level: number;
  class?: string;
  race?: string;
  abilityScores?: Partial<Record<AbilityName, number>>;
  features?: Array<{ name: string }>;
  spells?: {
    cantrips?: string[];
    spellsKnown?: string[];
    preparedSpells?: string[];
  };
  /** Optional multi-class progression. When present, takes precedence over `level`/`class`. */
  progression?: {
    classes?: Array<{ name: string; levels: number; source?: string }>;
  };
}

/** Canonical 5etools pact prerequisite text normalizer (Parser.prereqPactToFull). */
export function prereqPactToFull(pact: string): string {
  if (pact === 'Chain') return 'Pact of the Chain';
  if (pact === 'Tome') return 'Pact of the Tome';
  if (pact === 'Blade') return 'Pact of the Blade';
  if (pact === 'Talisman') return 'Pact of the Talisman';
  return pact;
}

/** Canonical 5etools spell prerequisite text normalizer (Parser.prereqSpellToFull). */
export function prereqSpellToFull(spell: string): string {
  const [namePart] = spell.split('|');
  const [spellName, suffix] = namePart.split('#');
  if (!suffix) return spellName;
  if (suffix === 'c') return `${spellName} cantrip`;
  if (suffix === 'x') return 'Hex spell or a warlock feature that curses';
  return spellName;
}

function parseSpellPrereqRef(ref: string): {
  name: string;
  suffix?: string;
} {
  const [namePart] = ref.split('|');
  const [name, suffix] = namePart.split('#');
  return { name, suffix };
}

export interface CheckPrereqOptions {
  /**
   * When set, level checks compare against this specific class's level
   * rather than total character level.
   */
  className?: string;
  /**
   * Skip the race prerequisite check entirely (e.g. when browsing feats in
   * a race-selector context before race is finalised).
   */
  ignoreRacePrereq?: boolean;
  /**
   * Set of class names known to grant spellcasting (from game data).
   * Required for the `spellcasting: true` prerequisite check.
   * If omitted, spellcasting prerequisites are assumed not met unless
   * the character has at least one class entry with a known spellcasting class.
   */
  spellcastingClasses?: Set<string>;
}

export interface PrereqResult {
  met: boolean;
  reason?: string;
}

/**
 * Check a single 5etools prerequisite object against a character snapshot.
 * Each property within the prereq object is AND-ed together; call this once
 * per element in `item.prerequisite[]`.
 */
export function checkPrerequisite(
  prereq: Raw5ePrereq,
  character: PrereqCharacterSnapshot,
  options: CheckPrereqOptions = {},
): PrereqResult {
  if (!character) return { met: false, reason: 'No character' };
  if (prereq.level !== undefined) {
    let charLevel: number;

    if (options.className && character.progression?.classes) {
      const entry = character.progression.classes.find(
        (c) => c.name.toLowerCase() === options.className?.toLowerCase(),
      );
      charLevel = entry?.levels ?? 0;
    } else {
      charLevel = character.level ?? 0;
    }

    const required =
      typeof prereq.level === 'object'
        ? (prereq.level.level ?? 1)
        : prereq.level;

    if (charLevel < required) {
      return {
        met: false,
        reason: `Requires ${options.className ?? 'character'} level ${required}`,
      };
    }
  }
  if (Array.isArray(prereq.ability)) {
    const scores = character.abilityScores ?? {};
    const meetsAbility = prereq.ability.some((req) => {
      if (typeof req === 'string') {
        return (scores[req] ?? 0) >= 13;
      }
      if (req && typeof req === 'object' && req.ability) {
        return (scores[req.ability] ?? 0) >= (req.score ?? 13);
      }
      return false;
    });
    if (!meetsAbility) {
      return { met: false, reason: 'Does not meet ability score requirement' };
    }
  }
  if (!options.ignoreRacePrereq && Array.isArray(prereq.race)) {
    const charRace = (character.race ?? '').toLowerCase();
    const meetsRace = prereq.race.some((req) => {
      const name = typeof req === 'string' ? req : req.name;
      return name && charRace === name.toLowerCase();
    });
    if (!meetsRace) {
      return { met: false, reason: 'Race requirement not met' };
    }
  }

  if (Array.isArray(prereq.class)) {
    const primaryClass =
      character.progression?.classes?.[0]?.name ?? character.class ?? '';
    const charClass = primaryClass.toLowerCase();
    const meetsClass = prereq.class.some((req) => {
      const name = typeof req === 'string' ? req : req.name;
      return name && charClass === name.toLowerCase();
    });
    if (!meetsClass) {
      return { met: false, reason: 'Class requirement not met' };
    }
  }
  if (prereq.spellcasting === true) {
    const casterClasses = options.spellcastingClasses;
    let hasSpellcasting = false;

    if (casterClasses && character.progression?.classes) {
      hasSpellcasting = character.progression.classes.some((cls) =>
        casterClasses.has(cls.name),
      );
    } else if (casterClasses && character.class) {
      hasSpellcasting = casterClasses.has(character.class);
    } else {
      // Fall back: has any spells listed
      const sp = character.spells;
      hasSpellcasting =
        (sp?.cantrips?.length ?? 0) > 0 ||
        (sp?.spellsKnown?.length ?? 0) > 0 ||
        (sp?.preparedSpells?.length ?? 0) > 0;
    }

    if (!hasSpellcasting) {
      return { met: false, reason: 'Requires spellcasting ability' };
    }
  }
  if (prereq.spell) {
    const required = Array.isArray(prereq.spell)
      ? prereq.spell
      : [prereq.spell];
    const knownCantrips = new Set(
      (character.spells?.cantrips ?? []).map((s) => s.toLowerCase()),
    );
    const knownNames = new Set(
      [
        ...(character.spells?.cantrips ?? []),
        ...(character.spells?.spellsKnown ?? []),
        ...(character.spells?.preparedSpells ?? []),
      ].map((s) => s.toLowerCase()),
    );
    const hasCurseFeature =
      character.features?.some((f) => f.name.toLowerCase().includes('curse')) ??
      false;

    const missing = required.filter((ref) => {
      const parsed = parseSpellPrereqRef(ref);
      const name = parsed.name.toLowerCase();

      if (parsed.suffix === 'c') {
        return !knownCantrips.has(name);
      }

      if (parsed.suffix === 'x') {
        return !(knownNames.has('hex') || hasCurseFeature);
      }

      return !knownNames.has(name);
    });

    if (missing.length > 0) {
      const names = missing.map((r) => prereqSpellToFull(r)).join(', ');
      return { met: false, reason: `Requires spell: ${names}` };
    }
  }
  if (prereq.pact) {
    const requiredPact = prereqPactToFull(prereq.pact);
    const hasPact = character.features?.some((f) =>
      f.name.toLowerCase().includes(requiredPact.toLowerCase()),
    );
    if (!hasPact) {
      return { met: false, reason: `Requires ${requiredPact}` };
    }
  }

  if (prereq.patron) {
    const hasPatron = character.features?.some((f) =>
      f.name.toLowerCase().includes(prereq.patron?.toLowerCase()),
    );
    if (!hasPatron) {
      return { met: false, reason: `Requires patron: ${prereq.patron}` };
    }
  }

  return { met: true };
}

export interface AllPrereqsResult {
  met: boolean;
  /** Human-readable failure reasons, one per failing prereq block. */
  failures: string[];
}

/**
 * Check all prerequisites on a 5etools feat/feature entry (AND logic across
 * the `prerequisite` array, OR within individual condition objects that list
 * multiple abilities/races/classes).
 *
 * @param item - Any 5etools object with an optional `prerequisite` array
 * @param character - Character snapshot
 * @param options - Optional checks (spellcastingClasses, ignoreRacePrereq, etc.)
 */
export function checkAllPrerequisites(
  item: { prerequisite?: Raw5ePrereq[] },
  character: PrereqCharacterSnapshot,
  options: CheckPrereqOptions = {},
): AllPrereqsResult {
  if (!item.prerequisite || !Array.isArray(item.prerequisite)) {
    return { met: true, failures: [] };
  }

  const failures: string[] = [];
  for (const prereq of item.prerequisite) {
    const result = checkPrerequisite(prereq, character, options);
    if (!result.met && result.reason) {
      failures.push(result.reason);
    }
  }

  return { met: failures.length === 0, failures };
}
