import * as DialogPrimitive from '@radix-ui/react-dialog'
import XIcon from 'lucide-react/dist/esm/icons/x'
import { type ComponentProps, createContext, type RefCallback, useContext } from 'react'
import { cn } from '@/lib/utils'
import { DialogPortalContext } from './dialogPortalContext'

const DialogModalContext = createContext(true)

function Dialog({ modal = true, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <DialogModalContext.Provider value={modal}>
      <DialogPrimitive.Root data-slot="dialog" modal={modal} {...props} />
    </DialogModalContext.Provider>
  )
}

function DialogTrigger({ ...props }: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('dialog-viewport fixed inset-0 z-50 bg-black/50', className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  onInteractOutside,
  closeDisabled = false,
  viewportPortalHostRef,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  closeDisabled?: boolean
  viewportPortalHostRef?: RefCallback<HTMLDivElement>
}) {
  const portal = useContext(DialogPortalContext)
  const modal = useContext(DialogModalContext)
  const content = (
    <DialogPrimitive.Content
      data-slot="dialog-content"
      onInteractOutside={(event) => {
        onInteractOutside?.(event)
        if (event.defaultPrevented) return
        const originalTarget = event.detail.originalEvent.target
        const target = originalTarget instanceof Element ? originalTarget : event.target
        if (target instanceof Element && portal?.isAuxiliarySurface(target)) {
          event.preventDefault()
        }
      }}
      className={cn(
        'bg-background z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
        modal && 'relative min-h-0 overflow-y-auto',
        !modal && 'fixed',
        !modal &&
          (viewportPortalHostRef
            ? 'inset-0 m-auto h-fit'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'),
        viewportPortalHostRef
          ? 'data-[state=open]:animate-[modal-preview-enter_200ms_ease-out] data-[state=closed]:animate-[modal-preview-exit_200ms_ease-in]'
          : 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
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
      {viewportPortalHostRef && (
        <div
          ref={viewportPortalHostRef}
          data-slot="dialog-viewport-portal-host"
          className="pointer-events-none fixed inset-0"
        />
      )}
    </DialogPrimitive.Content>
  )

  return (
    <DialogPortal
      data-slot="dialog-portal"
      container={viewportPortalHostRef ? undefined : (portal?.container ?? undefined)}
    >
      {modal ? <DialogOverlay>{content}</DialogOverlay> : content}
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

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
