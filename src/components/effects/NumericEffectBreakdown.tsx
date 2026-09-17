import type { ResolvedNumericEffect } from '@/lib/calculations/effects'

interface NumericEffectBreakdownProps {
  title?: string
  resolution: ResolvedNumericEffect
  baseComponents?: ReadonlyArray<{
    id: string
    label: string
    detail?: string
    value: number
  }>
}

function formatOperation(kind: string, value: number): string {
  if (kind === 'add') return `${value >= 0 ? '+' : ''}${value}`
  if (kind === 'multiply') return `× ${value}`
  if (kind === 'minimum') return `minimum ${value}`
  if (kind === 'maximum') return `maximum ${value}`
  if (kind === 'override') return `exactly ${value}`
  return `${kind} ${value}`
}

/** Presents the resolver's own trace; it never recalculates or infers a rule. */
export function NumericEffectBreakdown({
  title = 'Saved calculation',
  resolution,
  baseComponents,
}: NumericEffectBreakdownProps) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-workspace-pane p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-sm font-semibold tabular-nums">{resolution.value}</span>
      </div>
      <div className="space-y-1 text-xs">
        {baseComponents?.map((component) => (
          <div key={component.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="font-medium">{component.label}</span>
              {component.detail && (
                <span className="text-muted-foreground"> · {component.detail}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {component.value >= 0 ? '+' : ''}
              {component.value}
            </span>
          </div>
        )) ?? (
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>Calculated base</span>
            <span className="tabular-nums">{resolution.baseValue}</span>
          </div>
        )}
        {baseComponents && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-1 text-muted-foreground">
            <span>Calculated base</span>
            <span className="tabular-nums">{resolution.baseValue}</span>
          </div>
        )}
        {resolution.steps.map((step) => (
          <div key={step.effectId} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="font-medium">{step.label}</span>
              <span className="text-muted-foreground"> · {step.source.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatOperation(step.operation.kind, step.operation.value)} → {step.valueAfter}
            </span>
          </div>
        ))}
        {resolution.steps.length === 0 && (
          <p className="text-muted-foreground">No active adjustments.</p>
        )}
        {resolution.inactiveEffects.length > 0 && (
          <details className="pt-1 text-muted-foreground">
            <summary className="cursor-pointer">
              {resolution.inactiveEffects.length} inactive adjustment
              {resolution.inactiveEffects.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-1 space-y-1 pl-4">
              {resolution.inactiveEffects.map((effect) => (
                <li key={effect.id}>{effect.label}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
