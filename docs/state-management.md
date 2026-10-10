# State Management

This document defines ownership and mutation contracts. Implementation-specific behavior should be
verified in the owning store, command, and tests.

## Stores

| Store | Owns | Primary entry points |
| --- | --- | --- |
| Character | Saved library, active draft, quarantine, dirty/save lifecycle | `characterStore.ts` |
| Game data | Parsed catalog, configuration, load/cache status | `gameDataStore.ts` |
| Preferences | Theme, home-card size, update preference, UI settings | `appPreferencesStore.ts` |

Zustand persistence uses `src/lib/storage/idb-storage.ts`. Parsed game data has its own cache in
`dataCache.ts`. Accordion/sidebar collapse state uses local storage, and Electron stores native
window bounds separately. PDF export page/content overrides and description/overflow settings are local UI preferences keyed by character and template (`sheetExportPreferences.ts`); they never alter character inventory, preparation, or rules text. Missing or invalid text settings fall back to full descriptions with ellipsis shortening.

Uploaded portraits also have a separate IndexedDB gallery (`portraitLibrary.ts`), capped at 20 images
and 40 MB of encoded data. Repeated uploads of the same image reuse its gallery entry. A character
stores its selected image data directly, so `.tbc` and `.tbclib` transfers remain self-contained and
deleting a gallery image does not change existing characters.

## Character write APIs

| API | Use |
| --- | --- |
| `updateCharacter(id, patch)` | Preferred user edit when the character ID is known. |
| `updateActiveCharacter(patch)` | Active-character page without an explicit ID. |
| `updateActiveCharacterDetails(patch)` | Patch only the `details` object. |
| `reconcileCharacter(id, patch)` | Silent system correction; never a user edit. |

Never mutate a character object directly. User mutations update `lastModified` and set transient
dirty state. Reconciliation writes both clean snapshots when possible and never clears an already
dirty draft.

`saveActiveCharacter()` captures the requested draft and is awaitable. It keeps the draft dirty
until that revision is durable and does not mark later edits as saved. A failed write leaves the
previous saved snapshot intact. Switching the active character cannot redirect a queued save;
deleting its target before the save starts cannot resurrect that record.
Overlapping Save requests for the same immutable draft share one write and outcome. Newer drafts
remain separate saves, and rejection releases the shared request so explicit retry can succeed.

## Saved-library transactions

`addCharacter`, `createNewCharacter`, `duplicateCharacter`, `deleteCharacter`, `deleteCharacters`,
`setCharacters`, and `importCharacters` return promises that resolve after the library write commits.
`updateCharacter` still changes an active draft immediately; for an inactive record it returns an
awaitable durable transaction. Duplicate name/ID allocation and import collisions use the latest
committed library inside the shared queue. Bulk deletion uses one transaction.

All library transactions share one serialized persistence boundary with Save and clean system
corrections. The queue waits for character hydration before reading the saved library; a failed
read rejects queued mutations without writing. Successful rehydration releases later retry work.
Replacement reads, including those started during hydration callbacks, keep queued writes waiting
for the latest load. Ignored automatic correction failures remain handled and dirty for explicit
Save retry.
Reload reads wait for an already executing transaction to finish, including publication of its
acknowledged library. They do not wait for queued actions that are themselves awaiting hydration;
this avoids a read/write deadlock. A rejected transaction releases the read without hiding its
failure from the caller, and later actions use the reloaded library.
Transactions write before publishing `characters`, so rejected writes need no optimistic
rollback. Draft edits and active selection never rewrite an unchanged library. Persist middleware
continues to own hydration and quarantine normalization; its writes share the queue and read the
latest library when their turn starts.
Quarantine acknowledgment is an awaited transaction: original backups remain exportable until
the removal is acknowledged. Failure keeps the dialog open and permits retry; later library
writes retain the unacknowledged backups.

Clean reconciliation updates the draft immediately and keeps it dirty until its correction commits.
Consecutive clean corrections remain ordered and become clean after the latest acknowledgement;
intervening player edits keep subsequent corrections in the draft until explicit Save. Creation
and library UI must await transactions before closing, clearing selections, or announcing success.
Pending actions block duplicate submissions. Storage errors leave the wizard or deletion selection
available for retry; creation selects the ID actually returned by the committed addition.

## Stored versus derived

Persist values the player or play session can change:

- allocated ability scores and source-qualified choices;
- class progression, hit-die results, current/temp HP;
- HP/AC adjustments and explicit overrides;
- spell profile selections and shared/Pact slot usage;
- inventory, currency, conditions, exhaustion, resource/hit-die use;
- character narrative/details and manual actions/effects;
- provenance needed to reverse grants.

