import { describe, expect, test } from 'vitest'
import { renderEntriesToText } from '@/lib/entryText'
import { renderEntry } from '@/lib/renderer'

describe('renderEntry', () => {
  test('renders a plain string through renderTags', () => {
    expect(renderEntry('Hello')).toBe('<p>Hello</p>')
  })

  test('does not expose internal item-template references', () => {
    expect(renderEntry('{#itemEntry Ioun Stone|XDMG}')).toBe('<p></p>')
  })

  test('renders external game-data links as non-interactive prose', () => {
    const result = renderEntry(
      'Read {@link this correction|https://example.com/rules} and {@link this warning|javascript:alert(1)}.',
    )

    expect(result).toBe('<p>Read this correction and this warning.</p>')
    expect(result).not.toContain('<a')
    expect(result).not.toContain('href=')
    expect(result).not.toContain('example.com')
  })

  test('renders an entries object with name and nested text', () => {
    const result = renderEntry({
      type: 'entries',
      name: 'Feature Name',
      entries: ['Description text.'],
    })
    expect(result).toContain('<strong>Feature Name</strong>')
    expect(result).toContain('Description text.')
  })

  test('renders a list object as an unordered list', () => {
    const result = renderEntry({ type: 'list', items: ['Item A', 'Item B'] })
    expect(result).toContain('<ul>')
    expect(result).toContain('<li><p>Item A</p></li>')
    expect(result).toContain('<li><p>Item B</p></li>')
  })

  test('renders a table with headers and rows', () => {
    const result = renderEntry({
      type: 'table',
      colLabels: ['Level', 'Slots'],
      rows: [['1', '2']],
    })
    expect(result).toContain('<table')
    expect(result).toContain('Level')
    expect(result).toContain('Slots')
    expect(result).toContain('<td')
  })

  test('renders inset by flattening its entries', () => {
    const result = renderEntry({ type: 'inset', entries: ['Inset text.'] })
    expect(result).toBe('<p>Inset text.</p>')
  })

  test('preserves scoped class and subclass feature references for previews', () => {
    const result = renderEntry(
      'Use {@classFeature Extra Attack|Fighter|PHB|5|PHB} with {@subclassFeature Arcane Ward|Wizard|PHB|Abjuration|PHB|2|PHB|the ward}.',
    )

    expect(result).toContain('data-hover-type="classFeature"')
    expect(result).toContain('data-hover-class-name="Fighter"')
    expect(result).toContain('data-hover-type="subclassFeature"')
    expect(result).toContain('data-hover-subclass-name="Abjuration"')
    expect(result).toContain('>the ward</span>')
  })

  test('handles refSubclassFeature with a subclassFeature string — renders feature name as fallback', () => {
    const result = renderEntry({
      type: 'refSubclassFeature',
      subclassFeature: 'Arcane Ward|Wizard||Abjuration|PHB|2',
    })
    expect(result).toContain('Arcane Ward')
    expect(result).toContain('text-muted-foreground')
  })

  test('handles refSubclassFeature with a name field when subclassFeature is absent', () => {
    const result = renderEntry({
      type: 'refSubclassFeature',
      name: 'My Feature',
    })
    expect(result).toContain('My Feature')
  })

  test('returns empty string for unknown object type', () => {
    expect(renderEntry({ type: 'unknownType' })).toBe('')
  })

  test('returns empty string for null or non-entry values', () => {
    expect(renderEntry(null)).toBe('')
    expect(renderEntry(undefined)).toBe('')
    expect(renderEntry({})).toBe('')
  })
})

// Same five-field display contract as pinned DataUtil.quickreference/TagQuickref.
describe('quick reference display text', () => {
  test.each([
    ['Cover||3||total cover', 'total cover'],
    [' Cover | PHB | 3 | 2 | total cover ', 'total cover'],
    ['Cover|PHB|3|2|', 'Cover'],
    ['Cover||3', 'Cover'],
    ['Cover', 'Cover'],
  ])('renders %s as %s without losing inline styling', (uid, label) => {
    const html = renderEntry(`{@quickref ${uid}}`)
    expect(html).toContain(`>${label}</span>`)
    expect(html).toContain('title="Quick Reference"')
    expect(html).toContain('decoration-dotted')
    expect(renderEntriesToText([`{@quickref ${uid}}`])).toBe(label)
  })
  test.each([
    '{@quickref Cover||3||<img src=x onerror=alert(1)>total cover<script>alert(2)</script>}',
    '{@quickref <img src=x onerror=alert(1)>Cover<script>alert(2)</script>}',
  ])('sanitizes display and fallback labels: %s', (text) => {
    const html = renderEntry(text)
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('alert(')
  })
  test('leaves neighboring typed references intact', () => {
    const html = renderEntry('Use {@quickref Cover||3||total cover} while {@condition prone}.')
    expect(html).toContain('total cover')
    expect(html).toContain('data-hover-type="condition"')
    expect(
      renderEntriesToText(['Use {@quickref Cover||3||total cover} while {@condition prone}.']),
    ).toBe('Use total cover while prone .')
  })
})
