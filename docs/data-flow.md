# Data Flow

This document describes application-wide sequences. Domain details belong in the linked topic
guides and code, not duplicated here.

## Startup and game data

Entry points: `src/main.tsx`, `useDataInit`, `gameDataStore`, `dataLoader`, `dataCache`.

1. Persisted preferences and lightweight game-data configuration hydrate from IndexedDB. A source
   can be the immutable bundled SRD pack, an authorized local directory, or a remote HTTPS root.
2. Theme bootstrap data is applied from local storage before React paints, then reconciled with
   hydrated preferences.
3. `useDataInit` waits for hydration and chooses cache, foreground load, or source configuration.
4. A usable cache starts the app immediately. Stale data refreshes in the background.
5. The loader fetches, validates, parses, normalizes, and indexes the configured source.
6. A successful complete result replaces memory/cache atomically. Failed or superseded loads do not.

The bundled manifest is read through a fixed Electron capability. Packaged builds admit only a
manifest marked `approved-for-distribution`. Unpackaged development builds may use the ignored
`.tmp/srd-review` snapshot so the bundled workflow can be tested before provenance approval; this
path is never packaged. Bundled cache entries are immutable for their pack version and are never
background-refreshed. “Restore bundled SRD” loads and validates the admitted catalog before
replacing an external source; failure keeps the existing data, cache, and external configuration
while exposing a diagnostic. For an active bundled source, the same action rebuilds parsed data
without first making the application content-free.

After the first successful bundled load, a one-time welcome confirms that SRD 5.1 and 5.2.1 are
available offline. Continuing requires no source setup; “Add More Content” opens the existing
external-source controls and explains that user-supplied content replaces the bundled catalog.

Bundled transport and version-aware cache identity are implemented. While the generated pack has
`provenance-review-required` status, bundled-first startup is available only in unpackaged
development after `npm run review:srd`; existing local/remote startup remains the packaged release
behavior until the reviewed pack is committed and included in release resources.

`lastUpdateCheckAt` advances after a successful check. `lastDataChangedAt` advances only when the
parsed content fingerprint changes. Background refreshes never replace a more complete catalog
with partial or empty data.

## Character draft and save

Entry point: `src/store/characterStore.ts`.

1. Startup has no active character.
2. Selecting a character copies its saved snapshot into `activeCharacter`.
3. Hooks derive current UI values from the draft and parsed game data.
4. User edits call a store mutation and mark the draft dirty.
5. `saveActiveCharacter()` stages one draft revision and awaits IndexedDB persistence.
6. Success clears dirty state only if that revision is still current. Failure restores the prior
   saved snapshot while keeping the draft available for retry.

Edits made while a save is pending remain dirty. Electron receives the unsaved-state signal and
confirms before closing. Preferences and layout state do not participate in character dirty state.

## Domain mutation

Race, class, background, feat, spell, and equipment changes follow one pattern:

1. A page/controller gathers the chosen values and source-qualified game entities.
2. A pure command reconciles the previous owner and returns a character patch plus provenance.
3. The hook commits both in one character-store update.
4. Derived views recompute from the updated draft.

Initial character creation uses the same commands through `buildInitialCharacter`. Materialized
grants and attribution must never be written as separate user-visible steps.

## Derived character values

`CharacterCalculationContext` resolves exact saved entity identities and composes effective values.
Ability scores are applied in this order:

1. persisted allocated scores;
2. ruleset origin bonuses (2014 race/subrace or 2024 background);
3. class ASIs;
4. feat-option provenance;
5. active typed effects;
6. explicit exact overrides where supported.

HP reads class/level/Constitution, recorded raw hit-die gains, adjustments/effects, and an optional
override. AC reads equipped armor/Dexterity, adjustments/effects, and an optional override. PDF,
header, Builder, prerequisites, and readiness consume the same calculation boundary.

## Rules and source settings

Character Rules owns ruleset metadata, advancement, and options. Sources owns allowed source books
and newer-printing preference.

- The character's PHB/XPHB rules source is implicit.
- Filtering affects selection catalogs; exact raw fallback keeps existing saved references
  explainable.
- Removing sources prunes affected spells through the owning command and reports other conflicts for
  review rather than silently rewriting choices.
- Core player potions and scrolls may be admitted from ruleset DMG records without enabling that
  entire book.

The creation wizard uses `useWizardGameData`; edit pages use `useFilteredGameData`. Neither reads
raw game-data collections directly.

## Rules content and previews

1. `GameContent` receives a structured 5etools entry.
2. The renderer converts supported tags/content to sanitized interactive markup.
3. A shared cached recursive lookup resolves source-aware references.
4. `RulesPreviewManager` owns one preview chain, including pinned and transient cards.

Static exports and compact summaries may use `renderEntry`/`renderEntryCached`. Interactive pages
must not render raw 5etools syntax or build independent tooltip systems.

## Character format compatibility

On import or hydration:

1. Read `schemaVersion`.
2. Apply supported pure migrations sequentially.
3. Validate against the strict current schema.
4. Expose only the current shape to runtime code.
5. Quarantine newer, malformed, or safely unmigratable originals.

Quarantined records stay durable until the user acknowledges the compatibility dialog and can be
exported as `.tbc` files first. See [State Management](state-management.md) for the version policy.

## Auto-update

`electron/updateManager.ts` owns checks, download, cancellation, and install IPC. Automatic checks
run after startup and on the configured interval when enabled. Renderer notifications offer the
download; completed installers use the update modal before relaunch. Portable builds do not
auto-install. Scheduled failures remain quiet, while manual checks report connection errors.

Release creation remains a manual workflow; see [CI/CD Workflow](cicd-workflow.md).

## Invariants

- Cache replacement, domain mutations, and saves are atomic at their defined boundary.
- Superseded async work cannot commit stale state or progress.
- Mutable runtime state is persisted; pure projections are recomputed.
- Exact source identity is preserved through filtering and persistence.
- UI layers consume shared commands, calculations, renderers, and data hooks instead of parallel
  implementations.