Derive values that follow deterministically from current state and game data:

- effective scores/modifiers, proficiency bonus, skills, saves, passives;
- maximum HP, effective AC, movement, carrying capacity;
- spell slots maxima, spell DC/attack, readiness, action projections;
- resolved source text and display casing.

Do not add a persisted field merely to make rendering easier.

## Calculation context

`CharacterCalculationContext` is the pure shared boundary for resolved race/subrace, background,
classes/subclasses, feats, equipment, rules metadata, typed effects, and effective ability scores.
React consumers use `useCharacterCalculationContext`.

Effective ability scores compose allocated scores, origin bonuses, class ASIs, feat choices, active
effects, then supported exact overrides. Each layer produces a fresh value. Readiness may inspect
allocated scores directly when validating allocation; ordinary UI/export code may not.

HP and AC management display calculation traces but do not own class or equipment mutations.
Carrying capacity, prerequisites, Review, actions, and PDFs consume the same effective values.

## Domain command contract

Pure commands under `src/lib/character/commands/` return the complete transition. When grants are
owned, the result includes both:

```ts
{
  characterPatch,
  provenanceUpdate,
}
```

Hooks gather dependencies and commit once. Commands own reset, replacement, level-down, and source
change semantics. Do not sequence a materialized write and a later provenance write.

## Class progression

`character.classProgression` is authoritative for class identity, subclass identity, level, and
multiclass math. There are no top-level class mirrors.

- Class feats retain source-qualified slot ownership in `classFeatChoices`.
- Other normalized class and subclass choices retain descriptor identity, source-qualified owner,
  and earned level in `classChoiceSelections`. Supported selections include class features,
  subclass features, optional features, feats, items, and creatures.
- Feat selections mirrored into `classFeatChoices` retain subclass ownership so a subclass change
  retracts both the normalized selection and its materialized feat state.
- Unavailable saved references remain visible for recovery but cannot satisfy a current quota.
- Optional-feature variant reconciliation scopes persisted choices against the complete loaded class
  catalog, but activates only choices that remain available after character source filtering.
- Level-down/class removal retracts choices, grants, ASIs, spells, and replacement events owned by
  removed levels.
- Subclass changes remove selections owned by the previous subclass while preserving choices owned
  by the base class. Materialized subclass-feature selections follow the same ownership boundary.

## Spell state

Canonical state lives in `character.spells.spellProfiles`.

- Class profiles use `class:<name>|<source>`; `special:unrestricted` owns bonus/manual spells.
- New selections store `Name|Source`. Equality and quotas use normalized case-insensitive spell
  names so alternate printings remain one logical selection.
- Fixed/always-prepared metadata is derived into profiles and protected by the mutation hook.
- Shared Spellcasting and Pact Magic use independent persisted usage maps.
- Slot maxima are derived from parsed class tables; usage is preserved and clamped when maxima fall.
- Class-page level choices and replacements update profile state, provenance, and replacement
  history atomically through spell commands.
- Replacement eligibility uses the character's current class spell access, while opportunities
  remain owned by the class level that granted them for safe rollback.

`useSpellSlots` is read-only. `useSpellProfileMutations` owns Spells-page writes.
`useSpellProvenanceMutations` exposes only class-page per-level selection/replacement adapters.

## Proficiencies and equipment

`character.proficiencies` is the canonical list model. Expertise must be a subset of skill
proficiency; `reconcileSkillExpertise()` removes invalid expertise.

Starting-equipment option keys and concrete generic-item choices are stored separately. Inventory
and equipment provenance change through the same equipment command. Derived AC and capacity read
equipped state; they are not copied into equipment records.
Armor proficiency and body-armor/shield slot checks share one pure policy. Re-enabling equipment
restrictions from either page applies the rule and unequips invalid armor in one character patch.

Inventory weapon properties preserve 5etools references as abbreviations or source-qualified
`{ uid, note }` records. Display surfaces resolve full names from the parsed item-property lookup;
the structured form retains item-specific notes without changing existing saved abbreviations.

## Character transfers

`characterTransfer.ts` owns copy/import/export policy. Duplicate deep-clones the complete saved
record and changes only ID, collision-free name, and timestamps. `.tbc` export contains one complete
current character; `.tbclib` is a versioned JSON envelope of complete saved characters for selected
or entire-library backups. Import accepts multiple `.tbc`/JSON files or a `.tbclib` backup, validates
each character through the store's compatibility path, and retains valid entries when others fail.
  The store resolves ID and name collisions against the latest library state. Saved
source-qualified choices and portraits remain in each record even if the current catalog lacks their
content. `importCharacters()` validates the prepared batch and awaits one durable library write;
on a write failure it leaves the prior library intact before the import result is reported.

