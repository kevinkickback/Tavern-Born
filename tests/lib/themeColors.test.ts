import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const themeCss = readFileSync(join(process.cwd(), 'src', 'styles', 'theme.css'), 'utf8')

describe('semantic theme colors', () => {
  test('loads the Radix palettes used by warning and destructive tokens', () => {
    expect(themeCss).toContain('@radix-ui/colors/amber.css')
    expect(themeCss).toContain('@radix-ui/colors/amber-dark.css')
    expect(themeCss).toContain('@radix-ui/colors/red.css')
    expect(themeCss).toContain('@radix-ui/colors/red-dark.css')
  })
})
