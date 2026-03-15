export function renderEntry(entry: any): string {
  if (typeof entry === 'string') {
    return renderTags(entry)
  }
  
  if (typeof entry === 'object') {
    if (entry.type === 'entries') {
      let result = ''
      if (entry.name) {
        result += `<strong>${entry.name}</strong> `
      }
      if (entry.entries) {
        result += entry.entries.map(renderEntry).join(' ')
      }
      return result
    }
    
    if (entry.type === 'list') {
      const items = entry.items.map((item: any) => `<li>${renderEntry(item)}</li>`).join('')
      return `<ul>${items}</ul>`
    }
    
    if (entry.type === 'table') {
      return '[Table]'
    }
    
    if (entry.type === 'inset') {
      return entry.entries ? entry.entries.map(renderEntry).join(' ') : ''
    }
  }
  
  return ''
}

export function renderTags(text: string): string {
  if (!text) return ''
  
  let result = text
  
  result = result.replace(/{@dice ([^}]+)}/g, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-accent/20 text-accent-foreground">$1</span>')
  result = result.replace(/{@damage ([^}]+)}/g, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-destructive/20 text-destructive-foreground">$1</span>')
  result = result.replace(/{@hit ([^}]+)}/g, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-primary/20 text-primary-foreground">+$1</span>')
  result = result.replace(/{@dc ([^}]+)}/g, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-primary/20 text-primary-foreground">DC $1</span>')
  
  result = result.replace(/{@creature ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-accent font-medium italic cursor-help" title="Creature: $1">$1</span>')
  result = result.replace(/{@spell ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-primary font-medium italic cursor-help" title="Spell: $1">$1</span>')
  result = result.replace(/{@item ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-accent font-medium italic cursor-help" title="Item: $1">$1</span>')
  result = result.replace(/{@condition ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-destructive font-medium italic cursor-help" title="Condition: $1">$1</span>')
  result = result.replace(/{@sense ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-primary font-medium italic cursor-help" title="Sense: $1">$1</span>')
  result = result.replace(/{@skill ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-primary font-medium italic cursor-help" title="Skill: $1">$1</span>')
  result = result.replace(/{@action ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-accent font-medium italic cursor-help" title="Action: $1">$1</span>')
  result = result.replace(/{@atk ([^}]+)}/g, '<span class="text-primary font-medium italic">$1</span>')
  result = result.replace(/{@feat ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-accent font-medium italic cursor-help" title="Feat: $1">$1</span>')
  result = result.replace(/{@background ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-secondary font-medium italic cursor-help" title="Background: $1">$1</span>')
  result = result.replace(/{@race ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-secondary font-medium italic cursor-help" title="Race: $1">$1</span>')
  result = result.replace(/{@class ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-secondary font-medium italic cursor-help" title="Class: $1">$1</span>')
  result = result.replace(/{@deity ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-accent font-medium italic cursor-help" title="Deity: $1">$1</span>')
  result = result.replace(/{@language ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-muted-foreground font-medium italic cursor-help" title="Language: $1">$1</span>')
  
  result = result.replace(/{@h}/g, '<em class="text-primary">Hit:</em>')
  result = result.replace(/{@recharge ([^}]+)}/g, '<span class="text-muted-foreground">(Recharge $1-6)</span>')
  result = result.replace(/{@recharge}/g, '<span class="text-muted-foreground">(Recharge 5-6)</span>')
  
  result = result.replace(/{@ability ([^}]+)}/g, (_, content) => {
    const parts = content.split(' ')
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-secondary/30 text-secondary-foreground">${parts.join(' ')}</span>`
  })
  
  result = result.replace(/{@b ([^}]+)}/g, '<strong class="font-semibold text-foreground">$1</strong>')
  result = result.replace(/{@i ([^}]+)}/g, '<em class="italic">$1</em>')
  result = result.replace(/{@note ([^}]+)}/g, '<span class="text-sm text-muted-foreground italic">($1)</span>')
  result = result.replace(/{@chance ([^}]+)}/g, '<span class="font-mono text-sm">$1%</span>')
  result = result.replace(/{@quickref ([^|]+)\|([^|]+)(?:\|[^}]+)?}/g, '<span class="text-primary font-medium cursor-help underline decoration-dotted" title="Quick Reference">$1</span>')
  result = result.replace(/{@filter ([^|}]+)(?:\|[^}]*)?}/g, '<span class="text-muted-foreground">$1</span>')
  result = result.replace(/{@scaledice ([^}]+)}/g, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-accent/20 text-accent-foreground">$1</span>')
  result = result.replace(/{@scaledamage ([^}]+)}/g, '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-destructive/20 text-destructive-foreground">$1</span>')
  result = result.replace(/{@footnote ([^}]+)}/g, '<sup class="text-xs text-muted-foreground cursor-help" title="$1">*</sup>')
  
  result = result.replace(/\n\n/g, '</p><p class="mt-3">')
  result = result.replace(/\n/g, '<br />')
  
  result = `<p>${result}</p>`
  
  return result
}

export function extractPlainText(entry: any): string {
  const html = renderEntry(entry)
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