## Schema compatibility

The runtime supports exactly `CURRENT_CHARACTER_SCHEMA_VERSION`. Pre-release character formats
are not carried forward through breaking changes while preparing for 1.0. Older or newer versions
are rejected before strict validation; the cutoff performs no conversion or ownership inference.
Current output is normalized by `characterPersistenceSchema` before persistence.

Variant rules accept only the current settings: optional class features, average hit points,
ability-score method, any-race subclasses, newer-printing preference, and equipment restrictions.
Discontinued subclass-specific flags and unknown settings are rejected, including objects mixed
with current settings; they are not converted or silently discarded. Current optional defaults
are unchanged, and unsupported library records retain their original exportable contents.

Schema 8 requires independent ordinary/bonus feat setup ownership and a complete relation between
saved options, owned benefits and materialized proficiencies/spells. One printing may appear once in
each collection; duplicate printings in one collection, unqualified setup tags, orphan ownership and
missing/contradictory benefits reject without loaded rules. Schema 7's shared selected-copy owner
cannot establish this relation by relabeling its version; recreate those prerelease characters.
See [feat ownership](provenance.md#feat-setup-ownership) for the command contract.

Configured racial/background feat choices also require a saved printing, and their setup benefit
tags must address exactly one qualified configured reference. Unconfigured name-only choices stay
removable but cannot borrow catalog setup; explicitly reselect a printing to configure them.

The active source-qualified racial owner set remains required: the selected parent and optional
child. Every racial provenance tag and choice belongs to that selection; a child requires a parent.
Racial ability choices use canonical encoded full owner references and dense numeric block ordinals
within each represented owner. Array order does not change block identity; integer amounts are
explicit, and selections/status agree with the bounded saved player slots. Ambiguous or incoherent
records are rejected rather than repaired. Schema 4 did not validate those block associations.
Revised (2024) origin saves contain no racial ability grants or choice blocks; independent
background, class and manual ability ownership remains supported.
Racial spell profiles persist player suite/ability/target setup and a typed current applied snapshot.
The snapshot records exact parent/child context, actual granting owner, mandatory/alternative mode,
selected suite, currently eligible descriptors and fixed target printing/kind. The live alternative
catalog and future grant schedule are derived from parsed rules and are not stored as a second
rules engine. Class/special profiles cannot carry racial choices, context or ability-option metadata.

Catalog-independent admission checks the complete relation in both directions: every applied target
has matching materialization and exact selected suite/descriptor ownership, and every racial spell
tag belongs to that relation exactly once. Repeated fixed schedules may share one suite/target tag;
different owners, descriptors and target printings keep separate tags. Labels and casing cannot
create a second copy of the same ownership. Every saved native target has exactly two nonempty
`name|source` fields, without display markup or casting modifiers. Case and surrounding whitespace
still normalize for comparison. Foreign contexts/owners, duplicate structural IDs, unselected suite
grants, wrong kind/printing, missing or extra materialization, out-of-pool targets and logical
quota violations reject. Independent fixed, descriptor, class/feat/manual overlaps remain valid.
Structural IDs validate scope; they never supply missing game rules.

Available-rule refresh and intentional edits commit materialization and provenance atomically.
Missing either exact context reference retains the whole snapshot, including through level changes;
restoration evaluates the current live rules and resets incompatible structural setup. Alternative
suite and descriptor Clear work from saved membership without missing-data inference. Shared/Pact
usage and independent preparation remain mutable and retain their existing shapes.

Matching current-format saves are supported regardless of age, and new 2014/2024 characters are both
supported. Schema 2–7 characters must be recreated; merely relabeling a version cannot establish
native ownership. Incompatible originals remain untouched in durable quarantine and exportable
through hydration, rejected imports in either order, retry and later successful library writes.
There are no prerelease converters, flattened-profile adapters or age-based rejection.

For a breaking change, update together:

1. version constant;
2. `Character` type and strict schema;
3. `createEmptyCharacter` and fixtures;
4. current exported fixtures and a documented compatibility cutoff;
5. persistence/import/rejection and original-export recovery tests.

Do not add pre-release migrations, downgrade paths or compatibility mirrors in feature code.
Newer, malformed, and unsafe records go to the durable exportable quarantine until acknowledged.
Announce a deliberate compatibility cutoff with the change and retain export-before-removal recovery.

## Checklist for new state

1. Decide whether it is truly stored or derived.
2. Choose the owning command/store API.
3. Define defaults and strict validation if persisted.
4. Define provenance and reversal behavior if it grants anything.
5. Test success, replacement/removal, persistence, and failure/rollback where relevant.
