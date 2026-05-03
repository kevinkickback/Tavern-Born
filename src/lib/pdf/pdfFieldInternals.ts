/**
 * Typed accessors for pdf-lib internal structures that are not exposed by the
 * public API.  All casts are isolated here so each call-site stays clean.
 *
 * Runtime shape checks are used where the cost is negligible and the guard
 * prevents crashes on unexpected template revisions.
 */

// ---------------------------------------------------------------------------
// Internal type shapes
// ---------------------------------------------------------------------------

/** A pdf-lib widget as returned by acroField.getWidgets(). */
export type AcroWidget = {
  getRectangle: () => { x: number; y: number; width: number; height: number }
  setRectangle: (value: { x: number; y: number; width: number; height: number }) => void
  P: () => { tag: string } | undefined
  dict: AcroDict
}

/** Subset of an AcroForm field's internal dictionary. */
export type AcroDict = {
  has: (name: unknown) => boolean
  delete: (name: unknown) => void
  get: (name: unknown) => unknown
  set: (name: unknown, value: unknown) => void
}

/** Any pdf-lib field type that exposes acroField internals with widgets + dict. */
export type FieldWithInternals = {
  acroField: {
    getWidgets: () => AcroWidget[]
    dict: AcroDict
  }
  getName: () => string
}

/** Minimal shape needed to locate a page by its /P reference tag. */
type PageWithRef = {
  ref: { tag: string }
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Cast any pdf-lib field to FieldWithInternals.  Returns null and logs a
 * warning if the expected `acroField` property is absent.
 */
export function asFieldWithInternals(field: unknown): FieldWithInternals | null {
  const f = field as Partial<FieldWithInternals>
  if (!f.acroField || typeof f.acroField !== 'object') {
    console.warn('[pdf-lib] field missing expected acroField internals', field)
    return null
  }
  return field as FieldWithInternals
}

/**
 * Cast a pdf-lib page to its internal shape to read the /P reference tag.
 * Returns undefined if the shape is not present (template-safe).
 */
export function getPageRefTag(page: unknown): string | undefined {
  const p = page as Partial<PageWithRef>
  if (!p.ref || typeof p.ref !== 'object') return undefined
  return typeof p.ref.tag === 'string' ? p.ref.tag : undefined
}
