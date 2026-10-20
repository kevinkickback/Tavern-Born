import { featureOptionRulesSignature } from './featureRulesSignature'

const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
const rows = (value: unknown) =>
  Array.isArray(value)
    ? value.map(object).filter((row): row is Record<string, unknown> => !!row)
    : []
const metadata = ({ entries: _entries, ...rest }: Record<string, unknown>) => rest
const kind = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
const signature = (value: unknown) => featureOptionRulesSignature([value], false)

export interface OptionalSectionFrame {
  metadata: Record<string, unknown>
  entriesKind: 'absent' | 'array' | 'other'
}
type Shape = Record<string, string>

function matchesShape(value: Record<string, unknown>, shape: Shape) {
  return (
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(Object.keys(shape).sort()) &&
    Object.keys(shape).every((key) => kind(value[key]) === shape[key])
  )
}

export interface OptionalSectionLocator {
  book: { id: string; source: string; name: string }
  chapter: { id: string }
  classSection: { id: string }
  parent: { id: string }
  leaf: { id: string }
  contextInventory: {
    booksShape: Shape
    bookShape: Shape
    rootSiblings: OptionalSectionFrame[]
    chapterSiblings: OptionalSectionFrame[]
    classSiblings: OptionalSectionFrame[]
    parentSiblings: OptionalSectionFrame[]
  }
}

/** Discard only independently inventoried sibling frames, never newly wrapped ancestor prose. */
function closedContext(
  entries: unknown,
  siblings: OptionalSectionFrame[],
  selectedId: string,
  namedFrames = false,
) {
  return (Array.isArray(entries) ? entries : [entries]).filter((value) => {
    const row = object(value)
    if (!row) return true
    if (row.id === selectedId) return false
    const frame = metadata(row)
    return !siblings.some(({ metadata: sibling, entriesKind }) => {
      const present = Object.prototype.hasOwnProperty.call(row, 'entries')
      // Only a reviewed array body may change or disappear. New/wrong-kind bodies stay visible.
      if (
        entriesKind === 'other' ||
        (entriesKind === 'absent' && present) ||
        (entriesKind === 'array' && present && !Array.isArray(row.entries))
      )
        return false
      if (namedFrames && typeof sibling.id === 'string' && typeof sibling.type === 'string') {
        // Reviewed sibling titles/pages are local; unknown shape and nested metadata remain exact.
        return (
          row.id === sibling.id &&
          row.type === sibling.type &&
          matchesShape(
            frame,
            Object.fromEntries(Object.entries(sibling).map(([k, v]) => [k, kind(v)])),
          ) &&
          Object.keys(sibling).every(
            (key) =>
              (kind(sibling[key]) !== 'object' &&
                kind(sibling[key]) !== 'array' &&
                kind(sibling[key]) !== 'null') ||
              signature(frame[key]) === signature(sibling[key]),
          )
        )
      }
      return signature(frame) === signature(sibling)
    })
  })
}

/** Resolve each exact ancestor independently before lookup collapse. A unique leaf cannot erase a conflicting parent. */
export function readOptionalClassSectionInput(
  bookData: unknown,
  booksData: unknown,
  locator: OptionalSectionLocator,
) {
  const index = object(booksData)
  const inventory = locator.contextInventory
  if (!index || !inventory || !matchesShape(index, inventory.booksShape)) return undefined
  const books = rows(index.book).filter((row) => row.id === locator.book.id)
  const chapters = rows(object(bookData)?.data).filter((row) => row.id === locator.chapter.id)
  if (books.length !== 1 || chapters.length !== 1 || !matchesShape(books[0], inventory.bookShape))
    return undefined
  const classes = rows(chapters[0].entries).filter((row) => row.id === locator.classSection.id)
  if (classes.length !== 1) return undefined
  const parents = rows(classes[0].entries).filter((row) => row.id === locator.parent.id)
  if (parents.length !== 1 || !Array.isArray(parents[0].entries)) return undefined
  const leaves = rows(parents[0].entries).filter((row) => row.id === locator.leaf.id)
  if (leaves.length !== 1) return undefined
  return {
    document: Object.fromEntries(
      Object.entries(object(bookData)!).filter(([key]) => key !== 'data'),
    ),
    rootContext: closedContext(
      object(bookData)!.data,
      inventory.rootSiblings,
      locator.chapter.id,
      true,
    ),
    book: { id: books[0].id, source: books[0].source, name: books[0].name },
    chapter: {
      ...metadata(chapters[0]),
      entries: closedContext(
        chapters[0].entries,
        inventory.chapterSiblings,
        locator.classSection.id,
        true,
      ),
    },
    classSection: {
      ...metadata(classes[0]),
      entries: closedContext(classes[0].entries, inventory.classSiblings, locator.parent.id),
    },
    parent: {
      ...metadata(parents[0]),
      entries: closedContext(parents[0].entries, inventory.parentSiblings, locator.leaf.id, true),
    },
    leaf: leaves[0],
  }
}

/** Pinned upstream Renderer.TagSpell/TagOptfeature use name|source|display with PHB default. */
export function getOptionalClassSectionMembers(value: unknown) {
  const members: Array<['spell' | 'optionalFeature', string, string]> = []
  let valid = true
  const visit = (row: unknown) => {
    if (typeof row === 'string') {
      for (const match of row.matchAll(/\{@(spell|optfeature) ([^{}]+)\}/g)) {
        const parts = match[2].split('|').map((part) => part.trim())
        if (!parts[0] || parts.length > 3) {
          valid = false
          continue
        }
        const member: (typeof members)[number] = [
          match[1] === 'spell' ? 'spell' : 'optionalFeature',
          parts[0],
          parts[1] || 'PHB',
        ]
        if (!members.some((other) => JSON.stringify(other) === JSON.stringify(member)))
          members.push(member)
      }
    } else if (Array.isArray(row)) row.forEach(visit)
    else if (row && typeof row === 'object') Object.values(row).forEach(visit)
  }
  visit(value)
  return valid ? members : undefined
}
