import DOMPurify from 'dompurify';

// Keep renderer styling classes flexible, while rejecting unrelated class names
// from external content.
const ALLOWED_RENDERER_CLASS_PATTERNS = [
  /^(?:inline-flex|items-center|rounded|italic|underline|uppercase)$/,
  /^(?:cursor-help|cursor-pointer)$/,
  /^(?:border|border-collapse|border-border)$/,
  /^(?:font-medium|font-mono|font-semibold)$/,
  /^(?:tracking-wide|decoration-dotted)$/,
  /^w-full$/,
  /^text-left$/,
  /^text-(?:xs|sm|foreground|muted-foreground|accent|accent-foreground|primary|primary-foreground|secondary|secondary-foreground|destructive|destructive-foreground)$/,
  /^bg-(?:accent|destructive|primary|secondary)(?:\/\d+)?$/,
  /^bg-muted$/,
  /^[mp][trblxy]?-(?:\d+(?:\.\d+)?)$/,
];

function isAllowedRendererClassToken(token: string): boolean {
  return ALLOWED_RENDERER_CLASS_PATTERNS.some((pattern) => pattern.test(token));
}

function sanitizeRendererClasses(html: string): string {
  return html.replace(/\sclass="([^"]*)"/g, (_match, classList: string) => {
    const filtered = classList
      .split(/\s+/)
      .filter((token) => isAllowedRendererClassToken(token));

    return filtered.length > 0 ? ` class="${filtered.join(' ')}"` : '';
  });
}

function sanitizeRenderedHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a',
      'b',
      'br',
      'caption',
      'code',
      'em',
      'h1',
      'h2',
      'h3',
      'h4',
      'i',
      'li',
      'ol',
      'p',
      'pre',
      'span',
      'strong',
      'sup',
      'table',
      'tbody',
      'td',
      'th',
      'thead',
      'tr',
      'ul',
    ],
    ALLOWED_ATTR: [
      'class',
      'data-hover-name',
      'data-hover-source',
      'data-hover-type',
      'href',
      'target',
      'title',
    ],
    ALLOW_DATA_ATTR: false,
  });

  return sanitizeRendererClasses(sanitized);
}

export function renderEntry(entry: unknown): string {
  if (typeof entry === 'string') {
    return sanitizeRenderedHtml(renderTags(entry));
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
      return sanitizeRenderedHtml(result);
    }

    if (entryObj.type === 'list') {
      const items = (entryObj.items ?? [])
        .map((item) => `<li>${renderEntry(item)}</li>`)
        .join('');
      return sanitizeRenderedHtml(`<ul>${items}</ul>`);
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
      return sanitizeRenderedHtml(
        `<table class="w-full border-collapse my-3">${caption}${thead}<tbody>${tbody}</tbody></table>`,
      );
    }

    if (entryObj.type === 'inset') {
      return sanitizeRenderedHtml(
        entryObj.entries ? entryObj.entries.map(renderEntry).join(' ') : '',
      );
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
      return sanitizeRenderedHtml(
        featureName
          ? `<em class="text-muted-foreground text-sm">${featureName}</em>`
          : '',
      );
    }
  }

  return sanitizeRenderedHtml('');
}

