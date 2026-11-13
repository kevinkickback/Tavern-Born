import type {
  BundledDataSourceConfig,
  CatalogResourceProof,
  GameData,
  GameDataSourceStack,
} from '@/types/5etools'
import type { PreparedCatalog } from './catalogCandidate'
import type { CatalogComparisonBasis } from './catalogComparison'
import type { JsonSourceRead } from './resourceReader'

export type CatalogSummary = Omit<PreparedCatalog, 'data' | 'keys'> & { contentFingerprint: string }
type WorkerCatalog = CatalogSummary & { workerId: string }
export type CatalogCandidate = PreparedCatalog | WorkerCatalog

export type CatalogCommand =
  | {
      kind: 'prepare'
      config: PreparedCatalog['config']
      base?: GameDataSourceStack['base']
      verifiedRevision?: string | CatalogResourceProof
    }
  | { kind: 'bundled'; config: BundledDataSourceConfig }
  | { kind: 'repair'; data: GameData; contentFingerprint?: string }
  | { kind: 'compare'; workerId: string; prior: CatalogComparisonBasis }
  | { kind: 'take'; workerId: string }

export type CatalogReply =
  | { text: string; stamp?: string }
  | { bytes: ArrayBuffer; stamp?: string }
  | { stamp: string }
  | { unchanged: true }
  | { error: string; status?: number }

export type CatalogRequestMessage =
  | { kind: 'run'; id: string; command: CatalogCommand }
  | { kind: 'drop'; id: string }
  | { kind: 'read-result'; id: string; readId: number; reply: CatalogReply }

export type CatalogWorkerMessage =
  | { kind: 'progress'; id: string; current: number; total: number; resource: string }
  | { kind: 'read'; id: string; readId: number; request: JsonSourceRead }
  | { kind: 'cancel-read'; id: string; readId: number }
  | { kind: 'result'; id: string; result: unknown }
  | { kind: 'error'; id: string; error: string }
  | { kind: 'closed' }
