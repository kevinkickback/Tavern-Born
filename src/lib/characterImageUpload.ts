import { MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'

// At four bytes per pixel, a 16-megapixel RGBA image needs about 61 MiB per buffer.
const MAX_IMAGE_PIXELS = 16_000_000

export async function readCharacterImage(file: File, kind: 'portrait' | 'emblem'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > MAX_PORTRAIT_SIZE) throw new Error('Choose an image no larger than 5 MiB.')

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error())
    reader.onerror = reader.onabort = () => reject(new Error())
    reader.readAsDataURL(file)
  }).catch(() => {
    throw new Error('The image file could not be read.')
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
  if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS)
    throw new Error('Choose an image no larger than 16 megapixels.')
  return source
}
