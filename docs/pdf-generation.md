# Character Sheet PDF Generation

This guide owns export behavior. Template geometry, provenance, and rebuilding commands live with
the [retained PDF sources](../scripts/pdf-sources/README.md).

## Pipeline

1. `CharacterSheetPage` loads the selected template and character/game-data inputs.
2. `characterSheetViewModel.ts` creates a template-neutral projection through shared calculations
   and source-qualified lookups.
3. `sheetContent.ts` selects entries without changing the character; `characterSheetPdf.ts`
   coordinates fitting, optional pages, and the completed export report.
4. The template mapper translates values to audited external field names.
5. `pdfFormAdapter.ts` fills values/appearances and supported images; `pdfAssembly.ts` registers
   copied pages and fields in one editable document.

Preview and download use the same completed export. Changes to character data, game data, template,
or preferences invalidate the preview and its report. Export never changes persisted gameplay state.

## Templates and page assembly

Entering Character Sheet selects WotC for the active character's origin ruleset (2024 when
unavailable). Edition-only routes also select WotC; explicit custom-template URLs remain supported.
PDF routes and their dependencies are lazy-loaded.

| Layout | Core pages | Optional modules |
| --- | ---: | --- |
| Wizards of the Coast (2014) | 2 | WotC companion, shared WotC spells, shared MPMB notes |
| MorePurpleMoreBetter (2014) | 4 | MPMB companion, shared WotC spells, shared MPMB notes |
| Wizards of the Coast (2024) | 2 | WotC companion, shared MPMB notes |
| Lost Loot (2024) | 2 | WotC companion, shared MPMB notes |

The six 2014 modules live in `public/pdf/2014/`; each 2024 core stays combined because both pages
contain essential character sections. Shared modules are packaged once. Output order is always
**core → companions → spells → notes**.

`characterSheetAssets.ts` plans selected assets, coalesces concurrent loads, caches immutable bytes,
and retries failures. Callers get byte copies, not shared mutable documents. Assembly fills selected
modules only and serializes once. Omitted modules contribute no artwork, fields, or fitting warnings.

## Export preferences

`characterSheetPages.ts` derives defaults from content; explicit overrides win:

- Spells default on for casting or spell selections, including racial/bonus spells and unresolved
  class profiles.
- Companions default on for active creature choices.
- MPMB notes default on. Other layouts add notes as needed by **Continue in notes**, unless disabled.
- Users may include blank pages or omit populated supplements.

**Customize PDF** uses a single-open accordion and bounded lists. Automatic selection prefers
equipped attacks/inventory, ready spells, active actions, and attuned/equipped magic items. Each
group shows its capacity and supports manual selections or Automatic reset. Choices use stable
source-qualified spell IDs or entity/action IDs. Removed IDs are ignored; an entirely stale
nonempty selection falls back to automatic.

Description and overflow controls are independent:

- Full descriptions are the default; names-only keeps combat numbers while removing rules
  descriptions from features, traits, feats, actions, and magic items. Companion rules remain intact.
- **Shorten with ellipsis** is the default overflow mode. Explicit notes pages remain blank.
- **Continue in notes** preserves full reference text and keeps a useful fitted beginning in each
  main-sheet box, plus a reference to the actual continuation page.

Only overrides persist in `sheetExportPreferences.ts`, keyed by character/template; automatic
choices are recomputed. Preferences never enter character files. **Optional Pages** contains
checkable page names. A shared, resettable one-time hint covers both controls and dismisses when
either opens. Zoom lives in the footer opposite attribution.

## Fitting and overflow

Row limits live in `characterSheetCapacities.ts`; WotC 2014 per-level spell limits derive from its
field map. Selection, mapping, and diagnostics use the same limits. The shared projection retains
all entries, including every class's Hit Dice pool, before applying template limits.

Text fitting uses widget geometry, padding, font metrics, and readable minimum sizes. Binary
searches stop at word boundaries; prewrapping avoids repeated scans of long prose.
`official2024Text.ts` accounts for different page scales and spell-row heights. Ruled MPMB boxes
retain their printed line pitch when content fits. Compaction removes whitespace only; no AI
summarizer rewrites rules, costs, conditions, or exceptions.

