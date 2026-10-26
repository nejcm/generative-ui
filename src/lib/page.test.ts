import { expect, test } from 'vitest'
import { pageFromPath } from './page'

test.each([
  ['/', '/', 'lab'],
  ['/history', '/', 'history'],
  ['/stats', '/', 'stats'],
  ['/stats/', '/', 'stats'],
  ['/unknown', '/', 'lab'],
  ['/generative-ui/', '/generative-ui/', 'lab'],
  ['/generative-ui/history', '/generative-ui/', 'history'],
  ['/generative-ui/stats', '/generative-ui/', 'stats'],
  ['/generative-ui/history/', '/generative-ui/', 'history'],
  ['/generative-ui/unknown', '/generative-ui/', 'lab'],
  ['/history', '/generative-ui/', 'lab'],
  ['/generative-ui-other/history', '/generative-ui/', 'lab'],
  ['/generative-ui/history/nested', '/generative-ui/', 'lab'],
])('maps %s under %s to %s', (path, base, page) => {
  expect(pageFromPath(path, base)).toBe(page)
})
