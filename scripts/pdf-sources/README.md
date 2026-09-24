# Character-sheet template sources

These files are maintenance inputs. Electron packages only the prepared PDFs under `public/pdf/`
through `dist/`; the source forms must stay outside that runtime asset directory.

| Retained input | Purpose |
| --- | --- |
| `2014_Official_Character_Sheet.pdf` | WotC's main sheets and the shared spell page |
| `2014_MPMB_Character_Sheet.pdf` | Sanitized six-page MPMB form: four core pages, companion, notes |
| `Companion_Sheet_Form.pdf` | Unmodified user-supplied companion form |
| `2024_Beaoudix_Character_Sheet.pdf` | Lost Loot / u/Beaoudix core form |
| `2024_Official_Character_Sheet.pdf` | WotC artwork with the audited AcroForm overlay |

Source and runtime PDFs are deliberately both tracked: sources preserve regeneration inputs, while
runtime forms let ordinary builds run without acquiring third-party originals or PDF tooling.
They are not redundant copies of the same packaged asset.

## Rebuild runtime assets

From the repository root with dependencies installed (Node 24 or newer):

```text
node scripts/prepare-2014-pdf-modules.mjs
node scripts/prepare-2024-pdf-modules.mjs
```

The first command splits six 2014 modules. The second preserves both core pages of each 2024
layout. Both rebuild page/form relationships and prune unused fonts, thumbnails, and authoring
metadata. The 2024 step also verifies lossless image recompression. Never flatten forms, rasterize
artwork, resize images, or reduce print quality to satisfy a size budget.

Run the template tests and browser export checks described in
[PDF Generation](../../docs/pdf-generation.md#verification), inspect every generated page visually,
then run the production build and strict bundle check. Expect only files in `public/pdf/` to change.

## Import replacement artwork

The original full MPMB download and WotC 2024 artwork are not required for normal regeneration.
When deliberately replacing either, pass its downloaded file explicitly:

```text
node scripts/prepare-character-sheet-templates.mjs --mpmb-source "path/to/original.pdf"
node scripts/prepare-character-sheet-templates.mjs --wotc-2024-source "path/to/artwork.pdf"
```

These commands overwrite the corresponding retained input and regenerate its runtime assets.
The WotC importer also reads the retained Lost Loot form for initial widget geometry. Both flags
may be supplied together; no command depends on the ignored `docs/review/` directory. Running
without a source prints usage and exits without changing PDFs.

MPMB import copies its first six pages into a fresh document, reconstructs the AcroForm from
retained widgets, and removes orphan fields, executable actions, unsupported buttons, and ammunition
helpers. Rebuilding is necessary: deleting the reference page in place left it reachable in PDF.js.
Retain portrait/emblem widgets and the hidden semantic fields used by the mapper.

WotC 2024 import scales the Lost Loot widget geometry, then calibrates saves, training, slots,
components, attunement, and coins to the official artwork. Its separate Range column adds 30
`SpellRange_N` fields. Component widgets need the calibrated row offset to match the printed
diamonds. Text widgets must have transparent backgrounds so they cannot erase artwork lines.

## External form contracts

- Positional names such as `Text_61` describe widget creation order, not visual reading order.
  Inspect the actual page rectangle and extend semantic mapping tests when changing a field.
- MPMB uses font-dependent controls and PDF JavaScript. Runtime export writes portable vector
  marks, current/default text values, and removes obsolete actions and calculation-order entries.
- Default appearances (`/DA`) are PDF operators: write byte strings with `PDFString.of`, never
  UTF-16 display text with `PDFHexString.fromText`. Names and values remain Unicode text.
- Copied widgets must point to the copied page and be registered in the final AcroForm. Prefix
  duplicate page fields and keep font names distinct so editing one page does not change another.
- Checkbox appearances leave unchecked controls transparent and fill only the printed center
  when checked. WotC 2014 Inspiration remains an X in its text field.
- Companion gray fills are adjusted during export to match WotC 2014; the retained companion
  source is unchanged. Organization WebP images convert to PNG in memory at the PDF boundary.

## Companion attribution and permission

The user supplied [Companion Sheet Form](https://www.dmsguild.com/en/product/318155/companion-sheet-form).
The project owner confirmed on 2026-09-23 that permission to bundle it was obtained for this release.
Permission is not inferred from its free-download price or metadata. Settings → About retains the
creator-support link. This supplement is not another selectable character-sheet template.

The file contains no named author or redistribution license in its visible page or metadata.
Metadata identifies Adobe Illustrator 24.1, creation on 2020-06-16, modification on 2025-11-09,
and no embedded attachments. Keep this provenance when replacing or relocating the source.
