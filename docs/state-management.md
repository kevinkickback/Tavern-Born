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

The exact-context `racialDefenses` snapshot retains current fixed grants and their field owners for
unavailable rules. It contains no dormant parent rules or independent grants. Effective defenses
compose typed effects using the [racial defense contract](provenance.md#racial-defenses).

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
  subclass features, optional features, feats, items, creatures, and named proficiencies.
- Source-backed proficiency choices bind the actual owner, complete granting feature, domain and
  earned level. The saved intent and its applied provenance are structurally validated together;
  current filtered rules and named vocabulary determine effective benefits. Read-only source
  refreshes suspend and restore owned expertise/languages without changing saved intent. Skills,
  languages, Review and PDF use the same calculation character and effective provenance. See
  [Canny's bounded contract](contracts/feature-references.md#canny-proficiencies).
- Class/subclass feature options retain their complete 5etools UID in `ref`, separately from the
  actual granting owner. Normalization, option keys, persistence and exact resolution share that
  identity. Missing target rules retain the intent without borrowing a same-named feature.
  Materialized feature IDs use owner plus target rather than the first granting choice; action
  grouping and missing/restored behavior follow [the provenance contract](provenance.md#automatic-feature-actions).
- Feat selections mirrored into `classFeatChoices` retain subclass ownership so a subclass change
  retracts both the normalized selection and its materialized feat state.
- Unavailable saved references remain visible for recovery but cannot satisfy a current quota.
- Optional-feature variant reconciliation scopes persisted choices against the complete loaded class
  catalog, but activates only choices that remain available after character source filtering.
- Level-down/class removal retracts choices, grants, ASIs and numeric spell choices owned by removed levels.
- Subclass changes remove selections owned by the previous subclass while preserving choices owned
  by the base class. Materialized subclass-feature selections follow the same ownership boundary.

## Spell state

Numeric class spell intent lives in `character.managedClassSpellChoices`; its materialization and
independent daily/racial/Bonus state use `character.spells.spellProfiles`.

- Class profiles use `class:<name>|<source>`; `special:unrestricted` owns bonus/manual spells.
- Catalog selections store `Name|Source`. Saved targets compare normalized name and source;
  an admitted bare manual name has its own empty-source identity. New-choice rules may separately
  lock logical spell names across profiles or printings without merging saved targets or owners.
- Fixed/always-prepared metadata is derived into profiles and protected by the mutation hook.
- Shared Spellcasting and Pact Magic use independent persisted usage maps.
- Slot maxima are derived from parsed class tables; usage is preserved and clamped when maxima fall.
- Class-page Finish validates every addressed slot against the latest saved base and commits the
  choice collection, monotonic allocator, materialized profiles and provenance atomically.
- Saved daily prepared arrays remain intent through unrelated writes and source changes. Their
  effective view requires current exact class/declaration/target/list and own-level access.
- `createCharacterCalculationContext` derives current spell knowledge before guarded feature
  closure, then effective abilities and learned preparation capacity. Its character and matching
  provenance feed Class, Spells, readiness, prerequisites, Actions, Review and PDF.

`useSpellSlots` is read-only. `useSpellProfileMutations` owns Spells-page writes.
`useSpellProvenanceMutations` exposes the addressed batch Finish adapter. Clear and preparation
withdrawal work without unavailable sources; source suspension preserves ownership and revisions.
Rest/acquisition event history remains separate work. See [the full spell contract](contracts/spell-selection.md).

Each normalized target occurs once in `special:unrestricted`, in either cantrips or known spells.
Available exact spell metadata determines its current kind for all special owners together. Pure
views use that projection; active catalog corrections use acknowledged reconciliation and preserve
dirty drafts until explicit Save. Missing exact data retains the saved kind. Bare-name manual values
remain unresolved and never borrow a printing or kind from a catalog. Class and racial profiles
retain independent memberships, including conflicting saved kinds when exact metadata is absent.

## Proficiencies and equipment

See [Equipment state](contracts/equipment-state.md#proficiencies-and-equipment) for canonical
proficiencies, slot ownership, raw-rule absence and physical snapshots.

## Fixed weapon bonuses

See [Fixed weapon bonuses](contracts/equipment-state.md#fixed-weapon-bonuses) for numeric fields,
conditional-item exclusions, attunement and shared Action/Review/PDF projection.

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

Current pre-release admission accepts exactly character format **12**, validates complete ownership
without loaded rules, and rejects incompatible/malformed records without conversion. Existing
originals stay in durable exportable quarantine until acknowledged. See [Character format](contracts/character-format.md)
for the full current admission and breaking-change checklist. Catalog cache schema is independent.

**Release requirement:** no pre-v1 characters need preservation or a migration project. Existing
generic recovery stays. Before v1.0 ships, freeze its format; later 1.x updates must preserve released
v1.x characters through compatible changes or an explicitly designed and reviewed upgrade path.
That promise is a release requirement; the current strict-version gate does not implement it yet.

## Checklist for new state

1. Decide whether it is truly stored or derived.
2. Choose the owning command/store API.
3. Define defaults and strict validation if persisted.
4. Define provenance and reversal behavior if it grants anything.
5. Test success, replacement/removal, persistence, and failure/rollback where relevant.
