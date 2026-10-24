import { useEffect, useRef, useState } from 'react'
import { chartScript, shellCss, shellPrompt } from './html-shell'
import { designBrief, fixtureBlock, stripFences, type Approach, type ParseState, type Parser } from './types'

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"
const contentTag = /<body[\s>]|<(?!\/|!|html[\s>]|head[\s>]|meta[\s>]|title[\s>]|style[\s>]|link[\s>]|script[\s>])[a-z]/i

function createParser(): Parser {
  let raw = ''
  const state = (final: boolean): ParseState => {
    const html = stripFences(raw)
    const errors = final && !/<[a-z!]/i.test(html) ? [{ at: 'output', message: 'no HTML in output' }] : []
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
