# Character Sheet PDF Generation

## Pipeline

Character sheet export has five boundaries:

1. `CharacterSheetPage` loads the selected template and supplies character plus game-data lookups.
2. `characterSheetViewModel.ts` resolves class, race, background, spell, item-property, combat, and narrative data into a template-neutral projection.
3. `exportPreflight.ts` compares that projection with readiness, content-resolution, active-effect, and fixed-template capacity contracts before every download.
4. The registry-selected mapper (`characterSheetMapping2014.ts`,
   `characterSheetMapping2014Official.ts`, or `characterSheetMapping2024.ts`) maps that projection
   to the exact AcroForm field names in the selected PDF.
5. `pdfFormAdapter.ts` writes values, refreshes appearances, embeds supported 2014 portrait and
   organization images, and applies the MPMB cleanup profile only to the custom 2014 sheet.

Preview generation remains available for inspection. A clean export downloads immediately;
otherwise a compact "Before you download" dialog groups notes about character choices, missing
content, details to track separately, and text that may not fit. Each group expands on demand.
The full diagnostics remain available, and downloading is still allowed with unresolved issues.

Optional-page definitions live in the template registry. `characterSheetPages.ts` combines them
with content-based defaults and user overrides: official 2014 spell pages start unchecked without
casting or spell selections, MPMB's companion page starts unchecked without an active creature,
and its notes page starts checked. Racial/bonus spells and unresolved casting selections retain
the spell page. Users can include blank pages or omit populated ones. The two 2024 forms have no
standalone optional pages because their spell content shares pages with other character details.
Choices are local to each character/template in the export screen and never mutate character data.
The toolbar's Optional Pages menu lists checkable page names and is hidden when a template has no optional pages.
Its anchored introduction appears until the user opens the menu or dismisses the hint. Dismissal
is shared across characters/templates, survives restarts, and honors Settings' Reset dismissed hints.
Changing choices, character data, or templates invalidates the generated preview and fitting notes;
the preview and download always use the same selection. Omitted pages do not produce capacity or
fitting warnings. Spell-readiness warnings are also omitted when spell pages are deselected.

The 2014 export is composed from six modules in `public/pdf/2014/`: `wotc-main` (two pages),
`mpmb-main` (four), `wotc-companion`, `mpmb-companion`, `wotc-spells`, and `mpmb-notes`.
The spell and notes modules each ship once and are shared by both layouts. Output order is always
**core character sheets → selected companion pages → selected spell pages → selected notes page**.
Both layouts use the original MPMB notes artwork; there are no generated Tavern Born notes or
continuation pages. MPMB retains its racial/organization overflow in the notes fields; WotC's notes
start blank. Notes remain optional (checked by default for MPMB, unchecked for WotC).

`characterSheetAssets.ts` supplies the ordered plan to both loading and assembly. The export screen
loads selected assets concurrently and caches immutable source bytes, coalesces concurrent requests,
and retries failed loads. A caller receives its own byte copy, never a shared mutable document.
`characterSheetPdf.ts` fills only each selected module's field map and builds one output document.
`pdfAssembly.ts` registers copied widget/field relationships, isolates font resource names, and
retains only font resources referenced by editable field appearances. Only the final document is
serialized. The shared WotC spell module is duplicated per caster; MPMB uses the `WotC__` field
prefix, and subsequent casters use `SpellPageN__`, preserving independent editable values and dots.
Omitted modules have no fields, artwork, or fitting warnings in the output.

The full 2014 source PDFs are preserved in `scripts/pdf-sources/`, outside Electron's packaged
`dist` assets. Run `node scripts/prepare-2014-pdf-modules.mjs` to rebuild the runtime modules after
replacing a source. The preparation step copies selected pages and their forms into fresh documents,
removes authoring metadata/thumbnails, and prunes unused form fonts without flattening or rasterizing
artwork. The full-template preparation script also rebuilds these modules after preparing MPMB.
The 2014 packaged baseline was 5,517,583 bytes; the modular assets total approximately 2,746,677
bytes (50% less). The two 2024 assets and their layout pipeline are unchanged.

The official 2014 export optionally appends `wotc-companion.pdf`, one independent editable
page per active companion (or one blank page when explicitly selected). The loader supplies
`supplements.companion` only when selected. `buildCompanionSheetData` projects template-neutral
creature facts; `companionSheetMapping.ts` owns the external field names and audited geometry.
This separation allows a replacement companion layout to reuse the data projection. Unresolved
creatures retain their selected name. Unstored current HP, equipment, personality, and runtime
trackers remain blank. Conditional defenses remain in prose rather than unconditional checkboxes.
Generated copies use dot checkboxes, remove source field actions/rules tooltips, and register
independent `CompanionN__` fields. Companion pages never generate continuation pages. Text exceeding
readable form capacity is abbreviated and reported through the existing fitting/preflight warnings.
The separate blank Notes page is included only when selected. Exported companion panel and entry-box
fills match the official 2014 artwork’s audited RGB grays; the archived source remains byte-for-byte
unchanged. The main official Speed field uses explicit fitting bounds so its value and units stay
inside the printed box.

