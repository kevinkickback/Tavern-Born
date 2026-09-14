import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfMocks.getDocument,
}))

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({ default: 'mock-worker.js' }))

import { PdfCanvasPreview } from '@/components/PdfCanvasPreview'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  pdfMocks.getDocument.mockReset()
})

describe('PdfCanvasPreview resource lifecycle', () => {
  test('destroys a pending loading task on unmount', async () => {
    const destroy = vi.fn(async () => undefined)
    pdfMocks.getDocument.mockReturnValue({
      promise: new Promise(() => undefined),
      destroy,
    })

    const view = render(<PdfCanvasPreview pdfBytes={new Uint8Array([1])} />)
    await waitFor(() => expect(pdfMocks.getDocument).toHaveBeenCalledTimes(1))
    view.unmount()

    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('cancels an active render and destroys its document when zoom changes', async () => {
    const cancel = vi.fn()
    const destroy = vi.fn(async () => undefined)
    const renderPage = vi.fn(() => ({ promise: new Promise(() => undefined), cancel }))
    const pdf = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 900 * scale,
          height: 1200 * scale,
        }),
        render: renderPage,
      })),
      destroy,
    }
    pdfMocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy: vi.fn() })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D,
    )
    const bytes = new Uint8Array([1])

    const view = render(<PdfCanvasPreview pdfBytes={bytes} zoom={100} />)
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1))
    view.rerender(<PdfCanvasPreview pdfBytes={bytes} zoom={125} />)

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
