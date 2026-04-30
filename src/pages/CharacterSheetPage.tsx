import { ArrowsClockwise, DownloadSimple, Eye, FilePdf, Sparkle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
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
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [selectedTemplateId, setSelectedTemplateId] = useState<CharacterSheetTemplateId>(
    () => character?.originSystem ?? DEFAULT_CHARACTER_SHEET_TEMPLATE.id,
  )

  useEffect(() => {
    if (character?.originSystem) {
      setSelectedTemplateId(character.originSystem)
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

  useEffect(() => {
    let canceled = false

    const buildPreview = async () => {
      if (!character) {
        setPdfBytes(null)
        setErrorMessage(null)
        return
      }

      try {
        setIsGenerating(true)
        setErrorMessage(null)

        const templateUrl = `${selectedTemplate.assetPath}?r=${refreshNonce}`
        const response = await fetch(templateUrl)
        if (!response.ok) {
          throw new Error(`Unable to load PDF template (${response.status} ${response.statusText})`)
        }

        const templateBytes = new Uint8Array(await response.arrayBuffer())
        const filledBytes = await generateFilledCharacterSheetPdf(
          character,
          templateBytes,
          selectedTemplateId,
        )

        if (canceled) return

        setPdfBytes(filledBytes)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to generate character sheet PDF.'
        if (!canceled) {
          setErrorMessage(message)
          setPdfBytes(null)
        }
      } finally {
        if (!canceled) {
          setIsGenerating(false)
        }
      }
    }

    buildPreview()

    return () => {
      canceled = true
    }
  }, [character, refreshNonce, selectedTemplate, selectedTemplateId])

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
    <div>
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <FilePdf className="h-6 w-6 text-primary" weight="duotone" />
          <div>
            <h1 className="text-2xl font-display font-bold">Character Sheet</h1>
            <p className="text-sm text-muted-foreground">Export a filled PDF character sheet</p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
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
                onValueChange={(value) => setSelectedTemplateId(value as CharacterSheetTemplateId)}
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
                  onClick={() => setRefreshNonce((n) => n + 1)}
                  disabled={isGenerating}
                  className="gap-2"
                >
                  <ArrowsClockwise className="h-4 w-4" weight="bold" />
                  Regenerate
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
              <div className="flex h-[70vh] items-center justify-center bg-muted/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkle className="h-4 w-4 animate-pulse" weight="duotone" />
                  Generating PDF preview…
                </div>
              </div>
            )}

            {!isGenerating && errorMessage && (
              <div className="flex h-[70vh] items-center justify-center px-6">
                <div className="max-w-md space-y-3 text-center">
                  <p className="text-sm text-destructive">{errorMessage}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRefreshNonce((n) => n + 1)}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {!isGenerating && !errorMessage && pdfBytes && <PdfCanvasPreview pdfBytes={pdfBytes} />}
          </Card>
        </div>
      </div>
    </div>
  )
}
