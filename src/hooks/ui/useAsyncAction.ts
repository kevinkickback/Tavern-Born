import { useCallback, useRef, useState } from 'react'

/** Keep repeated interactions from starting the same operation before React re-renders. */
export function useAsyncAction() {
  const pending = useRef(false)
  const [isPending, setIsPending] = useState(false)
  const run = useCallback(
    async (action: () => Promise<void>, onError: (error: unknown) => void): Promise<void> => {
      if (pending.current) return
      pending.current = true
      setIsPending(true)
      try {
        await action()
      } catch (error) {
        onError(error)
      } finally {
        pending.current = false
        setIsPending(false)
      }
    },
    [],
  )
  return { isPending, run }
}
