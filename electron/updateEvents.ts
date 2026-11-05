export type UpdateSignal = 'update-checking' | 'update-not-available' | 'update-cancelled'

export interface UpdateEventPayloads {
  'update-available': { version: string; changelog: string | null; isPortable: boolean }
  'update-error': { message: string }
  'download-progress': {
    percentage: number
    bytesPerSecond: number
    total: number
    transferred: number
  }
  'update-downloaded': { version: string }
}
