import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function prose(markdown: string, preserveInline = false): string {
  let fence = ''
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (marker) {
        if (!fence) fence = marker[1]
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ''
        return ''
      }
      return fence ? '' : line
    })
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(`+)([\s\S]*?)\1/g, preserveInline ? '$2' : '')
}

export function headingAnchors(markdown: string): Set<string> {
  const text = prose(markdown, true)
  const anchors = new Set<string>()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const heading =
      lines[i].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1] ??
      (i + 1 < lines.length && /^\s{0,3}(?:=+|-+)\s*$/.test(lines[i + 1]) ? lines[i].trim() : '')
    if (!heading) continue
    const base = heading
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
      .replace(/\s/g, '-')
    let anchor = base
    let suffix = 0
    while (anchors.has(anchor)) anchor = `${base}-${++suffix}`
    anchors.add(anchor)
  }
  for (const match of text.matchAll(/<a\b[^>]*\b(?:id|name)\s*=\s*(["'])(.*?)\1/gi))
    anchors.add(match[2])
  return anchors
}

export function markdownDestinations(markdown: string): string[] {
  const text = prose(markdown)
  const references = new Map<string, string>()
  const destinations: string[] = []
  const key = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase()
  const destination = (value: string) => {
    const match = value.trim().match(/^(?:<([^>]+)>|((?:\\.|[^\s])+?))(?:\s+["'][\s\S]*["'])?$/)
    if (!match) throw new Error(`Unsupported link destination: ${value}`)
    return (match[1] ?? match[2]).replace(/\\([()[\] ])/g, '$1')
  }
  const body = text.replace(
    /^\s{0,3}\[([^\]]+)\]:\s*(.+)$/gm,
    (_, label: string, value: string) => {
      const target = destination(value)
      references.set(key(label), target)
      destinations.push(target)
      return ''
    },
  )
  const scan = (body: string) => {
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== '[' || body[i - 1] === '\\') continue
      let end = i + 1
      let nesting = 1
      for (; end < body.length && nesting; end++) {
        if (body[end - 1] === '\\') continue
        if (body[end] === '[') nesting++
        if (body[end] === ']') nesting--
      }
      if (nesting) continue
      const label = body.slice(i + 1, end - 1)
      scan(label)
      if (body[end] === '(') {
        let close = end + 1
        let depth = 1
        for (; close < body.length && depth; close++) {
          if (body[close - 1] === '\\') continue
          if (body[close] === '(') depth++
          if (body[close] === ')') depth--
        }
        if (depth) throw new Error(`Unclosed link: ${label}`)
        destinations.push(destination(body.slice(end + 1, close - 1)))
        i = close - 1
      } else if (body[end] === '[') {
        const close = body.indexOf(']', end + 1)
        if (close < 0) throw new Error(`Unclosed reference link: ${label}`)
        const target = references.get(key(body.slice(end + 1, close) || label))
        if (!target) throw new Error(`Undefined link reference: ${label}`)
        destinations.push(target)
        i = close
      } else {
        const target = references.get(key(label))
        if (target) destinations.push(target)
        i = end - 1
      }
    }
  }
  scan(body)
  for (const match of body.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi))
    destinations.push(match[2])
  return destinations
}

export function documentationErrors(files: string[], root = process.cwd()): string[] {
  const checkout = realpathSync(root)
  const errors: string[] = []
  const inside = (file: string) => {
    const path = relative(checkout, realpathSync(file))
    return (
      !isAbsolute(path) &&
      path !== '..' &&
      !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    )
  }
  for (const file of files) {
    const source = resolve(checkout, file)
    if (!existsSync(source)) continue // Deleted files are still checked through incoming links.
    try {
      if (!inside(source)) throw new Error('Document resolves outside the checkout')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(source))
      for (const target of markdownDestinations(text)) {
        if (/^(?:https?:|mailto:)/i.test(target)) continue
        // GitHub resolves this existing root-README route to this repository's releases page.
        if (file === 'README.md' && target === '../../releases') continue
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//'))
          throw new Error(`Unsupported link scheme: ${target}`)
        const hash = target.indexOf('#')
        const location = hash < 0 ? target : target.slice(0, hash)
        const fragment = hash < 0 ? '' : target.slice(hash + 1)
        const path = resolve(dirname(source), decodeURIComponent(location.split('?')[0] || source))
        if (!existsSync(path) || !inside(path))
          throw new Error(`Missing or outside-checkout target: ${target}`)
        if (
          fragment &&
          path.endsWith('.md') &&
          !headingAnchors(readFileSync(path, 'utf8')).has(decodeURIComponent(fragment))
        ) {
          throw new Error(`Missing heading/anchor: ${target}`)
        }
      }
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return errors
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const base = process.env.PR_BASE_SHA ?? ''
  const head = process.env.PR_HEAD_SHA ?? ''
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/i.test(sha)))
    throw new Error('PR base/head commits are required')
  execFileSync('git', ['diff', '--check', `${base}...${head}`], {
    stdio: 'inherit',
    windowsHide: true,
  })
  const files = execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
    encoding: 'utf8',
    windowsHide: true,
  })
    .split('\0')
    .filter(Boolean)
  const errors = documentationErrors(files)
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`Documentation targets and anchors checked across ${files.length} Markdown files`)
}
