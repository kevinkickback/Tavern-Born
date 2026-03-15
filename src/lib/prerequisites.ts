// Prerequisite validation — pure, no React/Zustand dependencies.
// Ported from fizbanes-forge/src/lib/PrerequisiteValidator.js.
//
// Usage:
//   const { met, failures } = checkAllPrerequisites(feat, character);
//   const { met, reason } = checkPrerequisite(prereq, character, { className: 'Fighter' });

// ── Character snapshot ────────────────────────────────────────────────────────
// A structural subset accepted by the validator. Both the current flat
// `Character` type and future multi-class progression shapes satisfy it.

export interface PrereqCharacterSnapshot {
  /** Total character level. */
  level: number;
  /** Primary class name (string, e.g. "Fighter"). */
  class?: string;
  /** Race name (string, e.g. "Dwarf"). */
  race?: string;
  abilityScores?: Partial<Record<string, number>>;
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

// ── Raw 5etools prerequisite shapes ──────────────────────────────────────────

type AbilityReq = string | { ability: string; score?: number };
type RaceReq   = string | { name: string };
type ClassReq  = string | { name: string };

interface Raw5ePrereq {
  level?: number | { level: number };
  ability?: AbilityReq[];
  race?: RaceReq[];
  class?: ClassReq[];
  spellcasting?: boolean;
  spell?: string | string[];
  pact?: string;
  patron?: string;
}

// ── Options ───────────────────────────────────────────────────────────────────

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

// ── Single-prerequisite check ─────────────────────────────────────────────────

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

  // ── Level ──────────────────────────────────────────────────────────────────
  if (prereq.level !== undefined) {
    let charLevel: number;

    if (options.className && character.progression?.classes) {
      const entry = character.progression.classes.find(
        (c) => c.name.toLowerCase() === options.className!.toLowerCase(),
      );
      charLevel = entry?.levels ?? 0;
    } else {
      charLevel = character.level ?? 0;
    }

    const required =
      typeof prereq.level === 'object' ? prereq.level.level ?? 1 : prereq.level;

    if (charLevel < required) {
      return {
        met: false,
        reason: `Requires ${options.className ?? 'character'} level ${required}`,
      };
    }
  }

  // ── Ability scores ─────────────────────────────────────────────────────────
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

  // ── Race ───────────────────────────────────────────────────────────────────
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

  // ── Class ──────────────────────────────────────────────────────────────────
  if (Array.isArray(prereq.class)) {
    const primaryClass = character.progression?.classes?.[0]?.name
      ?? character.class
      ?? '';
    const charClass = primaryClass.toLowerCase();
    const meetsClass = prereq.class.some((req) => {
      const name = typeof req === 'string' ? req : req.name;
      return name && charClass === name.toLowerCase();
    });
    if (!meetsClass) {
      return { met: false, reason: 'Class requirement not met' };
    }
  }

  // ── Spellcasting ───────────────────────────────────────────────────────────
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

  // ── Known spells ───────────────────────────────────────────────────────────
  if (prereq.spell) {
    const required = Array.isArray(prereq.spell) ? prereq.spell : [prereq.spell];
    const knownNames = new Set([
      ...(character.spells?.cantrips ?? []),
      ...(character.spells?.spellsKnown ?? []),
      ...(character.spells?.preparedSpells ?? []),
    ].map((s) => s.toLowerCase()));

    const missing = required.filter((ref) => {
      // 5etools spell refs: "SpellName|Source" or "SpellName#anchor|Source"
      const name = ref.split('#')[0].split('|')[0].toLowerCase();
      return !knownNames.has(name);
    });

    if (missing.length > 0) {
      const names = missing.map((r) => r.split('#')[0].split('|')[0]).join(', ');
      return { met: false, reason: `Requires spell: ${names}` };
    }
  }

  // ── Pact ───────────────────────────────────────────────────────────────────
  if (prereq.pact) {
    const hasPact = character.features?.some((f) =>
      f.name.toLowerCase().includes(prereq.pact!.toLowerCase()),
    );
    if (!hasPact) {
      return { met: false, reason: `Requires ${prereq.pact}` };
    }
  }

  // ── Patron ─────────────────────────────────────────────────────────────────
  if (prereq.patron) {
    const hasPatron = character.features?.some((f) =>
      f.name.toLowerCase().includes(prereq.patron!.toLowerCase()),
    );
    if (!hasPatron) {
      return { met: false, reason: `Requires patron: ${prereq.patron}` };
    }
  }

  return { met: true };
}

// ── All-prerequisites check (AND across array elements) ───────────────────────

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
