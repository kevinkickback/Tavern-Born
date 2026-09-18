import { memo } from 'react'

interface RenderedHtmlProps {
  className?: string
  html: string
}

export const RenderedHtml = memo(function RenderedHtml({ className, html }: RenderedHtmlProps) {
  return (
    <div
      className={className}
      // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
