import * as DialogPrimitive from '@radix-ui/react-dialog'
import XIcon from 'lucide-react/dist/esm/icons/x'
import type { ComponentProps, RefCallback } from 'react'
import { useRulesPreview } from '@/components/editor/RulesPreviewManager'

import { cn } from '@/lib/utils'

function Dialog({ ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({ ...props }: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  onInteractOutside,
  closeDisabled = false,
  rulesPreviewPortalRef,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  closeDisabled?: boolean
  rulesPreviewPortalRef?: RefCallback<HTMLDivElement>
}) {
  const { portalContainer } = useRulesPreview()
  return (
    <DialogPortal
      data-slot="dialog-portal"
      container={rulesPreviewPortalRef ? undefined : (portalContainer ?? undefined)}
    >
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onInteractOutside={(event) => {
          onInteractOutside?.(event)
          if (event.defaultPrevented) return
          const originalTarget = event.detail.originalEvent.target
          const target = originalTarget instanceof Element ? originalTarget : event.target
          if (target instanceof Element && target.closest('[data-rules-preview-layer]')) {
            event.preventDefault()
          }
        }}
        className={cn(
          'bg-background fixed z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          rulesPreviewPortalRef
            ? 'inset-0 m-auto h-fit data-[state=open]:animate-[modal-preview-enter_200ms_ease-out] data-[state=closed]:animate-[modal-preview-exit_200ms_ease-in]'
            : 'top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          disabled={closeDisabled}
          className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        {rulesPreviewPortalRef && (
          <div
            ref={rulesPreviewPortalRef}
            data-rules-preview-host
            className="pointer-events-none fixed inset-0"
          />
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle }
