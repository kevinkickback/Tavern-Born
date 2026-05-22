import { ArrowsClockwise, DownloadSimple, Eye, FilePdf } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PdfCanvasPreview } from '@/components/PdfCanvasPreview'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBackgrounds, useClasses, useRaces } from '@/hooks/data/useGameData'
import {
  CHARACTER_SHEET_TEMPLATES,
  type CharacterSheetTemplateId,
  DEFAULT_CHARACTER_SHEET_TEMPLATE,
  generateFilledCharacterSheetPdf,
  getCharacterSheetTemplate,
} from '@/lib/pdf/characterSheetPdf'
import { useCharacterStore } from '@/store/characterStore'
import { NoCharCard } from './_shared'

function getSafeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || 'character'
}

export function CharacterSheetPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const classes = useClasses()
  const races = useRaces()
  const backgrounds = useBackgrounds()
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<CharacterSheetTemplateId>(
    () => character?.originSystem ?? DEFAULT_CHARACTER_SHEET_TEMPLATE.id,
  )
  const cancelRef = useRef<{ canceled: boolean } | null>(null)

  // Cancel any in-flight generation when the component unmounts.
  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current.canceled = true
    }
  }, [])

  useEffect(() => {
    if (character?.originSystem) {
      setSelectedTemplateId(character.originSystem)
      setPdfBytes(null)
      setErrorMessage(null)
    }
  }, [character?.originSystem])

  const selectedTemplate = useMemo(
    () => getCharacterSheetTemplate(selectedTemplateId),
    [selectedTemplateId],
  )

  const characterName = character?.name?.trim() || 'Unnamed Character'
  const downloadName = useMemo(
    () => `${getSafeFileName(characterName)}_character_sheet.pdf`,
    [characterName],
  )

  const handleGenerate = useCallback(async () => {
    if (!character) return

    if (cancelRef.current) {
      cancelRef.current.canceled = true
    }
    const handle = { canceled: false }
    cancelRef.current = handle

    try {
      setIsGenerating(true)
      setErrorMessage(null)

      const response = await fetch(selectedTemplate.assetPath)
      if (!response.ok) {
        throw new Error(`Unable to load PDF template (${response.status} ${response.statusText})`)
      }

      const templateBytes = new Uint8Array(await response.arrayBuffer())
      const filledBytes = await generateFilledCharacterSheetPdf(
        character,
        templateBytes,
        selectedTemplateId,
        classes,
        races,
        backgrounds,
      )

      if (handle.canceled) return

      setPdfBytes(filledBytes)
    } catch (error) {
      console.error('[PDF] generation failed', { error, characterId: character?.id })
      const message =
        error instanceof Error ? error.message : 'Failed to generate character sheet PDF.'
      if (!handle.canceled) {
        setErrorMessage(message)
        setPdfBytes(null)
      }
    } finally {
      if (!handle.canceled) {
        setIsGenerating(false)
      }
    }
  }, [character, classes, races, backgrounds, selectedTemplate, selectedTemplateId])

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

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 page-header-band mb-6 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <FilePdf className="h-6 w-6 text-primary" weight="duotone" />
          <div>
            <h1 className="text-2xl font-display font-bold">Character Sheet</h1>
            <p className="text-sm text-muted-foreground">Export a filled PDF character sheet</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        <div className="max-w-7xl mx-auto w-full space-y-4">
          {/* ── Export Options ── */}
          <Card className="w-full overflow-hidden">
            <div className="h-10 bg-gradient-to-r from-rose-500/20 via-rose-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
              <FilePdf className="h-4 w-4 text-rose-400" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Export Options
              </span>
            </div>
            <div className="p-4 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground shrink-0">Template:</span>
              <Select
                value={selectedTemplateId}
                onValueChange={(value) => {
                  setSelectedTemplateId(value as CharacterSheetTemplateId)
                  setPdfBytes(null)
                  setErrorMessage(null)
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARACTER_SHEET_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="gap-2"
                >
                  <ArrowsClockwise
                    className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`}
                    weight="bold"
                  />
                  {pdfBytes || errorMessage ? 'Regenerate' : 'Generate'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isGenerating || !pdfBytes}
                  className="gap-2"
                >
                  <DownloadSimple className="h-4 w-4" weight="bold" />
                  Download PDF
                </Button>
              </div>
            </div>
          </Card>

          {/* ── PDF Preview ── */}
          <Card className="w-full overflow-hidden">
            <div className="h-10 bg-gradient-to-r from-slate-500/20 via-slate-500/10 to-transparent border-b border-border/40 flex items-center gap-3 px-4 shrink-0">
              <Eye className="h-4 w-4 text-slate-400" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Preview
              </span>
            </div>

            {isGenerating && (
              <div className="flex min-h-[240px] items-center justify-center bg-muted/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowsClockwise className="h-4 w-4 animate-spin" weight="bold" />
                  Generating PDF preview…
                </div>
              </div>
            )}

            {!isGenerating && errorMessage && (
              <div className="flex min-h-[240px] items-center justify-center px-6">
                <div className="max-w-md space-y-3 text-center">
                  <p className="text-sm text-destructive">{errorMessage}</p>
                  <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {!isGenerating && !errorMessage && !pdfBytes && (
              <div className="flex min-h-[240px] items-center justify-center bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  Click Generate to preview your character sheet.
                </p>
              </div>
            )}

            {!isGenerating && !errorMessage && pdfBytes && <PdfCanvasPreview pdfBytes={pdfBytes} />}
          </Card>
        </div>
      </div>
    </div>
  )
}
