import { readFile, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from '@cantoo/pdf-lib'
import { appendPdfForm } from '../src/lib/pdf/pdfAssembly.ts'

/** Lossless recompression: no resizing, quantization, or changes to printed artwork. */
function recompressImages(source) {
  for (const [ref, stream] of source.context.enumerateIndirectObjects()) {
    if (
      !(stream instanceof PDFRawStream) ||
      stream.dict.get(PDFName.of('Subtype')) !== PDFName.of('Image') ||
      stream.dict.get(PDFName.of('Filter')) !== PDFName.of('FlateDecode')
    )
      continue
    const existingPredictor =
      stream.dict
        .lookupMaybe(PDFName.of('DecodeParms'), PDFDict)
        ?.lookupMaybe(PDFName.of('Predictor'), PDFNumber)
        ?.asNumber() ?? 1
    if (existingPredictor !== 1) continue
    const raw = decodePDFRawStream(stream).decode()
    let packed = deflateSync(raw, { level: 9 })
    let predictor = false
    const width = stream.dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber()
    const height = stream.dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber()
    const bits = stream.dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber()
    // These single-channel images benefit from PNG's previous-row predictor.
    if (bits === 8 && width && height && raw.length === width * height) {
      const rows = new Uint8Array((width + 1) * height)
      for (let y = 0; y < height; y++) {
        rows[y * (width + 1)] = 2
        for (let x = 0; x < width; x++)
          rows[y * (width + 1) + x + 1] = raw[y * width + x] - (y ? raw[(y - 1) * width + x] : 0)
      }
      const predicted = deflateSync(rows, { level: 9 })
      if (predicted.length < packed.length) {
        packed = predicted
        predictor = true
      }
    }
    if (packed.length >= stream.contents.length) continue
    const dict = stream.dict.clone()
    dict.delete(PDFName.of('DecodeParms'))
    if (predictor)
      dict.set(
        PDFName.of('DecodeParms'),
        source.context.obj({ Predictor: 12, Columns: width, Colors: 1, BitsPerComponent: 8 }),
      )
    const replacement = PDFRawStream.of(dict, packed)
    let decoded = decodePDFRawStream(replacement).decode()
    if (predictor) {
      const pixels = new Uint8Array(raw.length)
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          pixels[y * width + x] =
            decoded[y * (width + 1) + x + 1] + (y ? pixels[(y - 1) * width + x] : 0)
      decoded = pixels
    }
    if (!Buffer.from(decoded).equals(Buffer.from(raw)))
      throw new Error('Lossless image verification failed.')
    source.context.assign(ref, replacement)
  }
}

// Both core pages contain character data. Supplements reuse the 2014 modules.
for (const name of ['2024_Beaoudix_Character_Sheet.pdf', '2024_Official_Character_Sheet.pdf']) {
  const input = await readFile(`scripts/pdf-sources/${name}`)
  const source = await PDFDocument.load(input)
  recompressImages(source)
  for (const [, object] of source.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue
    for (const key of ['PieceInfo', 'Metadata', 'Thumb']) object.delete(PDFName.of(key))
  }
  const sourceFields = source
    .getForm()
    .getFields()
    .map((field) => field.getName())
    .sort()
  const output = await PDFDocument.create()
  await appendPdfForm(output, source)
  const bytes = await output.save({ updateFieldAppearances: false })
  const reopened = await PDFDocument.load(bytes)
  if (
    reopened.getPageCount() !== 2 ||
    JSON.stringify(
      reopened
        .getForm()
        .getFields()
        .map((field) => field.getName())
        .sort(),
    ) !== JSON.stringify(sourceFields)
  )
    throw new Error(`The optimized ${name} must retain both pages and every editable field.`)
  await writeFile(`public/pdf/${name}`, bytes)
  console.log(`${name}: ${input.length} -> ${bytes.length} bytes`)
}
