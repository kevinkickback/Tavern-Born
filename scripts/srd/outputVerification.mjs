import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function listFiles(root, relativeDirectory) {
  const directory = resolve(root, ...relativeDirectory.split('/'))
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return []
    throw error
  }

  const files = []
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`
    if (entry.isDirectory()) files.push(...(await listFiles(root, relativePath)))
    else files.push(relativePath)
  }
  return files
}

export async function findUnexpectedSnapshotFiles(outputRoot, expectedFiles) {
  const expected = new Set(expectedFiles.keys())
  return (await listFiles(outputRoot, 'data'))
    .filter((relativePath) => !expected.has(relativePath))
    .sort()
}

export async function verifySnapshotFiles(outputRoot, expectedFiles) {
  const mismatches = []
  for (const [relativePath, expected] of expectedFiles) {
    const path = resolve(outputRoot, ...relativePath.split('/'))
    let actual
    try {
      actual = await readFile(path, 'utf8')
    } catch {
      mismatches.push(`${relativePath} is missing`)
      continue
    }
    if (actual !== expected) mismatches.push(`${relativePath} is stale`)
  }

  for (const relativePath of await findUnexpectedSnapshotFiles(outputRoot, expectedFiles)) {
    mismatches.push(`${relativePath} is unexpected`)
  }

  if (mismatches.length > 0) {
    throw new Error(`Bundled SRD snapshot verification failed:\n- ${mismatches.join('\n- ')}`)
  }
}
