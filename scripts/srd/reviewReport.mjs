const COLUMNS = [
  'relativePath',
  'collection',
  'identity',
  'provenanceType',
  'marker',
  'srdVersion',
  'officialSection',
  'reason',
  'recordSha256',
  'reviewStatus',
  'officialLocation',
  'reviewNotes',
]

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

export function buildSrdReviewInventory(manifest) {
  const records = manifest?.coverage?.records
  if (!Array.isArray(records)) throw new Error('SRD manifest has no per-record review inventory.')
  const rows = [...records].sort(
    (left, right) =>
      String(left.relativePath).localeCompare(String(right.relativePath)) ||
      String(left.collection).localeCompare(String(right.collection)) ||
      String(left.identity).localeCompare(String(right.identity)),
  )
  return `${[
    COLUMNS.map(csvCell).join(','),
    ...rows.map((record) => COLUMNS.map((column) => csvCell(record[column])).join(',')),
  ].join('\n')}\n`
}
