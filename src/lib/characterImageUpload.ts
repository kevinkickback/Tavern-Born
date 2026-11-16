import { MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'

// At four bytes per pixel, a 16-megapixel RGBA image needs about 61 MiB per buffer.
const MAX_IMAGE_PIXELS = 16_000_000
const PNG_HEADER_BYTES = 24
const sizeError = 'Choose an image no larger than 16 megapixels.'
const readError = 'The image file could not be read.'

function exceedsImageLimit(bytes: Uint8Array): boolean {
  const header = new DataView(bytes.buffer)
  // PNG IHDR stores the dimensions before compressed pixels. https://www.w3.org/TR/png-3/
  if (
    header.byteLength >= PNG_HEADER_BYTES &&
    header.getUint32(0) === 0x89504e47 &&
    header.getUint32(4) === 0x0d0a1a0a &&
    header.getUint32(12) === 0x49484452
  )
    return header.getUint32(16) * header.getUint32(20) > MAX_IMAGE_PIXELS

  // JPEG dimensions are in a start-of-frame segment. ITU-T T.81 Annex B.
  const length = bytes.length
  if (length < 2 || header.getUint16(0) !== 0xffd8) return false
  let offset = bytes.indexOf(0xff, 2)
  while (offset >= 0) {
    // Chromium's JPEG decoder tolerates padding and stray bytes between markers.
    while (bytes[offset + 1] === 0xff) offset += 1
    const marker = bytes[offset + 1]
    offset += 2
    if (marker >= 0xd8 && marker <= 0xda) break
    if (marker > 1 && (marker < 0xd0 || marker > 0xd7)) {
      if (offset + 2 > length) break
      const size = Math.max(2, header.getUint16(offset))
      if (offset + size > length) break
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && size >= 8)
        return header.getUint16(offset + 3) * header.getUint16(offset + 5) > MAX_IMAGE_PIXELS
      offset += size
    }
    offset = bytes.indexOf(0xff, offset)
  }
  return false
}

export async function readCharacterImage(file: File, kind: 'portrait' | 'emblem'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > MAX_PORTRAIT_SIZE) throw new Error('Choose an image no larger than 5 MiB.')
  const prefix = `data:${file.type};base64,`
  if (kind === 'portrait' && prefix.length + 4 * Math.ceil(file.size / 3) > MAX_PORTRAIT_SIZE)
    throw new Error('Choose a portrait that fits within 5 MiB after encoding.')
  const buffer = await file.arrayBuffer().catch(() => {
    throw new Error(readError)
  })
  // Electron's Chromium supports this API; TypeScript 5.7 predates its declaration.
  const bytes = new Uint8Array(buffer) as Uint8Array & { toBase64(): string }
  if (exceedsImageLimit(bytes)) throw new Error(sizeError)
  const source = prefix + bytes.toBase64()
  const image = new Image()
  image.src = source
  try {
    await image.decode()
  } catch {
    throw new Error('Choose an image this app can open.')
  }
  if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) throw new Error(sizeError)
  return source
}