Companion asset provenance: user-supplied *Companion Sheet Form*,
https://www.dmsguild.com/en/product/318155/companion-sheet-form . Its visible page and PDF metadata
contain no named author or redistribution license. Metadata identifies Adobe Illustrator 24.1,
creation on 2020-06-16 and modification on 2025-11-09; no embedded attachments were found.
Bundling permission is pending: the project owner intends to obtain it before release, or replace
the artwork with an original form. The free-download price is not recorded as a redistribution
license. This is a supplemental asset, not a fifth selectable character-sheet template.

For the custom 2014 template, saving also replaces mapped checkbox appearances with portable vector
marks, records mapped text as both the current and reset/default value, and removes obsolete MPMB
action and calculation-order entries. This is required because some desktop PDF readers do not
render the template's font-dependent checkbox glyphs and can reset MPMB-managed fields even though
PDF.js displays them correctly in the app preview.

Bundled organization artwork remains in its native WebP format throughout the app. The PDF image adapter converts it to PNG in memory only when embedding it into the 2014 form; custom images use the same format-normalization boundary when needed.

The official 2014 adapter uses transparent vector dots for all checkbox appearances; Inspiration
remains an X in its text field. Its organization emblem is embedded in the page-two
`Faction Symbol Image` widget, using the source-qualified organization selection or custom image.

The template field names are an external contract. Some are descriptive (2014), while the 2024 template uses positional names such as `Text_61`. Never infer a positional field from its number. Inspect its widget rectangle in the actual PDF and extend the template-contract tests whenever a mapping changes.

## Audit Results

Four selectable layouts remain in the registry. The 2014 layouts assemble the modules described
above; the two 2024 PDFs remain self-contained in `public/pdf/`:

- `2024_Beaoudix_Character_Sheet.pdf`: the two-page free Lost Loot / u/Beaoudix form;
- `2024_Official_Character_Sheet.pdf`: the two-page official artwork with a generated AcroForm overlay.

The two 2024 templates share the same 381-field contract: 230 text fields and 151 checkboxes. The
official form layer is reproduced by `scripts/prepare-character-sheet-templates.mjs`, which scales
the audited custom widget geometry to the official page boxes. The script then calibrates the
official artwork's death-save, armor-training, spell-slot, spell-component, attunement, and coin
locations and increases the height of number widgets whose multiline appearances clipped glyphs
at the bottom edge; those enlarged widgets have transparent backgrounds so they do not hide printed
labels. Spell-component widgets use a linear vertical correction across all 30 rows to counter
the imported form's cumulative drift against the evenly spaced printed diamonds. The adapter fills
the center of printed circles and diamonds for checked fields (and leaves unchecked appearances
transparent), so neither state paints over the printed controls. `official2024Text.ts` sets field-specific font
bounds; long prose and list fields are fitted to their printed boxes with an ellipsis when they
cannot fit at the readable minimum. Preflight warns when long official-2024 narrative or equipment
fields are likely to be abbreviated. Run the preparation script with `--official-2024` when only
rebuilding the official form, leaving the custom 2014 asset untouched.

The preflight dialog constrains its warning list to a scrollable middle row while keeping its
title and download/cancel actions visible, including on short viewports.

The custom 2014 source contains thousands of MPMB helper fields in addition to character inputs.
The generator intentionally targets semantic inputs and removes unsupported interactive chrome. Its
fifth page now receives the first active, source-qualified creature choice (including ability scores,
core statistics, attacks, traits, and notes) when one is saved. Unresolved companion choices keep
their selected name rather than substituting another printing. Its optional notes page carries racial-trait
and organization-note overflow and remains manually fillable in its unused space because Tavern
Born has no general notes persistence model.

The preparation script copies only the first six pages into a fresh document, reconstructs the
AcroForm root from widgets on those pages, and removes orphaned fields. Rebuilding the page tree is
required because removing page seven in place left the reference page reachable in PDF.js even
when other inspectors reported a six-page document.

During reconstruction, every retained widget is attached to its copied page, detached child widgets
are pruned from the field hierarchy, and unsupported MPMB option buttons and ammunition helpers are
removed. This prevents portrait placement from following stale source-page references and avoids
processing hundreds of controls that Tavern Born never exposes.

