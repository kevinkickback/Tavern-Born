import { Textarea } from '@/components/ui/textarea'
import { FormattedTextRenderer } from './FormattedTextRenderer'
import { Eye, PencilSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useState, ReactNode } from 'react'
import { Card } from '@/components/ui/card'

interface RichTextAreaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  label?: ReactNode
  helpText?: string
  id?: string
}

export function RichTextArea({
  value,
  onChange,
  placeholder,
  rows = 6,
  label,
  helpText,
  id,
}: RichTextAreaProps) {
  const [previewMode, setPreviewMode] = useState(false)

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className="h-7 text-xs gap-1.5"
          >
            {previewMode ? (
              <>
                <PencilSimple className="h-3.5 w-3.5" />
                Edit
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                Preview
              </>
            )}
          </Button>
        </div>
      )}

      {previewMode ? (
        <Card className="p-4 min-h-[150px] bg-muted/30">
          {value ? (
            <FormattedTextRenderer text={value} />
          ) : (
            <p className="text-muted-foreground italic">{placeholder || 'No content yet'}</p>
          )}
        </Card>
      ) : (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="resize-none font-mono text-sm"
        />
      )}

      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  )
}
