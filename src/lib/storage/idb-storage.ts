import { del, get, set } from 'idb-keyval'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

export function createIdbStorage<T>(options?: { allowUnreadable: boolean }): PersistStorage<T> {
  return {
    getItem: async (name) => {
      const entry = get<StorageValue<T>>(name)
      return (await (options?.allowUnreadable ? entry.catch(() => null) : entry)) ?? null
    },
    setItem: async (name, value) => {
      await set(name, value)
    },
    removeItem: async (name) => {
      await del(name)
    },
  }
}
