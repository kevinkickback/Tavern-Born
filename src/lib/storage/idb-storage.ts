import { get, set, del } from 'idb-keyval'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

export function createIdbStorage<T>(): PersistStorage<T> {
  return {
    getItem: async (name) => {
      return (await get<StorageValue<T>>(name)) ?? null
    },
    setItem: async (name, value) => {
      await set(name, value)
    },
    removeItem: async (name) => {
      await del(name)
    },
  }
}
