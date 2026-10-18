import { vi } from 'vitest'
import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'
import * as audit from '@/lib/5etools/featureSourceAudit'
import { deftEntries } from './requiredSetupFixtures'

// Only the existing abbreviated Canny fixture is admitted in legacy diagnostic tests.
// Production complete-body rejection is covered unmocked by naturalExplorerSources.
const digestSource = audit.getFeatureSourceDigest
const fixtureDeft = featureOptionRulesSignature(deftEntries, false)
export function installDeftDiagnosticSourceDouble() {
  vi.spyOn(audit, 'getFeatureSourceDigest').mockImplementation((entries, strip = true) =>
    !strip && featureOptionRulesSignature(entries, false) === fixtureDeft
      ? '82cfa1cf0129c848cd9a5a6309430e16b0afe73d90c66caf6d4923374b58d08a'
      : digestSource(entries, strip),
  )
}
