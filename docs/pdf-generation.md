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

Preview generation remains available for inspection, but a download always opens the export
preflight. Blocking readiness items and missing source dependencies are disclosed rather than
silently discarded. Active typed mechanics with no reliable fixed-form representation are listed
as warnings, as is every collection that exceeds a template capacity. The user can return to the
builder or deliberately download with warnings.

For the custom 2014 template, saving also replaces mapped checkbox appearances with portable vector
marks, records mapped text as both the current and reset/default value, and removes obsolete MPMB
action and calculation-order entries. This is required because some desktop PDF readers do not
render the template's font-dependent checkbox glyphs and can reset MPMB-managed fields even though
PDF.js displays them correctly in the app preview.

Bundled organization artwork remains in its native WebP format throughout the app. The PDF image adapter converts it to PNG in memory only when embedding it into the 2014 form; custom images use the same format-normalization boundary when needed.

The template field names are an external contract. Some are descriptive (2014), while the 2024 template uses positional names such as `Text_61`. Never infer a positional field from its number. Inspect its widget rectangle in the actual PDF and extend the template-contract tests whenever a mapping changes.

## Audit Results

Four mutually exclusive runtime templates ship in `public/pdf/`:

- `2014_MPMB_Character_Sheet.pdf`: six pages built from the expanded MPMB source, with the
  reference page excluded and document JavaScript/actions removed;
- `2014_Official_Character_Sheet.pdf`: the three-page Wizards of the Coast form with a dedicated
  semantic mapper;
- `2024_Beaoudix_Character_Sheet.pdf`: the two-page free Lost Loot / u/Beaoudix form shared on
  Reddit; and
- `2024_Official_Character_Sheet.pdf`: the two-page official artwork with a generated AcroForm
  overlay.

The two 2024 templates share the same 381-field contract: 230 text fields and 151 checkboxes. The
official form layer is reproduced by `scripts/prepare-character-sheet-templates.mjs`, which scales
the audited custom widget geometry to the official page boxes while keeping checkbox off
appearances transparent so the printed controls remain visible.

The custom 2014 source contains thousands of MPMB helper fields in addition to character inputs.
The generator intentionally targets semantic inputs and removes unsupported interactive chrome. Its
fifth and sixth pages remain manually fillable because Tavern Born has no companion or general
notes persistence model.

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
- Currency, languages, tools, faith, lifestyle, faction/rank, allies/organizations with the selected or custom emblem, appearance, enemies, and expanded history/personality
- Up to two spellcasting save-DC summaries

### 2014 official

- Identity, physical details, abilities, saves, skills, combat state, and death saves
- Three weapon rows, with additional weapon summaries carried into Attacks & Spellcasting
- Equipment, currency, proficiencies/languages, features, allies, biography, feats, and treasure
- Primary spellcasting summary, slots remaining, and the printed spell-row capacities for levels
  0-9
- Portrait and faction image embedding through the official field names

## Intentional Limits

All numeric collection capacities live in `characterSheetCapacities.ts` and are consumed by both
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
- Both 2014 templates support portrait and organization/faction images; the 2024 templates do not
  have portrait fields.
- Daily lifestyle price, ammunition trackers, and other MPMB-only calculated helpers are not represented in character state or require the removed PDF JavaScript runtime.

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
sidebar selection, preview and page count, preflight, edition-and-variant filename, download, and
AcroForm reopen.

PDF asset size optimization is intentionally a post-functional step. Record the packaged baseline
first, remove duplicate/source assets from packaging, and prefer structural or lossless savings.
Do not flatten forms or degrade fine grids, small labels, or print quality merely to retain a bundle
budget established for the former two-template set.

`tests/fixtures/full-coverage-character-2014.tbc` and
`tests/fixtures/full-coverage-character-2024.tbc` are importable level-20 regression characters dedicated
to their respective rulesets. Each includes three corpus-valid classes/subclasses, four spell
profiles, all skills and saves, at least six weapons, five magic items, 90 inventory rows, multiple
defenses, runtime state, a portrait, and extensive character details. The generation script sources
equipment fields and source-qualified selections from `data/` and stores no copied item, feat, or
feature rules prose. The companion test reparses the current 5etools corpus, rejects every unresolved
race/species, subrace, class/subclass, background, feat, spell, item, or feature reference, validates
both schemas, and exercises each fixture only against its matching template capacity boundary.
