import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function NoCharCard({ icon, noun }: { icon: ReactNode; noun: string }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Card className="p-8 text-center max-w-md w-full">
        <div className="h-16 w-16 mx-auto mb-4 text-muted-foreground [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
        <p className="text-muted-foreground">Please select or create a character to {noun}.</p>
      </Card>
    </div>
  )
}
