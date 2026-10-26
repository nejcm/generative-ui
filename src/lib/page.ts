export type Page = 'lab' | 'history' | 'stats'

export function pageFromPath(path: string, base: string): Page {
  const pathname = path.replace(/\/$/, '')
  if (pathname === `${base}history`) return 'history'
  if (pathname === `${base}stats`) return 'stats'
  return 'lab'
}