The original 2024 mapping assumed its numeric field names followed the page's visual reading order. They instead follow the PDF's widget creation order. That made generation appear successful while identity, ability, save, skill, combat, and narrative values were written into unrelated boxes. The form adapter permits missing fields across template revisions, so this kind of semantic misalignment did not throw an error. Tests now compare every targeted name with each shipped template, while focused assertions lock important fields to their intended meaning.

## Current Coverage

### 2024

- Identity: name, background, species, class, subclass, level, XP, and alignment
- Combat: AC, shield, current/max/temporary HP, spent/max hit dice, death saves, initiative, speed, size, passive Perception, and Heroic Inspiration
- Abilities: all scores and modifiers, all saving throws, every skill modifier, and every proficiency checkbox
- Training: armor, shields, weapon, and tool proficiencies
- Features: class features split across both columns, species traits, and feats
- Weapons: up to six rows with calculated attack bonus, damage, damage type, and property notes
- Spellcasting: primary ability, modifier, save DC, attack modifier, total/used slots for levels 1–9, and up to 30 known/prepared/fixed spells with timing, duration, range, components, concentration, ritual, and material markers
- Story and inventory: appearance, history/personality, languages, inventory, three attunements, and all five coin denominations

### 2014 custom

- Identity, class levels, ancestry, background, XP, alignment, physical details, and player name
- Ability scores/modifiers, saves, skills, proficiencies, vision, AC, HP, initiative, speed, death saves, inspiration, and passive Perception
- Equipped armor/shield breakdown, two AC adjustments, carried weight, carrying/encumbrance thresholds, and encumbered speed
- Up to three class hit-die rows, eight limited class-resource rows, and six resistance/immunity rows with overflow notes
- Up to five weapon attacks with calculated bonuses, damage, type, range, properties, and description
- Up to six active Actions, six Bonus Actions, and six Reactions, projected from structured source
  data and user-authored manual actions; manual entries take precedence when a column is full
- Class/racial/background features and four feats, using one ordered list for regular, bonus, and
  class-owned feat selections
- Up to 90 inventory rows across the equipment and extra-equipment pages
- Five magic items with description, rarity, weight, and attunement state
- Two ammunition summaries, grouped by ammunition name with pack quantities expanded
- One active creature companion on the fifth page; inactive alternate-feature choices are omitted
- Currency, languages, tools, faith, lifestyle, faction/rank, allies/organizations with the selected or custom emblem, appearance, enemies, and expanded history/personality
- Up to two spellcasting save-DC summaries

Empty stored feat and magic-item descriptions are resolved from the exact source-qualified game
record when available; user-written descriptions take precedence. The small printed cards cap
description text at 260 characters and preflight warns about any abbreviation. Ruled multiline
boxes use the template's approximately 11-point line pitch when their contents fit, preserving a
tighter pitch only when needed to avoid pushing text past the field bottom. The Medium/Heavy
circles inside the AC box describe the armor being worn, independently of proficiency.

### 2014 official

- Identity, physical details, abilities, saves, skills, combat state, and death saves
- Three weapon rows, with additional weapon summaries carried into Attacks & Spellcasting
- Equipment, currency, proficiencies/languages, features, allies, biography, feats, and treasure
- One editable spell page per resolved casting class, with its own ability, save DC, attack bonus,
  spell list, and prepared dots; a character without spellcasting defaults to two pages
- Regular casters repeat the shared multiclass slot pool with plain class headings; Pact Magic
  pages carry their separate totals and expended slots
- Portrait and faction image embedding through the official field names
- Bounded text sizes for narrow save/skill and HP fields and long prose boxes; Equipment,
  Features and Traits, Additional Features and Traits, and Treasure have explicit character
  ceilings. When source text exceeds a ceiling, the mapper keeps its beginning and preflight
  warns before download. Selected feats lead the additional-traits box so ancestry prose cannot
  push them out.

## Intentional Limits

PDF-specific routes are lazy-loaded together with the export page. Sidebar labels are generated
from the two edition descriptors; all four URLs and accessible names remain explicit UI contracts.
This keeps template expansion within the existing initial-renderer budget without raising it.

Numeric collection capacities live in `characterSheetCapacities.ts`; the official 2014 per-level
spell capacities are derived directly from its field map. Both are consumed by
the mappings and preflight. This prevents the warning boundary from drifting away from the actual
export boundary. Within each collection, mappings retain the view-model input order; repeated
exports cannot silently reprioritize entries.

- The 2014 Actions, Bonus Actions, and Reactions columns each hold six entries. Inactive entries,
  prose-only features without reliable timing, and weapon attacks already shown in the attack table
  are excluded. Additional structured entries remain available in the app but cannot fit the form.
- Spent hit dice are stored by source-qualified class pool, so multiclass sheets can print each class's die, level, and spent count accurately.
- Each 2024 template has one spellcasting summary, 30 spell rows, six weapon rows, and three
  attunement rows.
