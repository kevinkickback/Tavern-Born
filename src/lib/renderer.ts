export function renderEntry(entry: unknown): string {
  if (typeof entry === 'string') {
    return renderTags(entry);
  }

  if (typeof entry === 'object' && entry !== null) {
    const entryObj = entry as {
      type?: string;
      name?: string;
      entries?: unknown[];
      items?: unknown[];
      caption?: string;
      colLabels?: string[];
      rows?: unknown[][];
    };
    if (entryObj.type === 'entries') {
      let result = '';
      if (entryObj.name) {
        result += `<strong>${entryObj.name}</strong> `;
      }
      if (entryObj.entries) {
        result += entryObj.entries.map(renderEntry).join(' ');
      }
      return result;
    }

    if (entryObj.type === 'list') {
      const items = (entryObj.items ?? [])
        .map((item) => `<li>${renderEntry(item)}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    }

    if (entryObj.type === 'table') {
      const caption = entryObj.caption
        ? `<caption class="text-sm font-semibold text-left mb-1 text-muted-foreground">${entryObj.caption}</caption>`
        : '';
      const headers = (entryObj.colLabels ?? [])
        .map(
          (h: string) =>
            `<th class="border border-border bg-muted p-2 text-left font-semibold text-xs uppercase tracking-wide">${renderTags(h)}</th>`,
        )
        .join('');
      const thead = headers ? `<thead><tr>${headers}</tr></thead>` : '';
      const tbody = (entryObj.rows ?? [])
        .map((row) => {
          const cells = row
            .map(
              (cell) =>
                `<td class="border border-border p-2 text-sm">${renderEntry(cell)}</td>`,
            )
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<table class="w-full border-collapse my-3">${caption}${thead}<tbody>${tbody}</tbody></table>`;
    }

    if (entryObj.type === 'inset') {
      return entryObj.entries
        ? entryObj.entries.map(renderEntry).join(' ')
        : '';
    }
  }

  return '';
}

export function renderTags(text: string): string {
  if (!text) return '';

  let result = text;

  result = result.replace(
    /{@dice ([^}]+)}/g,
    '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-accent/20 text-accent-foreground">$1</span>',
  );
  result = result.replace(
    /{@damage ([^}]+)}/g,
    '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-destructive/20 text-destructive-foreground">$1</span>',
  );
  result = result.replace(
    /{@hit ([^}]+)}/g,
    '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-primary/20 text-primary-foreground">+$1</span>',
  );
  result = result.replace(
    /{@dc ([^}]+)}/g,
    '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-primary/20 text-primary-foreground">DC $1</span>',
  );

  result = result.replace(
    /{@creature ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent font-medium italic cursor-help" title="Creature: $1">$1</span>',
  );
  result = result.replace(
    /{@spell ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-primary font-medium italic cursor-help" title="Spell: $1">$1</span>',
  );
  result = result.replace(
    /{@item ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent font-medium italic cursor-help" title="Item: $1">$1</span>',
  );
  result = result.replace(
    /{@condition ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-destructive font-medium italic cursor-help" title="Condition: $1">$1</span>',
  );
  result = result.replace(
    /{@sense ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-primary font-medium italic cursor-help" title="Sense: $1">$1</span>',
  );
  result = result.replace(
    /{@skill ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-primary font-medium italic cursor-help" title="Skill: $1">$1</span>',
  );
  result = result.replace(
    /{@action ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent font-medium italic cursor-help" title="Action: $1">$1</span>',
  );
  result = result.replace(
    /{@atk ([^}]+)}/g,
    '<span class="text-primary font-medium italic">$1</span>',
  );
  result = result.replace(
    /{@feat ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent font-medium italic cursor-help" title="Feat: $1">$1</span>',
  );
  result = result.replace(
    /{@background ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-secondary font-medium italic cursor-help" title="Background: $1">$1</span>',
  );
  result = result.replace(
    /{@race ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-secondary font-medium italic cursor-help" title="Race: $1">$1</span>',
  );
  result = result.replace(
    /{@class ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-secondary font-medium italic cursor-help" title="Class: $1">$1</span>',
  );
  result = result.replace(
    /{@deity ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent font-medium italic cursor-help" title="Deity: $1">$1</span>',
  );
  result = result.replace(
    /{@language ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-muted-foreground font-medium italic cursor-help" title="Language: $1">$1</span>',
  );

  result = result.replace(/{@h}/g, '<em class="text-primary">Hit:</em>');
  result = result.replace(
    /{@recharge ([^}]+)}/g,
    '<span class="text-muted-foreground">(Recharge $1-6)</span>',
  );
  result = result.replace(
    /{@recharge}/g,
    '<span class="text-muted-foreground">(Recharge 5-6)</span>',
  );

  result = result.replace(/{@ability ([^}]+)}/g, (_, content) => {
    const parts = content.split(' ');
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-secondary/30 text-secondary-foreground">${parts.join(' ')}</span>`;
  });

  result = result.replace(
    /{@b ([^}]+)}/g,
    '<strong class="font-semibold text-foreground">$1</strong>',
  );
  result = result.replace(/{@i ([^}]+)}/g, '<em class="italic">$1</em>');
  result = result.replace(
    /{@note ([^}]+)}/g,
    '<span class="text-sm text-muted-foreground italic">($1)</span>',
  );
  result = result.replace(
    /{@chance ([^}]+)}/g,
    '<span class="font-mono text-sm">$1%</span>',
  );
  result = result.replace(
    /{@quickref ([^|]+)\|([^|]+)(?:\|[^}]+)?}/g,
    '<span class="text-primary font-medium cursor-help underline decoration-dotted" title="Quick Reference">$1</span>',
  );
  result = result.replace(
    /{@filter ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-muted-foreground">$1</span>',
  );
  result = result.replace(
    /{@scaledice ([^}]+)}/g,
    '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-accent/20 text-accent-foreground">$1</span>',
  );
  result = result.replace(
    /{@scaledamage ([^}]+)}/g,
    '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-destructive/20 text-destructive-foreground">$1</span>',
  );
  result = result.replace(
    /{@footnote ([^}]+)}/g,
    '<sup class="text-xs text-muted-foreground cursor-help" title="$1">*</sup>',
  );

  result = result.replace(
    /{@book ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-muted-foreground italic" title="Book">$1</span>',
  );
  result = result.replace(
    /{@adventure ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-muted-foreground italic" title="Adventure">$1</span>',
  );
  result = result.replace(
    /{@variantrule ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent font-medium italic cursor-help" title="Variant Rule: $1">$1</span>',
  );
  result = result.replace(
    /{@trap ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-destructive font-medium italic cursor-help" title="Trap: $1">$1</span>',
  );
  result = result.replace(
    /{@hazard ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-destructive font-medium italic cursor-help" title="Hazard: $1">$1</span>',
  );
  result = result.replace(
    /{@vehicle ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-secondary font-medium italic cursor-help" title="Vehicle: $1">$1</span>',
  );
  result = result.replace(
    /{@object ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-secondary font-medium italic cursor-help" title="Object: $1">$1</span>',
  );
  result = result.replace(
    /{@reward ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent font-medium italic cursor-help" title="Reward: $1">$1</span>',
  );
  result = result.replace(
    /{@area ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-muted-foreground font-medium" title="Area: $1">$1</span>',
  );
  result = result.replace(
    /{@card ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent italic" title="Card: $1">$1</span>',
  );
  result = result.replace(
    /{@deck ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-accent italic" title="Deck: $1">$1</span>',
  );
  result = result.replace(
    /{@link ([^|}]+)\|([^}]+)}/g,
    '<a href="$2" class="text-primary underline cursor-pointer">$1</a>',
  );
  result = result.replace(
    /{@5etools ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-primary font-medium" title="5etools">$1</span>',
  );
  result = result.replace(
    /{@coinflip}/g,
    '<span class="font-mono text-sm text-accent" title="Coin flip">🪙</span>',
  );
  result = result.replace(
    /{@itemProperty ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-xs font-mono bg-secondary/20 px-1 rounded" title="Item Property: $1">$1</span>',
  );
  result = result.replace(
    /{@status ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-destructive font-medium italic cursor-help" title="Status: $1">$1</span>',
  );
  result = result.replace(
    /{@table ([^|}]+)(?:\|[^}]*)?}/g,
    '<span class="text-muted-foreground font-medium" title="Table: $1">$1</span>',
  );

  // Catch-all: strip any remaining unrecognized tags, showing just the display text
  result = result.replace(/\{@[a-zA-Z]+ ([^|}]+)(?:\|[^}]*)?\}/g, '$1');

  result = result.replace(/\n\n/g, '</p><p class="mt-3">');
  result = result.replace(/\n/g, '<br />');

  result = `<p>${result}</p>`;

  return result;
}

export function extractPlainText(entry: unknown): string {
  const html = renderEntry(entry);
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