`sheetNotes.ts` fills shared MPMB columns at 9 pt and paginates against their geometry. Continue
in notes retains full source text for context; original boxes never become only pointers. Copies
have independent editable fields. Disabling notes preserves fitted beginnings and records actual
omissions. `SheetExportReport` records preserved/omitted sections and actual notes-page counts;
completed exports replace estimated warnings with measured results and readable section labels.

## Spells and companions

Both 2014 layouts use the shared spell asset per resolved casting class, including subclass casters.
Regular casters repeat the shared multiclass pool; Pact Magic retains its separate pool. Maxima
derive from parsed progressions and usage is clamped without changing the character. Each page
deduplicates and determines preparation independently, including always-prepared and ready
known-caster spells. Racial, bonus, and unresolved-profile spells stay on the first page.
Per-level overflow continues onto extra spell-page copies independently of the long-text setting.

MPMB spell fields use a `WotC__` prefix; extra caster/continuation copies have distinct prefixes.
Each 2024 form has one casting summary and fixed spell rows; excess spells and secondary summaries
continue in notes when enabled, rather than duplicating mixed-content core pages.

`buildCompanionSheetData` resolves active source-qualified creature choices; external field
names/geometry belong in `companionSheetMapping.ts`. Each active creature gets an independent
editable page, or one blank page when requested without a creature. Unresolved choices retain
their names. Supported formulas use the owning class, including 2024 Primal Companion AC, damage,
HP, Hit Dice, and proficiency. Unknown formulas and conditional defenses remain prose; unstored
runtime values remain blank. Overflow uses shared notes when enabled, never separate companion
continuation pages.

## Preflight and deliberate limits

Clean exports download immediately. **Before you download** groups unresolved character choices,
missing content, and mechanics to track separately; download remains allowed.
`getPdfDownloadPreflight` excludes fit, capacity, and overflow diagnostics because Customize PDF
owns those choices. Dialog title/actions stay visible on short viewports.

- Omitted pages generate no capacity/fitting warnings; omitting spell pages also suppresses
  spell-readiness warnings and removes their overflow from both notes defaults and generation.
- Structured racial senses described in exported traits need no separate warning. Match resolved
  race name/source; manual adjustments and unrepresented senses still qualify.
- The shared gameplay-trait helper excludes descriptive Age while retaining the ancestry's
  original reference text and the character's Age field.
- 2014 forms support portrait and source-qualified organization/custom emblem images; 2024 forms
  have no portrait fields. Faction text alone cannot identify artwork.
- Action columns exclude inactive entries, weapon attacks already printed in the attack table,
  and prose-only features without reliable timing.
- Unsupported MPMB JavaScript helpers, per-shot ammunition dots, and daily lifestyle calculations
  are not inferred. Both ammunition name/count fields are mapped independently.

## Verification

Focused suites under `tests/lib/` cover projection, source identity, optional-page assembly,
companion formulas, selection/overflow, actual filling, saved appearances, and every mapper's
field contract against all four shipped layouts. Integration tests cover preferences, hints,
routing, preview invalidation, and download warnings.

`tests/e2e/pdf-templates.spec.ts` previews/downloads all layouts, reopens the AcroForm, and rejects
malformed PDF operator warnings. Companion and organization E2E checks exercise creature mapping
and emblem embedding.

Importable full-coverage and Beast Master fixtures cover both rulesets. Regenerate them with
`npm run generate:test-fixtures` using external `data/`; validation rejects unresolved references
and checks choice eligibility, readiness, and matching-template capacities. Fixtures contain no
copied rules prose. Reimport local copies after fixture changes; export never rewrites characters.

For source/geometry changes, follow the [template maintenance checks](../scripts/pdf-sources/README.md#rebuild-runtime-assets)
and visually inspect every page. General gates live in [Testing Map](testing-map.md#commands).
