# Data Ingestion

The ingestion layer turns a configured 5etools source into stable, source-qualified application
data. UI code consumes parsed results through hooks; it never imports source JSON.

## Pipeline

| Stage | Owner | Contract |
| --- | --- | --- |
| Source validation | `urlUtils.ts`, Electron IPC | Accept authorized local folders or valid HTTPS sources. |
| Resource loading | `dataLoader.ts` | Load known resources with cancellation, timeouts, and bounded concurrency. |
| Validation | `validator.ts`, `schemas.ts` | Reject invalid required shapes; report optional degradation. |
| Parsing/normalization | `parsers/`, rule normalizers | Produce stable application entities and diagnostics. |
| Lookup construction | `lookups.ts` | Build collision-safe `name|source` maps. |
| Filtering/resolution | `filters.ts`, `entityResolvers.ts` | Filter catalogs while preserving exact saved-reference fallback. |
| Cache | `dataCache.ts` | Persist serializable parsed output plus freshness/schema metadata. |

Local reads are capability-scoped to a native-picker root, canonicalized against symlinks, limited
to JSON below that root, and size-limited by Electron. Remote production sources are HTTPS. GitHub
URLs are normalized to a data root; ambiguous slash-containing refs require an explicit `ref`.

## Loading rules

- The loader uses one bounded worker pool (maximum six requests), including expanded class/spell
  indexes. Do not replace it with unbounded `Promise.all`.
- Every load has a request identity and abort signal. Superseded progress, success, and failure are
  ignored.
- Entity files, indexes, and spell-source association data are required. Fluff/presentation data is
  optional.
- Foreground loads reject required failures. Background refresh rejects any dropped resource so it
  cannot replace a more complete cache.
- A remote source with no reachable top-level resources fails instead of producing an empty catalog.
- Parser output and source ordering must be deterministic to avoid cache fingerprint churn.

## Parsing policy

Prefer structure supplied by 5etools. When upstream exposes a rule only as prose, an adapter must
be narrow, ruleset/source-qualified, versioned, diagnostic when uncertain, and overridden by parsed
structured data whenever that becomes available.

Do not:

- edit `data/`;
- put canonical game values in components;
- infer source identity by name alone;
- turn ambiguous prose into a guessed mechanical rule;
- mix persisted compatibility aliases into validation of the current upstream catalog.

Emergency content substitutions live in `sourceFallbacks.ts`; ruleset metadata gaps live in the
explicit ruleset metadata module. Both must be testable and removable.

## Normalized capabilities

The parser layer owns normalization that would otherwise be repeated across pages, including:

- class/subclass feature references, copied subclasses, spellcasting, resources, ritual casting,
  ASIs, and source-owned choice descriptors;
- background origin rules, source-qualified narrative entries, and starting-equipment blocks;
- race versions/lineages, structured traits, and presentation entries;
- conditions versus diseases and structured rules entries;
- item type labels, generic magic variants, mastery definitions, generic equipment candidates;
- feat fixed references and unconditional lasting effects;
- fluff summaries and optional images/sections.

Choice normalizers preserve owner, level, capacity, replacement rule, source filters, and diagnostic
provenance. Unknown choice blocks remain visible as diagnostics instead of becoming invented
options. Optional-feature progression remains the count owner when feature prose repeats the same
choice.

## Identity and entity resolution

Lookup keys are case-normalized `name|source`. Exact resolution checks the filtered primary lookup,
then the exact raw lookup so an existing saved selection remains resolvable after a filter change.
Persisted references without a source are rejected rather than matched to the first printing.

Downstream UI uses `useFilteredGameData()`, `useWizardGameData()`, or named hooks from
`useGameData.ts`. Use lookup maps for exact references rather than repeated array scans.

## Spell enrichment

`generated/gendata-spell-source-lookup.json` is required ingestion input. Spell parsing merges its
class and subclass associations once into each `Spell5e`. Runtime class-list checks read that
canonical enriched record through `isSpellOnClassList()`/`isSpellOnSubclassList()`; there is no
second mapping system.

Class slot progressions come from parsed class tables. Shared multiclass slots use the matching
PHB/XPHB full-caster table, including Artificer's special contribution. Missing tables produce a
diagnostic/no invented capacity.

## Items and starting equipment

Item classification uses parsed `itemType` labels first; catalog codes are compatibility fallback.
Unfamiliar items remain available in an Other group instead of being dropped.

Generic starting-equipment tokens become choice descriptors whose candidates come from parsed
items. The character stores the selected concrete `name|source` separately from the package choice.
`items-base.json` supplies base items and mastery definitions; mastery records are not ordinary
inventory entries.

Core SRD/Basic Rules potions and scrolls housed in DMG/XDMG may be admitted by the shared
player-item policy without enabling the full source. This is a filtering rule, not duplicated item
data.

## Cache compatibility

Cache entries include a normalization schema version. Increment it whenever parser-owned normalized
output changes in a way that makes previous cached data unsafe. Character schema changes are a
separate concern and follow [State Management](state-management.md).

## Adding a data family

1. Add passthrough validation/schema support.
2. Add and export a focused parser.
3. Register loading and required/optional behavior.
4. Add source-qualified lookup support if referenced.
5. Expose a named data hook.
6. Add synthetic parser/loader tests and, where useful, a guarded corpus contract.

## Corpus checks

`npm run report:capabilities` audits a configured local `data/` checkout without modifying it. The
report is observational: unknown fields and unresolved/ambiguous references are reported. Corpus
tests must skip cleanly when the ignored external checkout is absent; committed fixtures still
cover deterministic parser behavior in CI.
