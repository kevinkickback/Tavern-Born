import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MasterDetailProps {
  master: ReactNode
  detail: ReactNode
  inspector?: ReactNode
  masterWidth?: string
  inspectorWidth?: string
  className?: string
  masterClassName?: string
  detailClassName?: string
  inspectorClassName?: string
}

export function MasterDetail({
  master,
  detail,
  inspector,
  masterWidth = '16rem',
  inspectorWidth = '20rem',
  className,
  masterClassName,
  detailClassName,
  inspectorClassName,
}: MasterDetailProps) {
  return (
    <div
      data-slot="master-detail"
      className={cn('grid h-full min-h-0 overflow-hidden', className)}
      style={{
        gridTemplateColumns: inspector
          ? `${masterWidth} minmax(0, 1fr) ${inspectorWidth}`
          : `${masterWidth} minmax(0, 1fr)`,
      }}
    >
      <aside
        className={cn(
          'min-h-0 overflow-auto border-r border-border bg-sidebar/40',
          masterClassName,
        )}
      >
        {master}
      </aside>
      <div className={cn('min-h-0 min-w-0 overflow-auto', detailClassName)}>{detail}</div>
      {inspector && (
        <aside
          className={cn(
            'min-h-0 overflow-auto border-l border-border bg-sidebar/30',
            inspectorClassName,
          )}
        >
          {inspector}
        </aside>
      )}
    </div>
  )
}
