# Data Flow

This document describes application-wide sequences. Domain details belong in the linked topic
guides and code, not duplicated here.

## Startup and game data

Entry points: `src/main.tsx`, `useDataInit`, `gameDataStore`, `dataLoader`, `dataCache`.

1. Persisted preferences and lightweight game-data configuration hydrate from IndexedDB. The
   immutable bundled SRD is the base source; an authorized local directory or remote HTTPS root can
   be configured as one additional-content source.
2. Theme bootstrap data is applied from local storage before React paints, then reconciled with
   hydrated preferences.
3. `useDataInit` waits for hydration and chooses cache, foreground load, or source configuration.
4. A usable cache starts the app immediately. Stale data refreshes in the background.
5. Each configured source is fetched, validated, parsed, and normalized independently. Parsed
   collections are composed by canonical identity and lookups are rebuilt from the result.
6. A successful complete composition replaces memory/cache atomically. Failed or superseded loads
   do not.

The bundled manifest is read through a fixed Electron capability. Packaged builds admit only a
manifest marked `approved-for-distribution`. Unpackaged development builds may use the ignored
`.tmp/srd-review` snapshot so the bundled workflow can be tested before provenance approval; this
path is never packaged. Bundled cache entries are immutable for their pack version and are never
background-refreshed. “Remove Additional Content” loads and validates the admitted bundled catalog
before removing the saved external connection; failure keeps the existing data, cache, and external
configuration while exposing a diagnostic. The rebuild is atomic and never makes the application
content-free.

After the first successful bundled load, a one-time welcome confirms that SRD 5.1 and 5.2.1 are
available offline. Continuing requires no source setup; “Add Additional Content” opens the existing
external-source controls and explains that user-supplied content expands the bundled catalog. A Back
action returns to the Included SRD introduction without dismissing or acknowledging it. When
external content is active, “Change Additional Content” opens the same chooser and offers “Remove
Additional Content” alongside online and local options; the action is not shown as a separate
active-state action. The Included SRD summary shows its SRD document versions, supported character
rules, and offline availability rather than internal pack or cache status.

Bundled transport and version-aware cache identity are implemented. While the generated pack has
`provenance-review-required` status, bundled-first startup is available only in unpackaged
development after `npm run review:srd`; existing local/remote startup remains the packaged release
behavior until the reviewed pack is committed and included in release resources.

`lastUpdateCheckAt` advances after a successful check. `lastDataChangedAt` advances only when the
composed content fingerprint changes. Layered cache identity includes both the bundled pack and the
external source, so either source changing invalidates the effective catalog. The cache records a
separate normalized-content fingerprint and entity count for each successfully loaded layer.
Background refreshes never replace a more complete catalog with partial or empty data, and an added
class with unresolved required feature or choice references is rejected before cache replacement.

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

Character Rules owns ruleset metadata, advancement, and options. Additional Content owns allowed
source books and the newer-printing preference. Its stable route remains `/sources`.

- The character's PHB/XPHB rules source is implicit.
- Filtering affects selection catalogs; exact raw fallback keeps existing saved references
  explainable.
- Removing sources prunes affected spells through the owning command and reports other conflicts for
  review rather than silently rewriting choices.
- Core player potions and scrolls may be admitted from ruleset DMG records without enabling that
  entire book.
- Bundled SRD provenance sources such as DMG, MM, XDMG, and XMM are not selectable books. Public
  SRD items matching the character's ruleset remain available without enabling those sources.
- Source-selection surfaces explain that the bundled SRD has no additional sourcebooks to enable
  and direct users to Settings → Game Data when they want to add compatible 5etools data. Their
  selected-source count is hidden because the bundled provenance sources are not user choices.

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
