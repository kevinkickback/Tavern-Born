export const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export interface ChangelogEntry {
  version: string
  notes: string
}

export function compareStableVersions(left: string, right: string) {
  const leftParts = left.split('.').map(BigInt)
  const rightParts = right.split('.').map(BigInt)
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }
  return 0
}

export function parseChangelog(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  return lines.flatMap((line, start) => {
    const summary = /^<summary><strong>v([^<]+)<\/strong><\/summary>$/.exec(line.trim())
    if (!summary || !stableVersionPattern.test(summary[1])) return []

    const end = lines.findIndex((candidate, index) => {
      if (index <= start) return false
      const tag = candidate.trim()
      return tag === '</details>' || tag.startsWith('<details')
    })
    const complete = lines[start - 1]?.trim() === '<details>' && lines[end]?.trim() === '</details>'
    return [
      {
        version: summary[1],
        notes: complete
          ? lines
              .slice(start + 1, end)
              .join('\n')
              .trim()
          : null,
      },
    ]
  })
}

export function getReleaseHistory(markdown: string, installedVersion: string): ChangelogEntry[] {
  if (!stableVersionPattern.test(installedVersion)) return []

  return parseChangelog(markdown)
    .filter(
      (release): release is ChangelogEntry =>
        Boolean(release.notes) && compareStableVersions(release.version, installedVersion) <= 0,
    )
    .sort((left, right) => compareStableVersions(right.version, left.version))
}
