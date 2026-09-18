# Data Flow

This document maps the major runtime flows in Tavern-Born.

## 1) Startup Initialization and Cache Selection

Entry points:
- src/main.tsx
- src/App.tsx
- src/hooks/data/useDataInit.ts

Flow:
1. App mounts and calls useDataInit().
2. Hook waits for gameDataStore hydration from IndexedDB (hasHydrated).
3. Hook calls gameDataStore.loadFromCache(), which owns all cache-read decision logic.
4. Decision branch (inside loadFromCache):
- No cache and no source: set cacheStatus to unconfigured.
- Cache and source, same source, fresh cache: serve cache immediately and run a background source verification check.
- Cache and source, same source, stale cache: serve cache and trigger background refresh silently (no toast).
- Cache and source, different source: fetch fresh and replace cache.
- Cache without source: serve offline cache — returns { needsToast: 'offline' }.
- Source without cache: fetch fresh.
5. useDataInit shows a toast when cached data is used without a configured source, or when enabled launch auto-refresh confirms that content changed. Successful no-change checks remain silent.
6. On successful fetch, parsed gameData is written to cache and store.

Resource failures are classified by whether they affect the canonical gameplay catalog. Foreground
loads reject and preserve the previous store/cache when any required resource fails; optional
presentation resources such as fluff may be absent without blocking a usable load. Background
refreshes remain stricter and reject any dropped resource so an existing complete cache is never
silently replaced by a less complete snapshot.

Startup preference behavior:
- Theme is applied immediately from localStorage before React renders, then reconciled with the persisted app preferences store after IndexedDB hydration.
- Home-page card size is read from the app preferences store. The size slider is on the home page itself, not in Settings.
- Stale cache always triggers a background refresh on startup. It remains silent unless launch auto-refresh is enabled and the content fingerprint changes.
- Background refreshes are atomic: if any requested resource fails or the refresh returns an empty catalog, the current in-memory/cache data and update timestamps are preserved.
- Foreground loads are atomic for required catalog resources; optional presentation failures are
  reported but do not prevent a usable catalog from being cached.

Update metadata behavior:
- `lastUpdateCheckAt` is set only after a successful source check/fetch.
- Cache entries store `lastDataChangedAt`, which advances only when fetched parsed data differs from the previous cached content for the same source.
- When a successful check finds no content changes, only `lastUpdateCheckAt` advances; `lastDataChangedAt` remains unchanged.

## 2) Game Data Ingestion Pipeline

Entry points:
- src/store/gameDataStore.ts (loadGameData)
- src/lib/5etools/dataLoader.ts

