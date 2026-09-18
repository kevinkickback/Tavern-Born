import { describe, expect, test } from 'vitest'
import {
  initialRulesPreviewState,
  type RulesPreviewDescriptor,
  rulesPreviewReducer,
  type TransientRulesPreview,
} from '@/components/editor/rulesPreviewState'
import { buildRecursiveLookup } from '@/lib/renderer/recursiveTooltip'

const lookup = buildRecursiveLookup({})

function descriptor(title: string): RulesPreviewDescriptor {
  return {
    key: title.toLowerCase(),
    kind: 'generic',
    title,
    recursiveLookup: lookup,
  }
}

function transient(title: string, id = title.toLowerCase()): TransientRulesPreview {
  return {
    id,
    parentId: null,
    anchor: null,
    anchorBounds: { left: 20, top: 40, width: 80, height: 20 },
    descriptor: descriptor(title),
    placement: 'top-start',
    position: { left: 20, top: 64 },
    positionLocked: false,
    sourceElement: null,
  }
}

describe('rulesPreviewReducer', () => {
  test('keeps a rolling two-preview chain while preserving the immediate parent', () => {
    const first = rulesPreviewReducer(initialRulesPreviewState, {
      type: 'open-root',
      preview: transient('First'),
    })
    const secondPreview = {
      ...transient('Second'),
      parentId: 'first',
      position: { left: 360, top: 64 },
    }
    const second = rulesPreviewReducer(first, {
      type: 'open-child',
      parentId: 'first',
      preview: secondPreview,
    })
    expect(second.chain.map((preview) => preview.descriptor.title)).toEqual(['First', 'Second'])

    const third = rulesPreviewReducer(second, {
      type: 'open-child',
      parentId: 'second',
      preview: { ...transient('Third'), parentId: 'second' },
    })
    expect(third.chain.map((preview) => preview.descriptor.title)).toEqual(['Second', 'Third'])
    expect(third.chain[0]?.id).toBe(secondPreview.id)
    expect(third.chain[0]?.position).toEqual(secondPreview.position)
    expect(third.chain[0]?.positionLocked).toBe(true)
    expect(third.chain[0]?.parentId).toBeNull()
    expect(third.chain[1]?.id).toBe(first.chain[0]?.id)
    expect(third.chain[1]?.position).toEqual(first.chain[0]?.position)
    expect(third.chain[1]?.positionLocked).toBe(true)
  })

  test('reuses the existing transient slot when a pin opens another reference', () => {
    const pinnedWithChild = {
      pinned: { descriptor: descriptor('Pinned'), position: { left: 30, top: 70 } },
      chain: [
        {
          ...transient('Existing', 'existing-slot'),
          position: { left: 400, top: 90 },
        },
      ],
    }

    const next = rulesPreviewReducer(pinnedWithChild, {
      type: 'open-child',
      parentId: 'rules-preview-pinned',
      preview: { ...transient('Replacement'), parentId: 'rules-preview-pinned' },
    })

    expect(next.chain[0]).toMatchObject({
      id: 'existing-slot',
      descriptor: { title: 'Replacement' },
      position: { left: 400, top: 90 },
      positionLocked: true,
    })
  })

  test('allows a pin plus two transient levels and transfers the single pin explicitly', () => {
    const pinned = rulesPreviewReducer(initialRulesPreviewState, {
      type: 'pin',
      preview: { descriptor: descriptor('Pinned'), position: { left: 30, top: 70 } },
    })

    const withParent = rulesPreviewReducer(pinned, {
      type: 'open-child',
      parentId: 'rules-preview-pinned',
      preview: { ...transient('Second'), parentId: 'rules-preview-pinned' },
    })
    const withChild = rulesPreviewReducer(withParent, {
      type: 'open-child',
      parentId: 'second',
      preview: { ...transient('Third'), parentId: 'second' },
    })
    expect(withChild.pinned).toBe(pinned.pinned)
    expect(withChild.pinned).toEqual({
      descriptor: descriptor('Pinned'),
      position: { left: 30, top: 70 },
    })
    expect(withChild.chain.map((preview) => preview.descriptor.title)).toEqual(['Second', 'Third'])

    const transferredPin = rulesPreviewReducer(withChild, {
      type: 'pin',
      preview: { descriptor: descriptor('Third'), position: { left: 200, top: 100 } },
    })
    expect(transferredPin.pinned?.descriptor.title).toBe('Third')
    expect(transferredPin.chain).toEqual([])
  })

  test('never replaces a pin when an unrelated root preview opens', () => {
    const pinned = rulesPreviewReducer(initialRulesPreviewState, {
      type: 'pin',
      preview: { descriptor: descriptor('Pinned'), position: { left: 30, top: 70 } },
    })

    const withRoot = rulesPreviewReducer(pinned, {
      type: 'open-root',
      preview: transient('Unrelated'),
    })

    expect(withRoot.pinned).toBe(pinned.pinned)
    expect(withRoot.chain.map((preview) => preview.descriptor.title)).toEqual(['Unrelated'])
  })

  test('closes the newest preview, the remaining chain, and the pin in layers', () => {
    const populated = {
      pinned: { descriptor: descriptor('Pinned'), position: { left: 40, top: 80 } },
      chain: [transient('Parent'), transient('Child')],
    }
    const childClosed = rulesPreviewReducer(populated, { type: 'close-newest' })
    expect(childClosed.chain.map((preview) => preview.descriptor.title)).toEqual(['Parent'])
    expect(childClosed.pinned?.descriptor.title).toBe('Pinned')

    const parentClosed = rulesPreviewReducer(childClosed, { type: 'close-newest' })
    expect(parentClosed.chain).toEqual([])

    const pinnedClosed = rulesPreviewReducer(parentClosed, { type: 'close-pinned' })
    expect(pinnedClosed).toEqual(initialRulesPreviewState)
  })
})
