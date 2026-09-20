export function findUnexpectedSnapshotFiles(
  outputRoot: string,
  expectedFiles: Map<string, string>,
): Promise<string[]>

export function verifySnapshotFiles(
  outputRoot: string,
  expectedFiles: Map<string, string>,
): Promise<void>
