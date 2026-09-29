/**
 * Categories and departments, read from GET /api/issues/taxonomy.
 *
 * Several pages used to keep their own hand-typed copy of this list (the admin
 * filters, the department-assignment dropdown, the marketing page) and they
 * drifted apart from what the AI actually assigns and from each other - one
 * even offered department names that matched nothing. This is the one place
 * the client asks for it.
 *
 * No auth required (the endpoint itself is public), so this is safe to use
 * from the pre-login landing page too. Cached at module scope for the life of
 * the tab: the taxonomy does not change while someone is using the app, and
 * fetching it once instead of on every page avoids a waterfall of identical
 * requests as someone clicks around.
 */
import { useEffect, useState } from 'react'
import api from '@/lib/api'

const EMPTY = { categories: [], departments: [], fallbackCategory: 'Other' }

let cache = null
let inflight = null

const normalise = (data) => ({
  categories: data?.categories || [],
  departments: data?.departments || [],
  fallbackCategory: data?.fallback_category || 'Other',
})

const fetchTaxonomy = async () => {
  if (cache) return cache
  if (!inflight) {
    inflight = api.get('/issues/taxonomy')
      .then(({ data }) => { cache = normalise(data); return cache })
      .catch(() => EMPTY)   // the taxonomy is a convenience; a failed fetch must not break the page it's on
      .finally(() => { inflight = null })
  }
  return inflight
}

/** { categories, departments, fallbackCategory, loading } - categories carry {name, department, description}. */
export function useTaxonomy() {
  const [state, setState] = useState(() => cache || EMPTY)
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    fetchTaxonomy().then((data) => { if (!cancelled) { setState(data); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  return { ...state, loading }
}

/** Plain category name strings, "Other" last regardless of where the API put it. */
export function useCategoryNames() {
  const { categories, fallbackCategory, loading } = useTaxonomy()
  const names = categories.map(c => c.name)
  const ordered = [...names.filter(n => n !== fallbackCategory), ...names.filter(n => n === fallbackCategory)]
  return { categories: ordered, loading }
}
