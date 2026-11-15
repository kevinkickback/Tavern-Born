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
`dataCache.ts`. The secondary workspace sidebar is an app preference and defaults to open.
Individual accordion and pane collapse preferences use local storage. Electron stores native
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

Filtered views and calculation contexts are reused while the source settings, game-data object and character object are unchanged. Replace the affected object on a store write so derived results are recalculated.

`CharacterCalculationContext` is the pure shared boundary for resolved race/subrace, background,
classes/subclasses, feats, equipment, rules metadata, typed effects, and effective ability scores.
React consumers use `useCharacterCalculationContext`.

Effective ability scores compose allocated scores, origin bonuses, class ASIs, feat choices, active
effects, then supported exact overrides. Each layer produces a fresh value. Readiness may inspect
allocated scores directly when validating allocation; ordinary UI/export code may not.

HP and AC management display calculation traces but do not own class or equipment mutations.
Carrying capacity, prerequisites, Review, actions, and PDFs consume the same effective values.

Draconic Resilience requires the current native subclass's gain level, selected intro, and exact
nested feature. Class layering retains the intro from the layer that supplied the selected subclass.
The 2014 Draconic Bloodline gains the effect at Sorcerer level 1 and the 2024 Draconic Sorcery
gains it at Sorcerer level 3. Both add the current Sorcerer level to maximum HP once earned.
Without body armor, their alternate AC bases are 13 + Dexterity modifier and 10 + Dexterity
modifier + Charisma modifier, respectively. The equipped shield contributes once. The calculation
chooses the highest eligible base before applying adjustments and exact overrides. The effects
derive from current data, so source withdrawal or a level or subclass change can remove them while
saved HP and AC settings remain independent.

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
- Complete target UIDs remain separate from actual granting owners; missing rules retain intent
  without borrowing names. [Class ownership](provenance.md#class-ownership) and
  [feature references](data-ingestion.md#feature-references) own current authority, suspension, restoration
  and derived feature/proficiency/action rules.
- Feat selections mirrored into `classFeatChoices` retain subclass ownership so a subclass change
  retracts both the normalized selection and its materialized feat state.
- Unavailable saved references remain visible for recovery but cannot satisfy a current quota.
- The EFA Armorer earns a separate Armor Replication plan at level 9. Its Armor plan must be
  distinct from the Artificer's other plans. The historical editor uses the level-9 plan tier. The
  sheet lists the plan with the subclass feature and shows the additional active-item slot as Armor only.
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
Rest/acquisition event history remains separate work. See [the full spell contract](spell-selection.md).

Each normalized target occurs once in `special:unrestricted`, in either cantrips or known spells.
Available exact spell metadata determines its current kind for all special owners together. Pure
views use that projection; active catalog corrections use acknowledged reconciliation and preserve
dirty drafts until explicit Save. Missing exact data retains the saved kind. Bare-name manual values
remain unresolved and never borrow a printing or kind from a catalog. Class and racial profiles
retain independent memberships, including conflicting saved kinds when exact metadata is absent.

## Proficiencies and equipment

See [Equipment state](equipment.md#proficiencies-and-equipment) for canonical
proficiencies, slot ownership, raw-rule absence and physical snapshots.

## Fixed weapon bonuses

See [Fixed weapon bonuses](equipment.md#fixed-weapon-bonuses) for numeric fields,
conditional-item exclusions, attunement and shared Action/Review/PDF projection.

## Character transfers

`characterTransfer.ts` owns copy/import/export policy. Duplicate deep-clones the complete saved
record and changes only ID, collision-free name, and timestamps. `.tbc` export contains one complete
current character; `.tbclib` is a versioned JSON envelope of complete saved characters for selected
or entire-library backups. On desktop, both export actions confirm success after the save dialog
and file write complete. The browser download path cannot observe completion. Import accepts
multiple `.tbc`/JSON files or a `.tbclib` backup, validates
each character through the store's compatibility path, and retains valid entries when others fail.
  The store resolves ID and name collisions against the latest library state. Saved
source-qualified choices and portraits remain in each record even if the current catalog lacks their
content. `importCharacters()` validates the prepared batch and awaits one durable library write;
on a write failure it leaves the prior library intact before the import result is reported.

## Schema compatibility

Current pre-release admission accepts exactly character format **15**, validates complete ownership
without loaded rules, and rejects incompatible/malformed records without conversion. Existing
originals stay in durable exportable quarantine until acknowledged. The recovery dialog downloads
one original as a `.tbc` file or all affected originals in one `.tbclib` file, preserving their JSON
fields. Recovery downloads can exceed the 250 MB limit for ordinary library exports and imports.
Extract each record from the `characters` array of an oversized backup into its own `.tbc` file
for individual recovery. An export failure leaves the originals available.
The [strict schema](../src/types/characterSchema.ts) checks selections, materialized rows and grant owners in both directions before catalog data loads. An unavailable choice may retain intent without a materialized row or tag. If either is present, both must agree. Current catalog eligibility is checked separately.

A breaking change updates the version, schema, empty character, fixtures and recovery checks together. Keep rejected originals exportable until acknowledged. Catalog cache schema is independent.

**Release requirement:** no pre-v1 characters need preservation or a migration project. Existing
generic recovery stays. Before v1.0 ships, freeze its format; later 1.x updates must preserve released
v1.x characters through compatible changes or an explicitly designed and reviewed upgrade path.
That promise is a release requirement; the current strict-version gate does not implement it yet.

The character format version is independent of the 2014 or 2024 game ruleset. Creator selects the
ruleset before saving a character. A saved character can change its enabled sources within that
edition. Catalog refresh and rollback preserve exact saved background and equipment references.
Select the same exact background again to apply refreshed fixed proficiencies and origin feats
while keeping its package selections and independent grants. Current background ability rules
determine which saved selections contribute bonuses.

## Checklist for new state

1. Decide whether it is truly stored or derived.
2. Choose the owning command/store API.
3. Define defaults and strict validation if persisted.
4. Define provenance and reversal behavior if it grants anything.
5. Test success, replacement/removal, persistence, and failure/rollback where relevant.
