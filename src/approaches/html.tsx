import { useEffect, useRef, useState } from 'react'
import { chartScript, shellCss, shellPrompt } from './html-shell'
import { designBrief, fixtureBlock, stripFences, type Approach, type ParseError, type ParseState, type Parser } from './types'

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"
const contentTag = /<body[\s>]|<(?!\/|!|html[\s>]|head[\s>]|meta[\s>]|title[\s>]|style[\s>]|link[\s>]|script[\s>])[a-z]/i

const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))
// End tags the HTML spec lets authors omit; leaving them open is valid markup.
const optionalEnd = new Set('html head body p li dt dd option optgroup rt rp thead tbody tfoot tr td th colgroup caption'.split(' '))
const rawText = new Set(['script', 'style', 'textarea', 'title'])
const visual = new Set(['svg', 'img', 'canvas', 'input', 'button', 'select', 'textarea', 'video', 'progress', 'meter'])
const startOrEnd = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// Static tag-stack check of a finished body; it never runs the markup.
export function htmlErrors(html: string): ParseError[] {
  if (!/<[a-z!]/i.test(html)) return [{ at: 'output', message: 'no HTML in output' }]
  const errors: ParseError[] = []
  const error = (message: string) => errors.push({ at: 'output', message })
  const stack: string[] = []
  let text = '', hasVisual = false, i = 0
  const close = (name: string) => {
    const match = stack.lastIndexOf(name)
    if (match < 0) {
      if (!['html', 'head', 'body'].includes(name)) error(`stray closing tag </${name}>`)
      return
    }
    for (const open of stack.slice(match + 1)) if (!optionalEnd.has(open)) error(`unclosed <${open}> before </${name}>`)
    stack.length = match
  }
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    text += html.slice(i, lt < 0 ? undefined : lt)
    if (lt < 0) break
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      if (end < 0) { error('unclosed comment'); break }
      i = end + 3
      continue
    }
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt)
      if (end < 0) { error('unclosed <!…>'); break }
      i = end + 1
      continue
    }
    startOrEnd.lastIndex = lt
    const m = startOrEnd.exec(html)
    if (!m) {
      if (/^<\/?[a-z]/i.test(html.slice(lt, lt + 3))) { error('unclosed opening tag or attribute'); break }
      text += '<'
      i = lt + 1
      continue
    }
    i = startOrEnd.lastIndex
    const [, closing, rawName, attrs] = m
    const name = rawName.toLowerCase()
    if (closing) { close(name); continue }
    if (visual.has(name)) hasVisual = true
    for (const [, double, single] of attrs.matchAll(/\sdata-chart\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      hasVisual = true
      try {
        const spec: unknown = JSON.parse(decode(double ?? single))
        if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) error('data-chart is not a JSON object')
      } catch { error('data-chart is not valid JSON') }
    }
    if (voidTags.has(name) || attrs.trimEnd().endsWith('/')) continue
    stack.push(name)
    if (rawText.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, i)
      if (end < 0) { error(`unclosed <${name}>`); stack.pop(); break }
      i = end
    }
  }
  for (const open of stack) if (!optionalEnd.has(open)) error(`unclosed <${open}>`)
  if (!hasVisual && !/[^\s ]/.test(decode(text).replace(/&nbsp;|&#160;/g, ''))) error('no visible content')
  return errors
}

function createParser(): Parser {
  let raw = ''
  const state = (final: boolean): ParseState => {
    const html = stripFences(raw)
    const errors = final ? htmlErrors(html) : []
    return { html, renderable: contentTag.test(html), errors }
  }
  return {
    async push(chunk) {
      raw += chunk
      return state(false)
    },
    end: async () => state(true),
  }
}

// CSP meta goes first so it is in force before any generated markup; the model's doctype is moved ahead of it.
// The shell (stylesheet, chart helper) follows, so the model writes only the body.
export const withCsp = (html: string) =>
  `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>${shellCss}</style><script>${chartScript}</script>${html.replace(/<!doctype[^>]*>/i, '')}`

function useThrottled<T>(value: T, ms: number) {
  const [throttled, setThrottled] = useState(value)
  const last = useRef(0)
  useEffect(() => {
    const wait = last.current + ms - Date.now()
    const timer = setTimeout(
      () => {
        last.current = Date.now()
        setThrottled(value)
      },
      Math.max(0, wait),
    )
    return () => clearTimeout(timer)
  }, [value, ms])
  return throttled
}

function HtmlRenderer({ state }: { state: ParseState }) {
  const html = useThrottled(state.html ?? '', 250)
  return <iframe title="Generated HTML" sandbox="allow-scripts" srcDoc={withCsp(html)} className="h-full min-h-96 w-full border-0 bg-white" />
}

export const html: Approach = {
  id: 'html',
  label: 'C · HTML body (sandboxed iframe)',
  systemPrompt: ({ fixture }) =>
    'Return only the body content of an HTML page: no doctype, <html>, <head> or <body> tags, no markdown, no code fences, no prose. The page shell below is already loaded, so build with its classes and chart helper. Inline <script> is allowed for interactivity (tabs, toggles, filters); no external requests. Add a small <style> block only for what the classes cannot express, or when the request asks for a different look, colours, fonts or layout: then follow the request.' +
    shellPrompt +
    designBrief +
    fixtureBlock(fixture),
  output: { kind: 'text' },
  createParser,
  Renderer: HtmlRenderer,
}
