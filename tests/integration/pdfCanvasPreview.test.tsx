import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PdfCanvasPreview } from '@/components/PdfCanvasPreview'

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMocks.getDocument,
}))

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({
  default: 'pdf.worker.mjs',
}))

function mockPdfPage(width: number, height: number) {
  const renderPage = vi.fn(() => ({ promise: Promise.resolve() }))
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: width * scale,
    height: height * scale,
  }))

  pdfMocks.getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(async () => ({ getViewport, render: renderPage })),
    }),
  })

  return { getViewport, renderPage }
}

describe('PDF canvas preview scaling', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D,
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    pdfMocks.getDocument.mockReset()
  })

  test.each([
    ['2014 template', 595.274, 792.004],
    ['2024 template', 1700, 2200],
  ])('normalizes the %s to the same width at 100%%', async (_name, width, height) => {
    const { getViewport } = mockPdfPage(width, height)
    const { container } = render(<PdfCanvasPreview pdfBytes={new Uint8Array([1])} />)

    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull())

    const canvas = container.querySelector('canvas')
    expect(canvas?.style.width).toBe('900px')
    expect(canvas?.width).toBe(900)
    expect(getViewport).toHaveBeenNthCalledWith(1, { scale: 1 })
    expect(getViewport).toHaveBeenNthCalledWith(2, { scale: 900 / width })
  })

  test('applies zoom to display size and device pixel ratio to render resolution', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    const { renderPage } = mockPdfPage(1700, 2200)
    const { container } = render(<PdfCanvasPreview pdfBytes={new Uint8Array([1])} zoom={125} />)

    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull())

    const canvas = container.querySelector('canvas')
    expect(canvas?.style.width).toBe('1125px')
    expect(canvas?.width).toBe(2250)
    expect(renderPage).toHaveBeenCalledWith(
      expect.objectContaining({ transform: [2, 0, 0, 2, 0, 0] }),
    )
  })
})
