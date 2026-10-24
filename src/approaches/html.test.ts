import { describe, expect, test } from 'vitest'
import { html, withCsp } from './html'
import { chartScript } from './html-shell'
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

describe('page shell', () => {
  test('the prompt asks for body content and documents the shell', () => {
    const prompt = html.systemPrompt({ catalog: undefined as never })
    expect(prompt).toContain('Return only the body content')
    expect(prompt).toContain('data-chart')
    expect(prompt).toContain('cols-4')
  })

  test('the stylesheet and chart helper come after the CSP and before the generated body', () => {
    const doc = withCsp('<div class="page"></div>')
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<style>'))
    expect(doc.indexOf('</script>')).toBeLessThan(doc.indexOf('<div class="page">'))
    expect(doc.match(/<\/script/gi)).toHaveLength(1)
  })

  // Runs the exact script string the iframe gets, against a minimal document stand-in.
  const runCharts = (...attrs: string[]) => {
    const els = attrs.map((attr) => ({ innerHTML: '', textContent: '', classList: { add() {} }, getAttribute: () => attr }))
    let onLoad = () => {}
    const document = { addEventListener: (_: string, fn: () => void) => (onLoad = fn), querySelectorAll: () => els }
    new Function('document', chartScript)(document)
    onLoad()
    return els
  }
  const runScript = (attr: string) => runCharts(attr)[0]

  test('a bad chart spec does not blank the charts after it', () => {
    const good = JSON.stringify({ type: 'bar', data: [{ label: 'W1', value: 1 }] })
    const [nul, arr, badData, ok] = runCharts('null', '[]', '{"type":"pie","data":[null]}', good)
    expect(nul.textContent).toBe('Chart data must be a JSON object')
    expect(arr.textContent).toBe('Chart data must be a JSON object')
    expect(badData.innerHTML).toContain('No data')
    expect(ok.innerHTML).toContain('<svg')
  })

  test.each(['bar', 'line', 'area', 'pie'])('the injected helper draws a %s chart', (type) => {
    const el = runScript(JSON.stringify({ type, title: 'Revenue', data: [{ label: 'W1', value: 120 }, { label: 'W2', value: 80 }] }))
    expect(el.innerHTML).toMatch(/^<svg [^>]*role="img"><title>Revenue<\/title>/)
    expect(el.innerHTML).toContain('W2')
  })

  test('invalid chart JSON shows a message instead of breaking the page', () => {
    expect(runScript('{"type":"bar",').textContent).toBe('Chart data is not valid JSON')
  })

  test('labels are escaped and non-numeric values skipped', () => {
    const svg = runScript(JSON.stringify({ type: 'bar', data: [{ label: '<img onerror=x>', value: 1 }, { label: 'bad', value: '7' }] })).innerHTML
    expect(svg).not.toContain('<img')
    expect(svg).not.toContain('>bad<')
  })
})
