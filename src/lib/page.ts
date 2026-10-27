export type Page = 'lab' | 'history' | 'stats'

export function pageFromPath(path: string, base: string): Page {
  const pathname = path.replace(/\/$/, '')
  if (pathname === `${base}history`) return 'history'
  if (pathname === `${base}stats`) return 'stats'
  return 'lab'
}

export const queryParam = (key: string) => new URLSearchParams(location.search).get(key) ?? undefined

export function replaceQuery(search: string) {
  if (location.search !== search) window.history.replaceState(null, '', `${location.pathname}${search}${location.hash}`)
}
