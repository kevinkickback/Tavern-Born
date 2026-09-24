import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib'
import { appendPdfForm } from '../src/lib/pdf/pdfAssembly.ts'
import { omitPdfPages } from '../src/lib/pdf/pdfPageSelection.ts'

const directory = 'public/pdf/2014'
await mkdir(directory, { recursive: true })
for (const [file, modules] of [
  [
    '2014_Official_Character_Sheet.pdf',
    [
      ['wotc-main', [0, 1]],
      ['wotc-spells', [2]],
    ],
  ],
  [
    '2014_MPMB_Character_Sheet.pdf',
    [
      ['mpmb-main', [0, 1, 2, 3]],
      ['mpmb-companion', [4]],
      ['mpmb-notes', [5]],
    ],
  ],
  ['Companion_Sheet_Form.pdf', [['wotc-companion', [0]]]],
]) {
  for (const [name, indices] of modules) {
    const source = await PDFDocument.load(await readFile(`scripts/pdf-sources/${file}`))
    // Authoring data is retained in scripts/pdf-sources, not shipped inside every page module.
    for (const [, object] of source.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue
      for (const key of ['PieceInfo', 'Metadata', 'Thumb']) object.delete(PDFName.of(key))
    }
    const selected = await omitPdfPages(
      source,
      source.getPageIndices().filter((index) => !indices.includes(index)),
    )
    const output = await PDFDocument.create()
    await appendPdfForm(output, selected)
    const bytes = await output.save({ updateFieldAppearances: false })
    await writeFile(`${directory}/${name}.pdf`, bytes)
    console.log(`${name}: ${bytes.length} bytes`)
  }
}
