# Character Sheet PDF Generation

## Pipeline

Character sheet export has four boundaries:

1. `CharacterSheetPage` loads the selected template and supplies character plus game-data lookups.
2. `characterSheetViewModel.ts` resolves class, race, background, spell, item-property, combat, and narrative data into a template-neutral projection.
3. `characterSheetMapping2014.ts` or `characterSheetMapping2024.ts` maps that projection to the exact AcroForm field names in the shipped PDF.
4. `pdfFormAdapter.ts` writes values, refreshes appearances, embeds the 2014 portrait, and removes unsupported MPMB controls and scripts.

For the legacy 2014 template, saving also replaces mapped checkbox appearances with portable vector marks, records mapped text as both the current and reset/default value, and removes the obsolete MPMB action and calculation-order entries. This is required because some desktop PDF readers do not render the template's font-dependent checkbox glyphs and can reset MPMB-managed fields even though PDF.js displays them correctly in the app preview.

The template field names are an external contract. Some are descriptive (2014), while the 2024 template uses positional names such as `Text_61`. Never infer a positional field from its number. Inspect its widget rectangle in the actual PDF and extend the template-contract tests whenever a mapping changes.

## Audit Results

The shipped 2014 template contains 1,220 canonical fields and 1,217 page widgets across four pages. Most are MPMB buttons, display helpers, calculation intermediates, labels, and duplicated controls rather than character values. The generator intentionally targets the semantic input fields and hides unsupported interactive chrome.

The shipped 2024 template contains 381 fields/widgets across two pages: 230 text fields and 151 checkboxes. The generator maps every one of those fields. Empty boxes therefore mean that the character does not contain a corresponding value or that the fixed template capacity exceeds the character's data—not that the field was skipped.

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

### 2014

- Identity, class levels, ancestry, background, XP, alignment, physical details, and player name
- Ability scores/modifiers, saves, skills, proficiencies, vision, AC, HP, initiative, speed, death saves, inspiration, and passive Perception
- Equipped armor/shield breakdown, two AC adjustments, carried weight, carrying/encumbrance thresholds, and encumbered speed
- Up to three class hit-die rows, eight limited class-resource rows, and six resistance/immunity rows with overflow notes
- Up to five weapon attacks with calculated bonuses, damage, type, range, properties, and description
- Class/racial/background features and four feats
- Up to 90 inventory rows across the equipment and extra-equipment pages
- Five magic items with description, rarity, weight, and attunement state
- Currency, languages, tools, faith, lifestyle, faction/rank, allies/organizations, appearance, enemies, and expanded history/personality
- Up to two spellcasting save-DC summaries

## Intentional Limits

- The 2014 Actions, Bonus Actions, and Reactions columns are not auto-filled. Character features currently have prose but no reliable structured action type; guessing from text would put features in the wrong column.
- Multiclass characters store one aggregate `hitDiceUsed` value. The generator prints each class's die and level but leaves per-class spent values blank because the split cannot be reconstructed safely.
- The 2024 template has one spellcasting summary, 30 spell rows, six weapon rows, and three attunement rows. Additional entries remain available in the app but cannot fit this fixed form.
- The 2014 template has five attack rows, three hit-die rows, eight limited-resource rows, five magic-item cards, and 90 equipment rows. Additional data is limited by the template.
- The 2014 portrait is supported; the 2024 template has no portrait field.
- Organization images, daily lifestyle price, ammunition trackers, and other MPMB-only calculated helpers are not represented in character state or require the removed PDF JavaScript runtime.

## Verification

`tests/lib/characterSheetPdf.test.ts` covers semantic mapping, field-capacity boundaries, real-template field-name contracts, actual form filling, and 2014 cleanup. `tests/lib/pdfSavedOutput.test.ts` reopens an actual generated 2014 file and verifies the resistance, armor, language, and tool values plus portable checkbox appearances. When replacing either template, rerun those tests and visually inspect every generated page before changing field names.

`tests/fixtures/pdf-kitchen-sink.tbc` is an importable level-20 regression character designed to populate both templates heavily. It includes three classes/subclasses, a race/subrace, four spell profiles with 31 unique spells, all skills and saves, six weapons, five magic items, 90 inventory rows, multiple defenses, runtime state, provenance, a portrait, and extensive character details. Its companion test validates the schema and both mapping-capacity boundaries.
