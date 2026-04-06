import { describe, expect, test } from 'vitest';
import { renderEntry } from '@/lib/renderer';

describe('renderEntry', () => {
  test('renders a plain string through renderTags', () => {
    expect(renderEntry('Hello')).toBe('<p>Hello</p>');
  });

  test('renders an entries object with name and nested text', () => {
    const result = renderEntry({
      type: 'entries',
      name: 'Feature Name',
      entries: ['Description text.'],
    });
    expect(result).toContain('<strong>Feature Name</strong>');
    expect(result).toContain('Description text.');
  });

  test('renders a list object as an unordered list', () => {
    const result = renderEntry({ type: 'list', items: ['Item A', 'Item B'] });
    expect(result).toContain('<ul>');
    expect(result).toContain('<li><p>Item A</p></li>');
    expect(result).toContain('<li><p>Item B</p></li>');
  });

  test('renders a table with headers and rows', () => {
    const result = renderEntry({
      type: 'table',
      colLabels: ['Level', 'Slots'],
      rows: [['1', '2']],
    });
    expect(result).toContain('<table');
    expect(result).toContain('Level');
    expect(result).toContain('Slots');
    expect(result).toContain('<td');
  });

  test('renders inset by flattening its entries', () => {
    const result = renderEntry({ type: 'inset', entries: ['Inset text.'] });
    expect(result).toBe('<p>Inset text.</p>');
  });

  test('handles refSubclassFeature with a subclassFeature string — renders feature name as fallback', () => {
    const result = renderEntry({
      type: 'refSubclassFeature',
      subclassFeature: 'Arcane Ward|Wizard||Abjuration|PHB|2',
    });
    expect(result).toContain('Arcane Ward');
    expect(result).toContain('text-muted-foreground');
  });

  test('handles refSubclassFeature with a name field when subclassFeature is absent', () => {
    const result = renderEntry({
      type: 'refSubclassFeature',
      name: 'My Feature',
    });
    expect(result).toContain('My Feature');
  });

  test('returns empty string for unknown object type', () => {
    expect(renderEntry({ type: 'unknownType' })).toBe('');
  });

  test('returns empty string for null or non-entry values', () => {
    expect(renderEntry(null)).toBe('');
    expect(renderEntry(undefined)).toBe('');
    expect(renderEntry({})).toBe('');
  });
});
