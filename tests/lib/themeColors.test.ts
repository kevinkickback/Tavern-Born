import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const themeCss = readFileSync(join(process.cwd(), 'src', 'styles', 'theme.css'), 'utf8')
const mainCss = readFileSync(join(process.cwd(), 'src', 'styles', 'main.css'), 'utf8')

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  )
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

describe('semantic theme colors', () => {
  test('loads the Radix palettes used by warning and destructive tokens', () => {
    expect(themeCss).toContain('@radix-ui/colors/amber.css')
    expect(themeCss).toContain('@radix-ui/colors/amber-dark.css')
    expect(themeCss).toContain('@radix-ui/colors/red.css')
    expect(themeCss).toContain('@radix-ui/colors/red-dark.css')
  })

  test('uses separate warning accent and text colors in the light theme', () => {
    expect(mainCss).toContain('--warning: #b07800;')
    expect(mainCss).toContain('--warning-foreground: var(--color-fg);')
    expect(mainCss).toContain('--warning: var(--amber-11);')
    expect(contrastRatio('#b07800', '#e8e8ec')).toBeGreaterThanOrEqual(3)
  })

  test('uses a subdued, separated light-theme surface ladder', () => {
    expect(mainCss).toContain('--app-shell: #cdced6;')
    expect(mainCss).toContain('--workspace-canvas: #e8e8ec;')
    expect(mainCss).toContain('--workspace-pane: #e0e1e6;')
    expect(mainCss).toContain('--workspace-detail: #d9d9e0;')
    expect(mainCss).toContain('--surface-raised: #f0f0f3;')
    expect(mainCss).toContain('--muted-foreground: #535862;')
    expect(mainCss).toContain('--navigation-foreground: #414650;')
    expect(contrastRatio('#cdced6', '#e8e8ec')).toBeGreaterThanOrEqual(1.25)
    expect(contrastRatio('#535862', '#cdced6')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#414650', '#cdced6')).toBeGreaterThanOrEqual(4.5)
  })
})