- The custom 2014 template has five attack rows, three hit-die rows, eight limited-resource rows,
  five magic-item cards, and 90 equipment rows. The official template has three attack rows and
  100 printed spell rows distributed by spell level.
- Slot grids derive regular Spellcasting maxima from parsed class progressions and clamp saved
  usage through the shared slot calculator; saved maxima are never trusted or modified. Pact Magic
  remains a separate pool. The official 2014 template prints it on the Pact caster's page; other
  templates report its totals and expended slots in preflight. Prepared circles preserve
  source-qualified spell identity and include always-prepared grants and ready known-caster spells.
- Official 2014 spell pages follow casting-class progression order, including subclass casters.
  Racial, bonus, and unresolved-profile spells remain on the first page. Each page deduplicates and
  determines preparation independently, so learning the same spell in two classes does not combine
  their preparation states. Preflight checks each page's per-level capacity separately.
  Additional pages copy the pristine final page before filling and register uniquely named editable
  fields (`SpellPage2__`, `SpellPage3__`, etc.) in the AcroForm tree; widgets point to their copied
  page. The original page retains its template field names.
- Official 2014 damage cells use compact damage-type labels; the attack notes retain full damage
  and weapon properties. Official weapon cells and 2024 fields fit against the appearance provider's
  actual padding, border, font metrics, and wrapping. Generation reports any text shortened at the
  readable font floor; the preview retains those field warnings for download preflight, replacing
  them on regeneration. Character-count warnings remain conservative early estimates, not the only
  truncation check.
- Both 2014 templates support portrait and organization/faction images; the 2024 templates do not
  have portrait fields. Faction text alone does not identify source-qualified artwork: the
  character needs an organization selection with an image or a custom emblem. Preflight warns
  when a faction is named but no image resolves.
- Ancestry trait summaries use the shared gameplay-trait display helper. It omits the descriptive
  Age entry while preserving the original ancestry reference text and the character's Age field.
- Daily lifestyle price, per-shot ammunition tracker dots, and other MPMB-only calculated helpers are not represented in character state or require the removed PDF JavaScript runtime. The two ammunition name/count boxes are populated independently.

## Verification

`tests/lib/characterSheetPdf.test.ts` covers semantic mapping, active typed defensive effects,
unified feat projection, field-capacity boundaries, real-template field-name contracts, actual form
filling, and 2014 cleanup. `tests/lib/exportPreflight.test.ts` locks readiness, missing-dependency,
unsupported-effect, inactive-effect, and truncation classification. `tests/lib/pdfSavedOutput.test.ts`
reopens an actual generated 2014 file and verifies the resistance, armor, language, and tool values
plus portable checkbox appearances. Template-contract coverage checks every mapper against all four
shipped forms. When replacing a template, rerun those tests and visually inspect every generated
page before changing field names.

`tests/e2e/pdf-templates.spec.ts` exercises the complete browser workflow for all four templates:
sidebar selection, preview and page count, preflight, character-name-only filename, download, and
AcroForm reopen.

`tests/lib/pdfExportRegressions.test.ts` checks real parsed slot progressions, per-level spell
overflow, prepared-widget geometry, saved damage appearance widths/baselines, and actual multiline
truncation reporting. `characterSheetPage.test.tsx` verifies warnings follow the generated preview.

PDF asset size optimization is intentionally a post-functional step. Record the packaged baseline
first, remove duplicate/source assets from packaging, and prefer structural or lossless savings.
Do not flatten forms or degrade fine grids, small labels, or print quality merely to retain a bundle
budget established for the former two-template set.

`tests/fixtures/full-coverage-character-2014.tbc` and
`tests/fixtures/full-coverage-character-2024.tbc` are importable level-20 regression characters dedicated
to their respective rulesets. Each includes three corpus-valid classes/subclasses, four spell
profiles, all skills and saves, at least six weapons, five magic items, 90 inventory rows, multiple
defenses, runtime state, a portrait, a source-qualified organization emblem, subclass-owned
Battle Master maneuvers, and extensive character details. Two smaller importable Beast Master
fixtures cover a 2014 inactive classic Wolf companion with an active Primal Companion replacement,
and the 2024 Primal Companion. The generation script sources equipment fields and
source-qualified selections from `data/` and stores no copied item, feat, or feature rules prose.
The fixture test reparses the current 5etools corpus, rejects unresolved game-data references,
checks active subclass and companion choice eligibility, validates import/readiness, and exercises
the level-20 fixtures only against their matching template capacity boundary.

Fixture movement is initialized from the selected race/subrace's source speed rather than an
empty seed value. Previously imported copies must be reimported to receive that correction;
export does not mutate a saved character's movement.
