import type { ParseState } from '../approaches/types'

const textProps: Record<string, string[]> = {
  Card: ['title', 'description'],
  Heading: ['text'],
  Text: ['text'],
  Button: ['label'],
  Input: ['label', 'value'],
  Select: ['label', 'options', 'value'],
  Table: ['columns', 'rows', 'caption'],
  List: ['items'],
  Stat: ['label', 'value', 'change'],
  Image: ['alt'],
  Badge: ['text'],
  Chart: ['title'],
  Tabs: ['tabs'],
  Checkbox: ['label'],
  Switch: ['label', 'description'],
  Textarea: ['label', 'value'],
  RadioGroup: ['label', 'options'],
  Progress: ['label', 'value'],
  Alert: ['title', 'description'],
  Accordion: ['items'],
}

function strings(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  return Array.isArray(value) ? value.flatMap(strings) : []
}

export function visibleText(state: ParseState): string {
  const text: string[] = []
  if (state.spec) {
    const { spec } = state
    const seen = new Set<string>()
    const visit = (id: string) => {
      const element = spec.elements[id]
      if (!element || seen.has(id) || element.visible === false) return
      seen.add(id)
      for (const key of textProps[element.type] ?? []) {
        if (key === 'value' && ((element.type === 'Input' && element.props.type === 'password') || (element.type === 'Progress' && !element.props.label))) continue
        text.push(...strings(element.props[key]))
      }
      if (element.type === 'Avatar' && typeof element.props.name === 'string') {
        text.push(element.props.name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join(''))
      }
      if (element.type === 'Chart' && Array.isArray(element.props.data)) {
        for (const row of element.props.data) text.push(...strings(row?.label), ...strings(row?.value))
      }
      element.children?.forEach(visit)
    }
    visit(spec.root)
  } else if (state.html) {
    const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    text.push(state.html
      .replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(?:[^"'>]|"[^"]*"|'[^']*')*>/g, ' ')
      .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
        const code = entity.toLowerCase()
        if (!code.startsWith('#')) return entities[code]
        const n = code.startsWith('#x') ? parseInt(code.slice(2), 16) : Number(code.slice(1))
        return n <= 0x10ffff ? String.fromCodePoint(n) : match
      }))
  }
  return text.join(' ').replace(/\s+/g, ' ').trim()
}
