import { describe, expect, test } from 'vitest'
import { html, withCsp } from './html'
import { replay } from './replay'

const page = '<!doctype html><html><head><style>h1{color:red}</style></head><body><h1>Hi</h1><p>There</p></body></html>'

describe.each([1, 7, 42])('html parser, seed %i', (seed) => {
  test('valid stream strips fences and becomes renderable at the body', async () => {
    const { states, final } = await replay(html.createParser(), '```html\n' + page + '\n```', seed)
    const firstRenderable = states.find((s) => s.renderable)!
    expect(firstRenderable.html).toContain('<body')
    expect(final).toEqual({ html: page, renderable: true, errors: [] })
  })

  test('truncated stream is not an error while it has HTML', async () => {
    const { final } = await replay(html.createParser(), page.slice(0, page.indexOf('<p>')), seed)
    expect(final.renderable).toBe(true)
    expect(final.errors).toEqual([])
  })

  test('head-only output is not renderable yet', async () => {
    const { final } = await replay(html.createParser(), '<!doctype html><html><head><style>', seed)
    expect(final.renderable).toBe(false)
  })

  test('output without HTML is one error', async () => {
    const { final } = await replay(html.createParser(), 'Sorry, I cannot do that.', seed)
    expect(final.errors).toHaveLength(1)
  })
})

test('CSP meta precedes all generated markup', () => {
  const doc = withCsp('<script>fetch("https://example.com")</script>' + page)
  expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script>'))
  expect(doc.match(/<!doctype/gi)).toHaveLength(1)
  expect(doc).toContain("default-src 'none'")
})
