import { useEffect, useRef, useState } from 'react'
import { fixtureBlock, stripFences, type Approach, type ParseState, type Parser } from './types'

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
export const withCsp = (html: string) =>
  `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}">${html.replace(/<!doctype[^>]*>/i, '')}`

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
  label: 'C · raw HTML (sandboxed iframe)',
  systemPrompt: ({ fixture }) =>
    'Return one self-contained HTML document. Inline CSS/JS only. No external requests. No markdown, no code fences, no prose.' +
    fixtureBlock(fixture),
  output: { kind: 'text' },
  createParser,
  Renderer: HtmlRenderer,
}
