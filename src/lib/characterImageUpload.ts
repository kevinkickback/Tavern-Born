import { MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'

// At four bytes per pixel, a 16-megapixel RGBA image needs about 61 MiB per buffer.
const MAX_IMAGE_PIXELS = 16_000_000
const PNG_HEADER_BYTES = 24
const sizeError = 'Choose an image no larger than 16 megapixels.'
const readError = 'The image file could not be read.'

async function pngExceedsImageLimit(file: File): Promise<boolean> {
  if (file.size < PNG_HEADER_BYTES) return false
  const bytes = await file
    .slice(0, PNG_HEADER_BYTES)
    .arrayBuffer()
    .catch(() => {
      throw new Error(readError)
    })
  // PNG IHDR stores the dimensions before compressed pixels. https://www.w3.org/TR/png-3/
  const header = new DataView(bytes)
  return (
    header.getUint32(0) === 0x89504e47 &&
    header.getUint32(4) === 0x0d0a1a0a &&
    header.getUint32(12) === 0x49484452 &&
    header.getUint32(16) * header.getUint32(20) > MAX_IMAGE_PIXELS
  )
}

export async function readCharacterImage(file: File, kind: 'portrait' | 'emblem'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > MAX_PORTRAIT_SIZE) throw new Error('Choose an image no larger than 5 MiB.')
  if (await pngExceedsImageLimit(file)) throw new Error(sizeError)

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error())
    reader.onerror = reader.onabort = () => reject(new Error())
    reader.readAsDataURL(file)
  }).catch(() => {
    throw new Error(readError)
  })
  // FileReader emits an ASCII data URL. Portrait storage limits the encoded value.
  if (kind === 'portrait' && source.length > MAX_PORTRAIT_SIZE)
    throw new Error('Choose a portrait that fits within 5 MiB after encoding.')

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
