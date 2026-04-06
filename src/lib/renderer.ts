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

    if (entryObj.type === 'refSubclassFeature') {
      // Inline subclass feature reference. BuildClassPage resolves and filters these
      // against the selected subclass before rendering; this is a defensive fallback
      // for any unresolved refs that reach the renderer directly.
      const featureName =
        typeof entryObj.subclassFeature === 'string'
          ? (entryObj.subclassFeature.split('|')[0] ?? '')
          : typeof (entryObj as { name?: unknown }).name === 'string'
            ? (entryObj as { name: string }).name
            : '';
      return featureName
        ? `<em class="text-muted-foreground text-sm">${featureName}</em>`
        : '';
    }
  }

  return '';
}

export function renderTags(text: string): string {
  if (!text) return '';

  let result = text;
  const toAttr = (value: string) => value.replace(/"/g, '&quot;');
  const pickDisplay = (name: string, display?: string) =>
    display?.trim() ? display : name;

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
    /{@creature ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'MM');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Creature: ${safeName}" data-hover-type="creature" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@spell ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-primary font-medium italic cursor-help" title="Spell: ${safeName}" data-hover-type="spell" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@item ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'DMG');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Item: ${safeName}" data-hover-type="item" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@condition ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-destructive font-medium italic cursor-help" title="Condition: ${safeName}" data-hover-type="condition" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@sense ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-primary font-medium italic cursor-help" title="Sense: ${safeName}" data-hover-type="sense" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@skill ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-primary font-medium italic cursor-help" title="Skill: ${safeName}" data-hover-type="skill" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@action ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Action: ${safeName}" data-hover-type="action" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@atk ([^}]+)}/g,
    '<span class="text-primary font-medium italic">$1</span>',
  );
  result = result.replace(
    /{@feat ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Feat: ${safeName}" data-hover-type="feat" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@background ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-secondary font-medium italic cursor-help" title="Background: ${safeName}" data-hover-type="background" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@race ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-secondary font-medium italic cursor-help" title="Race: ${safeName}" data-hover-type="race" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@class ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-secondary font-medium italic cursor-help" title="Class: ${safeName}" data-hover-type="class" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@deity ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Deity: ${safeName}" data-hover-type="deity" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@language ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-muted-foreground font-medium italic cursor-help" title="Language: ${safeName}" data-hover-type="language" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@optfeature ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Optional Feature: ${safeName}" data-hover-type="optionalfeature" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
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
    /{@variantrule ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'DMG');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Variant Rule: ${safeName}" data-hover-type="variantrule" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@trap ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'DMG');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-destructive font-medium italic cursor-help" title="Trap: ${safeName}" data-hover-type="trap" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@hazard ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'DMG');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-destructive font-medium italic cursor-help" title="Hazard: ${safeName}" data-hover-type="hazard" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@vehicle ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'GoS');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-secondary font-medium italic cursor-help" title="Vehicle: ${safeName}" data-hover-type="vehicle" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@object ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'DMG');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-secondary font-medium italic cursor-help" title="Object: ${safeName}" data-hover-type="object" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@reward ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'DMG');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-accent font-medium italic cursor-help" title="Reward: ${safeName}" data-hover-type="reward" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
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
    /{@status ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'PHB');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-destructive font-medium italic cursor-help" title="Status: ${safeName}" data-hover-type="status" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
  );
  result = result.replace(
    /{@table ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/g,
    (_m, name: string, source?: string, display?: string) => {
      const safeName = toAttr(name);
      const safeSource = toAttr(source || 'DMG');
      const safeDisplay = pickDisplay(name, display);
      return `<span class="text-muted-foreground font-medium cursor-help" title="Table: ${safeName}" data-hover-type="table" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
    },
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
