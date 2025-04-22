import { useCallback, useContext } from "react"
import { AppContext } from "../utils/context"
import { fakeFetch, RegisteredEndpoints } from "../utils/fetch"
import { useWrappedRequest } from "./useWrappedRequest"
import { Transaction } from "src/utils/types"

export function useCustomFetch() {
  const { cache } = useContext(AppContext)
  const { loading, wrappedRequest } = useWrappedRequest()

  const fetchWithCache = useCallback(
    async <TData, TParams extends object = object>(
      endpoint: RegisteredEndpoints,
      params?: TParams
    ): Promise<TData | null> =>
      wrappedRequest<TData>(async () => {
        const cacheKey = getCacheKey(endpoint, params)
        const cacheResponse = cache?.current.get(cacheKey)

        if (cacheResponse) {
          const data = JSON.parse(cacheResponse)
          return data as Promise<TData>
        }

        const result = await fakeFetch<TData>(endpoint, params)
        cache?.current.set(cacheKey, JSON.stringify(result))
        return result
      }),
    [cache, wrappedRequest]
  )

  const fetchWithoutCache = useCallback(
    async <TData, TParams extends object = object>(
      endpoint: RegisteredEndpoints,
      params?: TParams
    ): Promise<TData | null> =>
      wrappedRequest<TData>(async () => {
        const result = await fakeFetch<TData>(endpoint, params)
        return result
      }),
    [wrappedRequest]
  )

  const clearCache = useCallback(() => {
    if (cache?.current === undefined) {
      return
    }

    cache.current = new Map<string, string>()
  }, [cache])

  const clearCacheByEndpoint = useCallback(
    (endpointsToClear: RegisteredEndpoints[]) => {
      if (cache?.current === undefined) {
        return
      }

      const cacheKeys = Array.from(cache.current.keys())

      for (const key of cacheKeys) {
        const clearKey = endpointsToClear.some((endpoint) => key.startsWith(endpoint))

        if (clearKey) {
          cache.current.delete(key)
        }
      }
    },
    [cache]
  )

  // Bug 7 - This fix is not as clean as wiping the entire cache, but it's more efficient
  // This way we preserve the cache for entries unaffected by a transaction approval
  // We know from requests.ts that cache entries are of type Employee[], PaginatedResponse<Transaction[]>,
  // or Transaction[], so we handle those types accordingly
  const updateCacheByTransactionId = useCallback(
    (transactionId: string, newValue: boolean) => {
      if (cache?.current === undefined) {
        return
      }

      cache.current.forEach((value, key) => {
        // Ignore cache entries that only hold employee data
        if (key === "employee") {
          return
        }

        const parsedValue = JSON.parse(value)
        if (Array.isArray(parsedValue)) {
          // Handle cache entries of type Transaction[]
          const updatedValue = parsedValue.map((transaction: Transaction) =>
            transaction.id === transactionId ? { ...transaction, approved: newValue } : transaction
          )
          cache.current.set(key, JSON.stringify(updatedValue))
        } else if (parsedValue?.data) {
          // Handle cache entries of type PaginatedResponse<Transaction[]>
          const updatedValue = parsedValue.data.map((transaction: Transaction) =>
            transaction.id === transactionId ? { ...transaction, approved: newValue } : transaction
          )
          cache.current.set(key, JSON.stringify({ ...parsedValue, data: updatedValue }))
        }
      })
    },
    [cache]
  )

  return {
    fetchWithCache,
    fetchWithoutCache,
    clearCache,
    clearCacheByEndpoint,
    updateCacheByTransactionId,
    loading,
  }
}

function getCacheKey(endpoint: RegisteredEndpoints, params?: object) {
  return `${endpoint}${params ? `@${JSON.stringify(params)}` : ""}`
}
