import { expect, test } from 'vitest'
import canonical from '@/lib/5etools/classCastingRules.generated.json' with { type: 'json' }
import runtime from '@/lib/5etools/classCastingRuntime.generated'

test('the shared-constant runtime preserves every canonical casting registry value and field order', () => {
  expect(JSON.stringify(runtime)).toBe(JSON.stringify(canonical))
})
