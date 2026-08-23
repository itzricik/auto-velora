import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchPublicCatalog } from './apiClient'
import type { PublicCatalog } from '../shared/publicCatalog'

type CatalogContextValue = {
  catalog: PublicCatalog | null
  status: 'loading' | 'ready' | 'error'
  retry: () => void
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null)
  const [status, setStatus] = useState<CatalogContextValue['status']>('loading')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    fetchPublicCatalog(controller.signal).then((value) => {
      setCatalog(value)
      setStatus('ready')
    }).catch((error) => {
      if ((error as Error).name !== 'AbortError') setStatus('error')
    })
    return () => controller.abort()
  }, [revision])

  const value = useMemo(() => ({
    catalog,
    status,
    retry: () => setRevision((current) => current + 1),
  }), [catalog, status])
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePublicCatalog() {
  const value = useContext(CatalogContext)
  if (!value) throw new Error('CatalogProvider is missing.')
  return value
}
