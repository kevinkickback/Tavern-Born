import { createHash } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, normalize, posix, relative, win32 } from 'node:path'
import { isPathWithinRoot } from './security'

const MAX_LOCAL_JSON_BYTES = 50 * 1024 * 1024

export function parsePastedCatalogPath(value: unknown, platform = process.platform): string {
  const invalid = () => new Error('Enter a full folder path.')
  if (typeof value !== 'string') throw invalid()
  const quoted = value.trim()
  const path = quoted.startsWith('"') && quoted.endsWith('"') ? quoted.slice(1, -1) : value
  if (/[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(path)) throw invalid()

  const paths = platform === 'win32' ? win32 : posix
  if (!paths.isAbsolute(path)) throw invalid()
  if (platform === 'win32') {
    const windowsPath = path.replace(/\//g, '\\')
    const drive = /^[a-z]:\\/i.test(windowsPath)
    const parts = windowsPath.slice(drive ? 3 : 2).split('\\')
    const unc = windowsPath.startsWith('\\\\') && Boolean(parts[0] && parts[1])
    const device = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i
    if (
      (!drive && !unc) ||
      parts.some(
        (part) =>
          /[<>:"|?*]/.test(part) ||
          (part !== '.' && part !== '..' && /[ .]$/.test(part)) ||
          device.test(part),
      ) ||
      (unc && parts.slice(0, 2).some((part) => part === '.' || part === '..'))
    )
      throw invalid()
  }
  // Keep dot segments intact so the native confirmation and filesystem resolve the same path.
  return path
}

function stampFor({ dev, ino, size, mtimeNs, ctimeNs }: BigIntStats) {
  return `${dev}:${ino}:${size}:${mtimeNs}:${ctimeNs}`
}

/** The caller must authorize the root for the current catalog job. */
export async function readLocalCatalogResource(filePath: string, root: string, probe = false) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath))
    throw new Error('Path must be absolute')
  if (extname(filePath).toLowerCase() !== '.json') throw new Error('Only JSON files may be read')
  if (!isPathWithinRoot(root, normalize(filePath)))
    throw new Error('Access denied: path is outside the configured data directory.')
  const canonicalTarget = normalize(
    await realpath(filePath).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        const [canonicalRoot, rootStats] = await Promise.all([realpath(root), stat(root)]).catch(
          () => [],
        )
        if (!canonicalRoot || relative(root, canonicalRoot) || !rootStats?.isDirectory())
          throw new Error('The selected data folder is unavailable.')
      }
      throw error
    }),
  )
  if (!isPathWithinRoot(root, canonicalTarget))
    throw new Error('Access denied: path is outside the configured data directory.')

  try {
    // Reject special files before open, then stamp the handle used to read.
    if (!(await stat(canonicalTarget)).isFile()) throw new Error('Path does not reference a file')
    const file = await open(canonicalTarget, 'r')
    try {
      const fileStats = await file.stat({ bigint: true })
      if (!fileStats.isFile()) throw new Error('Path does not reference a file')
      if (fileStats.size > MAX_LOCAL_JSON_BYTES)
        throw new Error('JSON file exceeds the 50 MB safety limit')
      const stamp = stampFor(fileStats)
      if (probe) return { stamp }
      const bytes = await file.readFile()
      if (stampFor(await file.stat({ bigint: true })) !== stamp)
        throw new Error('The file changed during the check. Try checking the source again.')
      return {
        text: bytes.toString('utf-8'),
        stamp: `${stamp}#${createHash('sha256').update(bytes).digest('hex')}`,
      }
    } finally {
      await file.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error('The file moved during the check. Try checking the source again.')
    throw error
  }
}
