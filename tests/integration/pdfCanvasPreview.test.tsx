import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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
  test('renders replacement bytes after a preview error', async () => {
    const destroyFailed = vi.fn(async () => undefined)
    pdfMocks.getDocument
      .mockReturnValueOnce({
        promise: Promise.reject(new Error('Could not read the PDF.')),
        destroy: destroyFailed,
      })
      .mockReturnValueOnce({
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn(async () => ({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 900 * scale,
              height: 1200 * scale,
            }),
            render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
          })),
        }),
        destroy: vi.fn(async () => undefined),
      })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D,
    )

    const view = render(<PdfCanvasPreview pdfBytes={new Uint8Array([1])} />)
    expect(await screen.findByText('Could not read the PDF.')).toBeTruthy()

    view.rerender(<PdfCanvasPreview pdfBytes={new Uint8Array([2])} />)
    await waitFor(() => expect(view.container.querySelector('canvas')).toBeTruthy())
    expect(screen.queryByText('Could not read the PDF.')).toBeNull()
    expect(pdfMocks.getDocument).toHaveBeenLastCalledWith({ data: new Uint8Array([2]) })
    expect(destroyFailed).toHaveBeenCalledTimes(1)
  })

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

  test('does not start painting a page that arrives after unmount', async () => {
    const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 900 * scale,
        height: 1200 * scale,
      }),
      render: renderPage,
    }
    let resolvePage!: (value: typeof page) => void
    const pendingPage = new Promise<typeof page>((resolve) => {
      resolvePage = resolve
    })
    const getPage = vi.fn(() => pendingPage)
    const destroy = vi.fn(async () => undefined)
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage }),
      destroy,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as CanvasRenderingContext2D,
    )

    const view = render(<PdfCanvasPreview pdfBytes={new Uint8Array([1])} />)
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(1))
    view.unmount()
    await act(async () => resolvePage(page))

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(renderPage).not.toHaveBeenCalled()
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
    }
    pdfMocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy })
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
