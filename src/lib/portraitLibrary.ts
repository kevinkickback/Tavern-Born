import { get, set } from 'idb-keyval'
import { MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'

export interface SavedPortrait {
  id: string
  src: string
}

export const PORTRAIT_LIBRARY_STORAGE_KEY = 'tavern-born-saved-portraits-v1'
export const MAX_SAVED_PORTRAITS = 20
const MAX_PORTRAIT_LIBRARY_SIZE = 40 * 1024 * 1024

const imageDataUrl = /^data:image\/[\w.+-]+;base64,/
let pendingWrite: Promise<unknown> = Promise.resolve()

function readPortraits(value: unknown): SavedPortrait[] {
  if (value == null) return []
  if (
    !Array.isArray(value) ||
    !value.every(
      (entry) =>
        entry &&
        typeof entry.id === 'string' &&
        typeof entry.src === 'string' &&
        imageDataUrl.test(entry.src),
    )
  ) {
    throw new Error('The saved portrait library could not be read.')
  }
  return value as SavedPortrait[]
}

async function loadPortraits(): Promise<SavedPortrait[]> {
  return readPortraits(await get<unknown>(PORTRAIT_LIBRARY_STORAGE_KEY))
}

function queueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(operation)
  pendingWrite = result.catch(() => undefined)
  return result
}

export async function listSavedPortraits(): Promise<SavedPortrait[]> {
  await pendingWrite
  return loadPortraits()
}

export function savePortrait(src: string): Promise<SavedPortrait[]> {
  return queueWrite(async () => {
    if (!imageDataUrl.test(src) || new Blob([src]).size > MAX_PORTRAIT_SIZE) {
      throw new Error('Choose an image smaller than 5 MB after processing.')
    }
    const portraits = await loadPortraits()
    if (portraits.some((entry) => entry.src === src)) return portraits
    if (portraits.length >= MAX_SAVED_PORTRAITS) {
      throw new Error('The portrait library is full. Remove an uploaded image to add another.')
    }
    if (
      portraits.reduce((size, entry) => size + entry.src.length, src.length) >
      MAX_PORTRAIT_LIBRARY_SIZE
    ) {
      throw new Error('The portrait library is full. Remove an uploaded image to add another.')
    }
    const next = [{ id: crypto.randomUUID(), src }, ...portraits]
    await set(PORTRAIT_LIBRARY_STORAGE_KEY, next)
    return next
  })
}

export function deleteSavedPortrait(id: string): Promise<SavedPortrait[]> {
  return queueWrite(async () => {
    const portraits = await loadPortraits()
    const next = portraits.filter((entry) => entry.id !== id)
    if (next.length !== portraits.length) await set(PORTRAIT_LIBRARY_STORAGE_KEY, next)
    return next
  })
}
