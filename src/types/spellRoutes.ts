export type ClassSpellRoute = readonly [
  'classSpellRoute',
  string,
  string,
  string,
  string,
  'class' | 'classVariant',
  string | null,
]
export interface SpellRouteDiagnostic {
  code: string
  path: string
  group?: string[]
}
export interface SpellRouteLookupCandidate {
  path: string[]
  value: unknown
}
export interface SpellRouteOccurrence {
  origin: string
  rowPath: string
  routingInputDigest: string
}
export interface SpellRouteInput {
  origin: string
  embedded: { kind: 'absent' } | { kind: 'present'; value: unknown }
  lookup: { kind: 'absent' } | { kind: 'present'; candidates: SpellRouteLookupCandidate[] }
  targetOccurrences: SpellRouteOccurrence[]
}
export interface ClassSpellRouteAudit {
  version: 1
  kind: 'class-spell-routes'
  target: [string, string]
  input: SpellRouteInput
  sourceDigest: string
  sourceRoutes: ClassSpellRoute[]
  diagnostics: SpellRouteDiagnostic[]
}
export interface SpellClassAssociation {
  name: string
  source: string
  definedInSource?: string
}
