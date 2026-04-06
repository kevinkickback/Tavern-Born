import { describe, expect, test } from 'vitest';
import {
  formatSpellLevel,
  getOrdinalForm,
  ordinalSuffix,
} from '@/lib/calculations/spellUtils';

describe('ordinalSuffix', () => {
  test('returns correct suffix for 1st/2nd/3rd', () => {
    expect(ordinalSuffix(1)).toBe('st');
    expect(ordinalSuffix(2)).toBe('nd');
    expect(ordinalSuffix(3)).toBe('rd');
    expect(ordinalSuffix(4)).toBe('th');
  });

  test('handles 11th/12th/13th exceptions', () => {
    expect(ordinalSuffix(11)).toBe('th');
    expect(ordinalSuffix(12)).toBe('th');
    expect(ordinalSuffix(13)).toBe('th');
  });

  test('handles 21st/22nd/23rd correctly', () => {
    expect(ordinalSuffix(21)).toBe('st');
    expect(ordinalSuffix(22)).toBe('nd');
    expect(ordinalSuffix(23)).toBe('rd');
  });
});

describe('getOrdinalForm', () => {
  test('returns full ordinal for spell levels 1–9', () => {
    expect(getOrdinalForm(1)).toBe('1st');
    expect(getOrdinalForm(2)).toBe('2nd');
    expect(getOrdinalForm(3)).toBe('3rd');
    expect(getOrdinalForm(4)).toBe('4th');
    expect(getOrdinalForm(5)).toBe('5th');
    expect(getOrdinalForm(9)).toBe('9th');
  });

  test('handles teen exceptions', () => {
    expect(getOrdinalForm(11)).toBe('11th');
    expect(getOrdinalForm(12)).toBe('12th');
    expect(getOrdinalForm(13)).toBe('13th');
  });
});

describe('formatSpellLevel', () => {
  test('returns "Cantrip" for level 0', () => {
    expect(formatSpellLevel(0)).toBe('Cantrip');
  });

  test('returns ordinal-level for non-zero spell levels', () => {
    expect(formatSpellLevel(1)).toBe('1st-level');
    expect(formatSpellLevel(2)).toBe('2nd-level');
    expect(formatSpellLevel(3)).toBe('3rd-level');
    expect(formatSpellLevel(9)).toBe('9th-level');
  });
});
