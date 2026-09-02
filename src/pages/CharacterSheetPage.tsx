import {
  ArrowsClockwise,
  DownloadSimple,
  FilePdf,
  Minus,
  Plus,
  Warning,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PdfCanvasPreview } from '@/components/PdfCanvasPreview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WorkspaceBody, WorkspacePage, WorkspaceToolbar } from '@/components/workspace'
import { useBackgroundLookup, useClassLookup, useRaceLookup } from '@/hooks/data/useGameData'
import {
  type CharacterSheetTemplateId,
  createCharacterSheetViewModel,
  generateFilledCharacterSheetPdf,
  getCharacterSheetTemplate,
} from '@/lib/pdf/characterSheetPdf'
import { useCharacterStore } from '@/store/characterStore'
import { NoCharCard } from './_shared'

function getSafeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'character'
}

interface CharacterSheetPageProps {
  templateId: CharacterSheetTemplateId
}

export function CharacterSheetPage({ templateId }: CharacterSheetPageProps) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const classesByKey = useClassLookup()
  const racesByKey = useRaceLookup()
  const backgroundsByKey = useBackgroundLookup()
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const cancelRef = useRef<{ canceled: boolean } | null>(null)
  const selectedTemplate = useMemo(() => getCharacterSheetTemplate(templateId), [templateId])
  const viewModel = useMemo(
    () =>
      character
        ? createCharacterSheetViewModel(character, {
            classesByKey,
            racesByKey,
            backgroundsByKey,
          })
        : null,
    [backgroundsByKey, character, classesByKey, racesByKey],
  )

  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current.canceled = true
    }
  }, [])

  const characterName = character?.name?.trim() || 'Unnamed Character'
  const downloadName = useMemo(
    () => `${getSafeFileName(characterName)}_${templateId}_character_sheet.pdf`,
    [characterName, templateId],
  )

  const handleGenerate = useCallback(async () => {
    if (!character || !viewModel) return

    if (cancelRef.current) cancelRef.current.canceled = true
    const handle = { canceled: false }
    cancelRef.current = handle

    try {
      setIsGenerating(true)
      setErrorMessage(null)

      const response = await fetch(import.meta.env.BASE_URL + selectedTemplate.assetPath)
      if (!response.ok) {
        throw new Error(`Unable to load PDF template (${response.status} ${response.statusText})`)
      }

      const templateBytes = new Uint8Array(await response.arrayBuffer())
      const filledBytes = await generateFilledCharacterSheetPdf(
        viewModel,
        templateBytes,
        templateId,
      )

      if (!handle.canceled) setPdfBytes(filledBytes)
    } catch (error) {
      console.error('[PDF] generation failed', { error, characterId: character.id })
      const message =
        error instanceof Error ? error.message : 'Failed to generate character sheet PDF.'
      if (!handle.canceled) {
        setErrorMessage(message)
        setPdfBytes(null)
      }
    } finally {
      if (!handle.canceled) setIsGenerating(false)
    }
  }, [character, selectedTemplate, templateId, viewModel])

  const handleDownload = () => {
    if (!pdfBytes) {
      toast.error('Generate a preview before downloading the sheet.')
      return
    }

    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = downloadName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    toast.success('Character sheet PDF downloaded.')
  }

  if (!character) {
    return <NoCharCard icon={<FilePdf weight="duotone" />} noun="generate a character sheet PDF" />
  }

  const rulesetMismatch = character.originSystem !== templateId
  const editionLabel = templateId === '2014' ? '5e · 2014 rules' : '5.5e · 2024 rules'

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="mx-auto flex w-full max-w-[var(--workspace-collection-max-width)] flex-col overflow-hidden rounded-lg border border-border bg-workspace-pane">
        <WorkspaceToolbar className="overflow-x-auto px-4">
          <FilePdf className="size-5 shrink-0 text-primary" weight="fill" />
          <div className="min-w-0 shrink-0">
            <p className="text-sm font-semibold leading-tight">{selectedTemplate.name}</p>
            <p className="mt-0.5 text-xs leading-tight text-muted-foreground">{editionLabel}</p>
          </div>

          {rulesetMismatch && (
            <Badge variant="outline" className="ml-2 h-6 shrink-0 gap-1.5 text-warning">
              <Warning className="size-3.5" />
              Different from character ruleset
            </Badge>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground" aria-live="polite">
              {isGenerating
                ? 'Generating…'
                : errorMessage
                  ? 'Generation failed'
                  : pdfBytes
                    ? 'Preview ready'
                    : 'Not generated'}
            </span>
            <div className="mr-1 flex h-8 items-center rounded-md border border-border bg-background">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 75}
                onClick={() => setZoom((current) => Math.max(75, current - 25))}
                className="flex size-8 cursor-pointer items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-11 text-center text-xs font-medium tabular-nums">{zoom}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 200}
                onClick={() => setZoom((current) => Math.min(200, current + 25))}
                className="flex size-8 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-8 gap-1.5"
            >
              <ArrowsClockwise
                className={`size-4 ${isGenerating ? 'animate-spin' : ''}`}
                weight="bold"
              />
              {pdfBytes || errorMessage ? 'Regenerate' : 'Generate'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDownload}
              disabled={isGenerating || !pdfBytes}
              className="h-8 gap-1.5"
            >
              <DownloadSimple className="size-4" weight="bold" />
              Download PDF
            </Button>
          </div>
        </WorkspaceToolbar>

        <div className="min-h-0 flex-1 overflow-auto bg-workspace-detail">
          {isGenerating && (
            <div className="flex min-h-full items-center justify-center p-8">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowsClockwise className="size-4 animate-spin" weight="bold" />
                Generating PDF preview…
              </div>
            </div>
          )}

          {!isGenerating && errorMessage && (
            <div className="flex min-h-full items-center justify-center p-8">
              <div className="max-w-md space-y-3 text-center">
                <Warning className="mx-auto size-8 text-destructive" weight="duotone" />
                <p className="text-sm font-semibold">Preview could not be generated</p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
                <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {!isGenerating && !errorMessage && !pdfBytes && (
            <div className="flex min-h-full items-center justify-center p-8">
              <div className="max-w-sm text-center">
                <FilePdf className="mx-auto size-10 text-muted-foreground/45" weight="duotone" />
                <h2 className="mt-3 text-sm font-semibold">Preview not generated</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate a filled {selectedTemplate.name.toLowerCase()} for {characterName}.
                </p>
                <Button type="button" size="sm" onClick={handleGenerate} className="mt-4 gap-1.5">
                  <ArrowsClockwise className="size-4" />
                  Generate Preview
                </Button>
              </div>
            </div>
          )}

          {!isGenerating && !errorMessage && pdfBytes && (
            <PdfCanvasPreview pdfBytes={pdfBytes} zoom={zoom} />
          )}
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