export function renderTags(text: string): string {
  if (!text) return '';

  let result = text;
  const toAttr = (value: string) => value.replace(/"/g, '&quot;');
  const pickDisplay = (name: string, display?: string) =>
    display?.trim() ? display : name;
  const renderEntityTag = (
    tagName: string,
    defaultSource: string,
    cssClass: string,
    hoverType: string,
    titlePrefix: string,
  ) => {
    const pattern = new RegExp(
      `\\{@${tagName} ([^|}]+)(?:\\|([^|}]*))?(?:\\|([^}]*))?}`,
      'g',
    );
    return (input: string) =>
      input.replace(
        pattern,
        (_m, name: string, source?: string, display?: string) => {
          const safeName = toAttr(name);
          const safeSource = toAttr(source || defaultSource);
          const safeDisplay = pickDisplay(name, display);
          return `<span class="${cssClass}" title="${titlePrefix}: ${safeName}" data-hover-type="${hoverType}" data-hover-name="${safeName}" data-hover-source="${safeSource}">${safeDisplay}</span>`;
        },
      );
  };

  const entityTagRenderers = [
    renderEntityTag(
      'creature',
      'MM',
      'text-accent font-medium italic cursor-help',
      'creature',
      'Creature',
    ),
    renderEntityTag(
      'spell',
      'PHB',
      'text-primary font-medium italic cursor-help',
      'spell',
      'Spell',
    ),
    renderEntityTag(
      'item',
      'DMG',
      'text-accent font-medium italic cursor-help',
      'item',
      'Item',
    ),
    renderEntityTag(
      'condition',
      'PHB',
      'text-destructive font-medium italic cursor-help',
      'condition',
      'Condition',
    ),
    renderEntityTag(
      'sense',
      'PHB',
      'text-primary font-medium italic cursor-help',
      'sense',
      'Sense',
    ),
    renderEntityTag(
      'skill',
      'PHB',
      'text-primary font-medium italic cursor-help',
      'skill',
      'Skill',
    ),
    renderEntityTag(
      'action',
      'PHB',
      'text-accent font-medium italic cursor-help',
      'action',
      'Action',
    ),
    renderEntityTag(
      'feat',
      'PHB',
      'text-accent font-medium italic cursor-help',
      'feat',
      'Feat',
    ),
    renderEntityTag(
      'background',
      'PHB',
      'text-secondary font-medium italic cursor-help',
      'background',
      'Background',
    ),
    renderEntityTag(
      'race',
      'PHB',
      'text-secondary font-medium italic cursor-help',
      'race',
      'Race',
    ),
    renderEntityTag(
      'class',
      'PHB',
      'text-secondary font-medium italic cursor-help',
      'class',
      'Class',
    ),
    renderEntityTag(
      'deity',
      'PHB',
      'text-accent font-medium italic cursor-help',
      'deity',
      'Deity',
    ),
    renderEntityTag(
      'language',
      'PHB',
      'text-muted-foreground font-medium italic cursor-help',
      'language',
      'Language',
    ),
    renderEntityTag(
      'optfeature',
      'PHB',
      'text-accent font-medium italic cursor-help',
      'optionalfeature',
      'Optional Feature',
    ),
    renderEntityTag(
      'variantrule',
      'DMG',
      'text-accent font-medium italic cursor-help',
      'variantrule',
      'Variant Rule',
    ),
    renderEntityTag(
      'trap',
      'DMG',
      'text-destructive font-medium italic cursor-help',
      'trap',
      'Trap',
    ),
    renderEntityTag(
      'hazard',
      'DMG',
      'text-destructive font-medium italic cursor-help',
      'hazard',
      'Hazard',
    ),
    renderEntityTag(
      'vehicle',
      'GoS',
      'text-secondary font-medium italic cursor-help',
      'vehicle',
      'Vehicle',
    ),
    renderEntityTag(
      'object',
      'DMG',
      'text-secondary font-medium italic cursor-help',
      'object',
      'Object',
    ),
    renderEntityTag(
      'reward',
      'DMG',
      'text-accent font-medium italic cursor-help',
      'reward',
      'Reward',
    ),
    renderEntityTag(
      'status',
      'PHB',
      'text-destructive font-medium italic cursor-help',
      'status',
      'Status',
    ),
    renderEntityTag(
      'table',
      'DMG',
      'text-muted-foreground font-medium cursor-help',
      'table',
      'Table',
    ),
  ];

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
  for (const replaceTag of entityTagRenderers) {
    result = replaceTag(result);
  }

  result = result.replace(
    /{@atk ([^}]+)}/g,
    '<span class="text-primary font-medium italic">$1</span>',
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
    (_match, label: string, url: string) => {
      // Only allow safe schemes — reject javascript:, data:, etc.
      const trimmed = url.trim();
      if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
        return label; // strip unsafe link, keep display text
      }
      const safeUrl = trimmed.replace(/"/g, '%22').replace(/'/g, '%27');
      return `<a href="${safeUrl}" class="text-primary underline cursor-pointer">${label}</a>`;
    },
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

  // Catch-all: strip any remaining unrecognized tags, showing just the display text
  result = result.replace(/\{@[a-zA-Z]+ ([^|}]+)(?:\|[^}]*)?\}/g, '$1');

  result = result.replace(/\n\n/g, '</p><p class="mt-3">');
  result = result.replace(/\n/g, '<br />');

  result = `<p>${result}</p>`;

  return sanitizeRenderedHtml(result);
}

export function extractPlainText(entry: unknown): string {
  const html = renderEntry(entry);
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
