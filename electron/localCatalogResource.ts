import { createHash } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, normalize, relative } from 'node:path'
import { LOCAL_DATA_FOLDER_UNAVAILABLE } from '@/lib/5etools/catalogCheckError'
import { isPathWithinRoot } from './security'

const MAX_LOCAL_JSON_BYTES = 50 * 1024 * 1024

function stampFor({ dev, ino, size, mtimeNs, ctimeNs }: BigIntStats) {
  return `${dev}:${ino}:${size}:${mtimeNs}:${ctimeNs}`
}

async function assertSelectedFolderAvailable(root: string) {
  const [canonicalRoot, rootStats] = await Promise.all([realpath(root), stat(root)]).catch(() => [])
  if (!canonicalRoot || relative(root, canonicalRoot) || !rootStats?.isDirectory())
    throw new Error(LOCAL_DATA_FOLDER_UNAVAILABLE)
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
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        await assertSelectedFolderAvailable(root)
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
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') await assertSelectedFolderAvailable(root)
    if (code === 'ENOENT')
      throw new Error('The file moved during the check. Try checking the source again.')
    throw error
  }
}
