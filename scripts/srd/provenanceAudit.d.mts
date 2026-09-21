export interface ProvenanceDocumentCorpus {
  version: string
  sha256: string
  pages: Array<{ page: number; text: string; compactText: string }>
  tokenPages: Map<string, number[]>
}

export interface ProvenanceExceptionApproval {
  documentSha256: string
  recordSha256: string
  fragmentSha256: string
  officialLocation: string
  reason: string
}

export interface ProvenanceEvidenceResult {
  path: string
  text: string
  fragmentSha256: string
  status: 'matched' | 'approved-exception' | 'needs-review'
  pages?: number[]
  likelyPages?: Array<{ page: number; tokenCoverage: number }>
  closestExcerpt?: { page: number; similarity: number; text: string }
  officialLocation?: string
  reason?: string
}

export interface ProvenanceAuditRecord extends Record<string, unknown> {
  status: 'matched' | 'approved-with-exceptions' | 'needs-review'
  evidenceCount: number
  unmatchedCount: number
  approvedExceptionCount: number
  matchedPages: number[]
  evidence: ProvenanceEvidenceResult[]
}

export const PROVENANCE_AUDIT_VERSION: number
export function toAuditText(value: unknown): string
export function normalizeAuditText(value: unknown, options?: { pdfText?: boolean }): string
export function joinPdfTextItems(
  items: Array<{
    str?: string
    hasEOL?: boolean
    transform?: number[]
    width?: number
    height?: number
  }>,
): string
export function collectRecordEvidence(
  record: unknown,
  metadata?: { collection?: string; srdVersion?: string },
): Array<{ path: string; text: string }>
export function createDocumentCorpus(
  version: string,
  sha256: string,
  pages: string[],
): ProvenanceDocumentCorpus
export function auditProvenanceRecords(options: {
  records: Array<Record<string, unknown> & { record: unknown }>
  corpora: Map<string, ProvenanceDocumentCorpus>
  approvals?: {
    schemaVersion: 1
    exceptions: ProvenanceExceptionApproval[]
  }
}): {
  records: ProvenanceAuditRecord[]
  staleApprovals: ProvenanceExceptionApproval[]
}
export function loadVerifiedDocument(
  documentMetadata: { version: string; sha256: string },
  path: string,
): Promise<ProvenanceDocumentCorpus>
export function auditSrdSnapshot(options: {
  reviewRoot: string
  documentPaths: Map<string, string>
  approvals?: { schemaVersion: 1; exceptions: Array<Record<string, string>> }
}): Promise<Record<string, unknown>>
export function buildProvenanceExceptionCsv(report: { records: ProvenanceAuditRecord[] }): string
