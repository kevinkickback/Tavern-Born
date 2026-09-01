import { Sparkle } from '@phosphor-icons/react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { useEffect, useRef, useState } from 'react'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const BASE_RENDER_SCALE = 1.5

interface PdfCanvasPreviewProps {
  pdfBytes: Uint8Array
  zoom?: number
}

export function PdfCanvasPreview({ pdfBytes, zoom = 100 }: PdfCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let canceled = false
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''
    setRendering(true)
    setError(null)

    const render = async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise

        for (let i = 1; i <= pdf.numPages; i++) {
          if (canceled) return

          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: BASE_RENDER_SCALE * (zoom / 100) })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'mx-auto block max-w-none rounded-sm bg-white shadow-md'

          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          await page.render({ canvasContext: ctx, viewport }).promise

          if (canceled) return
          container.appendChild(canvas)
        }
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : 'Failed to render PDF.')
        }
      } finally {
        if (!canceled) setRendering(false)
      }
    }

    render()

    return () => {
      canceled = true
    }
  }, [pdfBytes, zoom])

  if (error) {
    return (
      <div className="flex min-h-full items-center justify-center px-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-full bg-muted/20 p-4">
      {rendering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-workspace-detail/90">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkle className="h-4 w-4 animate-pulse" weight="duotone" />
            Rendering preview…
          </div>
        </div>
      )}
      <div ref={containerRef} className="space-y-4" />
    </div>
  )
}