Flow:
1. loadGameData starts foreground or background mode.
2. Loader reads required resources (books, races, classes, spells, feats, items, and others).
3. Parsed arrays are produced by parser functions in src/lib/5etools/parsers/* (barrel export: src/lib/5etools/parsers/index.ts).
4. Source list is built and lookup maps are created in src/lib/5etools/lookups.ts.
5. Store state is updated and cache metadata set to fetched.

Each load receives a monotonically increasing request identity. Final results, failures, and progress
updates from superseded requests are ignored, including local reads that cannot be cancelled by the
shared `AbortController`.

Important behavior:
- Class index handling differs from spell index behavior; class index keys are slugs, not sources.
- Composite key lookups use name|source and are expected by downstream hooks.
- Game data loads are cancellation-aware: a new load aborts any in-flight request, and stale responses are ignored via request-id guards.
- Remote ingestion now fails fast when no top-level resources can be fetched at all, instead of returning an empty dataset.

## 3) Character Edit and Save Lifecycle

Entry points:
- src/store/characterStore.ts
- src/hooks/character/*
- src/pages/build/* and feature pages

Flow:
1. App starts with no active character selected.
2. User activates a character, which hydrates activeCharacter from characters by id.
3. UI hooks derive display and computed values from activeCharacter.
4. Edits call updateCharacter(id, patch).
5. If id is activeCharacter, patch applies to in-memory draft.
6. `saveActiveCharacter()` stages the current draft revision in the characters array while keeping
   the unsaved guard active.
7. Persist middleware writes that snapshot to IndexedDB; the returned promise is the durability
   boundary.
8. Success marks only that unchanged draft revision clean. Failure restores the prior saved snapshot,
   keeps the draft dirty, and lets the UI offer a retry.

Validation behavior:
- Imported files are validated with full character-shape checks before addCharacter.
- Character store mutations apply minimal structural coercion and then validate against `characterPersistenceSchema`; payloads missing required canonical fields such as `proficiencies.skills` are rejected.
- Rehydrated characters from IndexedDB are validated and normalized. Unsupported-version and
  malformed current-version records move into a persisted quarantine until the user acknowledges
  the compatibility dialog.
- Spell payloads are additionally checked against spellSelectionSchema for structural integrity.

Unsaved changes behavior:
- src/main.tsx syncs hasUnsavedChanges into Electron.
- electron/main.ts blocks close with a confirmation dialog when unsaved changes exist.
- Pending and rejected saves continue to report unsaved changes; an edit made during Save is not
  acknowledged by the earlier write.
- App preference changes do not flow through the character store and therefore never mark a character dirty.

## 3a) Hit Point Advancement and Management

Entry points:
- src/components/modals/LevelUpModal.tsx
- src/lib/character/commands/classCommands.ts (`applyLevelUp`)
- src/hooks/character/useHitPoints.ts
- src/components/modals/HitPointsModal.tsx

Level-up flow:
1. With Average Hit Points enabled, the level-up modal commits the class's fixed average automatically.
2. With it disabled, the modal requires the player to roll the displayed hit die or enter a valid result manually.
3. `applyLevelUp()` validates the class/level relationship and records the raw die result, die size, method, and class identity with the progression update.
4. Maximum HP is recalculated from current class progression and Constitution whenever it is read, so later Constitution changes affect every level without rewriting the gain history.
5. Removing a level prunes gain records outside the retained progression.

Header management flow:
1. The header heart opens `HitPointsModal` with the character's actual current and temporary HP. An uninitialized current HP value begins from the effective maximum.
2. The player may edit current/temp HP and add labeled flat or per-level maximum-HP bonuses or penalties. Negative adjustments are valid.
3. An optional exact maximum overrides calculation and adjustments without deleting them.
4. `useHitPoints().saveHitPointSettings()` applies the complete settings patch in one character-store mutation.

Effective maximum HP resolves in this order: class/Constitution calculation, lasting adjustments, exact override.

## 3b) Armor Class Management

Entry points:
- src/components/modals/ArmorClassModal.tsx
- src/hooks/character/useArmorClass.ts
- src/lib/calculations/armorClass.ts

Flow:
1. The header shield opens `ArmorClassModal` with the live effective AC.
2. Base AC is calculated from equipped armor/shields and Dexterity.
3. Labeled lasting bonuses or penalties are applied to the calculated base.
4. An optional exact override takes final precedence without deleting saved adjustments.
5. The modal saves adjustments and the optional override atomically.

All UI and PDF reads must use `computeEffectiveCharacterArmorClass()` or `useArmorClass()`.

## 3c) Per-Character Rules and Sources

Entry points:
- src/pages/rules/RulesPage.tsx
- src/pages/rules/SourcesPage.tsx
- src/pages/rules/SourcesPanel.tsx
- src/hooks/data/useFilteredGameData.ts

Flow:
1. Character-scoped Rules is the top-level configuration workspace after Builder and before
   Character Sheet. Its navigation contains separate Character Rules and Sources pages. Character
   Rules contains Ruleset, Advancement, and Character Options tabs. The workspace remains protected
   until a character is active. Manual Actions & Effects lives in Builder's Details group.
2. Rules edits patch `character.variantRules`; the selected `originSystem` is displayed but cannot be changed because switching it would require rebuilding origin and progression choices.
3. Source edits patch `character.allowedSources`. The character's implicit PHB/XPHB ruleset source remains included in the effective filter.
4. The Prefer Newer Printings control patches `variantRules.preferNewerPrintings` and changes the source-page warning to explain the active filtering behavior.
5. Removing sources or applying a preset prunes spells from disabled sources and warns the player; other existing source conflicts are surfaced for review.
6. Shared filtered-data hooks apply the current source and reprint settings to character-scoped selection surfaces.

Existing choices are preserved when rules change. Pages warn the player to review the affected Builder area rather than silently removing prior choices.

## 3d) Desktop Window State Restore

Entry points:
- electron/main.ts
- electron/windowState.ts

Flow:
1. Electron startup reads saved bounds from a JSON file under the app user-data directory.
2. Saved bounds are validated against current display work areas.
3. If the saved position is off-screen, the app falls back to default placement while preserving the last usable size.
4. Move/resize/close events write updated bounds back to disk.
5. Maximized state is restored after the BrowserWindow is created.

Production window hardening:
- The native application/window menu is removed, so Alt cannot reveal a hidden menu bar.
- DevTools are disabled in `webPreferences`; common DevTools shortcuts are blocked and any programmatic DevTools open is immediately closed.
- Development builds retain the menu and DevTools behavior.

## 4) Provenance Application and Reconciliation

Entry points:
- src/lib/character/commands/*
- src/lib/provenance/apply*.ts
- src/lib/provenance/reconciliation.ts
- src/lib/provenance/ledger.ts

Flow:
1. Selection changes invoke a complete pure domain command.
2. Race/background commands normalize selected content against `character.originSystem` before origin grants are applied.
3. Commands reconcile the old source, update materialized fields, and produce the updated provenance ledger.
4. Hook adapters apply `characterPatch` and `provenanceUpdate` atomically through the character store.
5. Initial character creation composes the same race, class, and background commands through `buildInitialCharacter`.
6. Manual equipment, class equipment choices, and optional-feature replacements follow the same command-result contract; callers never sequence materialized and provenance writes.

Background equipment detail:
- Background starting equipment is resolved from 5etools `startingEquipment` blocks using persisted per-block choice keys (`backgroundEquipmentChoices`, an array of lowercase keys like `['a', 'b']`).
- The resolver applies both materialized items and numeric currency grants found in the same entries (`value` and `containsValue`).
- On background change (or option swap), previously granted background currency is removed first, then the new grant is applied.

## 5) Content Rendering Flow

Entry points:
- src/lib/renderer.ts
- src/lib/entryRenderCache.ts
- src/components/editor/GameContent.tsx
- src/components/editor/RenderedEntryWithTooltip.tsx

Flow:
1. Full user-facing rules text passes 5etools entries to `GameContent`, the canonical React surface.
2. `GameContent` obtains the shared cached recursive lookup and delegates rendering and interaction
   to `RenderedEntryWithTooltip`.
3. The lower-level renderer recursively formats structured content and inline tags, then sanitizes
   the resulting HTML before display.
4. Explicitly static contexts such as PDFs, text projections, and compact non-interactive summaries
   call `renderEntry` or `renderEntryCached` directly.

Tooltip note:
- `useRecursiveLookup()` supplies source-aware entity resolution for inline references.
- Lookup construction is cached by the immutable game-data object, so multiple `GameContent`
  instances share one set of maps. Loaded trap/hazard, reward, class-feature, subclass, and
  subclass-feature records participate alongside spells, items, feats, races, classes,
  backgrounds, optional features, actions, conditions, deities, skills, senses, variant rules, and
  languages. Parent class/subclass identity disambiguates feature names that collide within a source.
- Generated inline references are focusable and expose button/dialog semantics. Hover or focus opens
  a preview, Enter/Space pins it, and Escape closes it and restores focus to the reference.
- Rich text inside an open tooltip can open another tooltip. Each nested reference keeps its parent visible, shares the parent card styling, and uses the same source-aware lookup, allowing the interaction to continue recursively. Dismissal includes a short grace period so the pointer can cross the gap between parent and child previews. The newest card receives the strongest border and elevation, older cards remain fully opaque, active triggers stay highlighted, and ancestor-aware placement uses another side of the spawning window rather than covering the pin or transient context.

## 5a) Source Preset and Reprint Filtering

Entry points:
- src/components/character/wizard/steps/2-RulesStep.tsx
- src/pages/rules/SourcesPanel.tsx
- src/pages/rules/RulesPage.tsx
- src/hooks/data/useFilteredGameData.ts
- src/hooks/data/useWizardGameData.ts
- src/lib/5etools/reprints.ts

Flow:
1. Wizard source presets apply a curated list of source abbreviations to `allowedSources`.
2. `useWizardGameData()` calls `useFilteredGameDataParams()` with draft source/ruleset settings, normalizes nested subraces, and exposes filtered-primary/raw-fallback entity resolvers.
3. Wizard steps receive filtered collections and resolved entities; they do not reproduce source/reprint filtering or read `gameDataStore`.
4. `useFilteredGameData()` filters active-character collections by `allowedSources` for edit pages, including the Equipment add-item catalog.
5. When `variantRules.preferNewerPrintings` is enabled, the shared hooks build a suppression set from 5etools `reprintedAs` metadata.
6. DataFilter removes any entity whose `name|source` key is in the suppression set.
7. Older printings remain available when newer reprints are not in the selected source list.
8. After creation, the Sources page at `/sources` updates `allowedSources` and owns the
   newer-printing preference alongside the Character Rules page in Rules navigation.

Wizard defaults:
- New-character setup defaults `allowedSources` to the `2014-recommended` source preset (filtered to currently loaded sources).
- Basics step defaults portrait selection to the first placeholder portrait.
- Race, Class, and Background steps auto-select the first available `name|source` entry whenever the current selection is empty or filtered out.

Important behavior:
- Reprint suppression is content-driven from parsed 5etools data, not a hardcoded override map.
- Suppression is transitive across reprint chains (A -> B -> C), so selecting C suppresses A and B when present.
- If no source filter is active, data remains unfiltered and suppression is not applied.

## 5b) Condition and Exhaustion Rules

Entry points:
- src/lib/5etools/parsers/basic.ts (`parseConditions`)
- src/hooks/data/useGameData.ts (`useConditions`)
- src/pages/details/ConditionsPage.tsx
- src/components/editor/RenderedEntryWithTooltip.tsx

Flow:
1. Ingestion preserves condition records and their structured entries while tagging condition versus disease records.
2. `useConditions()` returns valid condition records and excludes diseases.
3. The Conditions page prefers records from the character's implicit rules source (`PHB` for 2014 or `XPHB` for 2024), falls back to another loaded printing when needed, and uses one record per condition name.
4. Condition cards render their loaded descriptions and inline references through the shared formatted-text/tooltip path. Clicking anywhere on a card toggles the persisted condition name.
5. Exhaustion uses the loaded ruleset record: PHB table rows are displayed and highlighted cumulatively, while formula-based XPHB text is rendered directly.
6. Only active condition names and the exhaustion level are persisted; rules text remains game data.

## 6) Character Schema Versioning

Entry points:
- src/lib/schema/characterSchemaVersion.ts
- src/store/characterStore.ts

Flow:
1. `Character.schemaVersion` must equal `CURRENT_CHARACTER_SCHEMA_VERSION`.
2. Import and hydration migrate supported older payloads to the current version before strict
   validation. The current schema is the only shape exposed to runtime code or saved again.
3. IndexedDB hydration keeps valid current records and removes newer, malformed, or safely
   unmigratable records from the character list.
4. Rejected records are moved into a persisted quarantine until the Home page requires the user to
   acknowledge their removal. The dialog can export each original record as a `.tbc` backup for
   recovery or use with a compatible older app version. A restart before acknowledgment preserves
   the quarantine and presents the dialog again.

Versioning strategy:
- Increment the integer character schema version for breaking changes such as required fields, removed fields, or restructured data.
- Non-breaking optional additions do not require a version bump.
- Before 1.0, add a pure, sequential migration for each supported older schema rather than branching
  on old shapes throughout the app. Newer files remain unsupported.
- Reassess the full pre-1.0 migration chain at the 1.0 boundary. If the schema has changed
  substantially, the project may intentionally drop that chain instead of carrying disproportionate
  compatibility debt into 1.0; retain export recovery and announce the cutoff in advance.
- Purely derived initiative and saving-throw totals are not persisted. Initiative resolves from the
  effective Dexterity modifier plus active effects; saving throws resolve from effective abilities,
  proficiency ownership, and active effects.

Example breaking change requiring a version bump:
- Adding a required field without a safe default
- Restructuring a nested object that changes how data is accessed
- Removing a field that changes the interpretation of other fields

See docs/contributor-start-here.md for the character-format policy.


## 7) Auto-Update Lifecycle

Entry points:
- electron/updateManager.ts
- electron/main.ts (IPC handler registration)
- src/components/settings/GeneralPanel.tsx
- src/components/updates/ChangelogModal.tsx
- src/components/updates/UpdateProgressModal.tsx

Flow:
1. On app startup (3s delay) and every 24 hours, `updateManager` calls electron-updater's `checkForUpdates()` when auto-update is enabled.
2. Renderer receives `onUpdateAvailable` event and shows an update-available notification.
3. User confirms download; `update:download` IPC triggers the download. `onDownloadProgress` events relay percentage, bytes/sec, and total/transferred to the renderer.
4. When download completes, `onUpdateDownloaded` fires and `UpdateProgressModal` starts a 3-second countdown before calling `update:install`.
5. `electron-updater` quits and relaunches the app to apply the update.
6. User can cancel an in-progress download via `update:cancel`; the modal resets.
7. Changelog data is fetched from GitHub releases API and displayed in `ChangelogModal`.
8. The `autoUpdate` preference is persisted in `appPreferencesStore` and toggled in Settings → General → Updates.

Portable executable behavior:
- In portable mode, auto-install is disabled; users download a new portable archive manually.
- `updateManager` detects portable mode and adjusts behavior accordingly.

Offline behavior:
- Scheduled and manual checks return an explicit connection error when Electron reports no network
  connectivity or the updater fails for a connectivity-related reason.
- Scheduled checks remain quiet because only the Settings manual-check surface subscribes to update
  errors; manual checks can therefore distinguish an offline failure from a confirmed current version.

IPC channels:
- `update:check`, `update:download`, `update:cancel`, `update:install`, `update:status`, `update:set-auto-check`, `update:get-version`, `update:get-current-changelog`

## Data Flow Invariants

- Mutable runtime state is persisted; pure derived values are computed on demand.
- Canonical game values come from parsed data, not ad hoc constants.
- Components should access game data through hooks/stores, not direct data imports.
