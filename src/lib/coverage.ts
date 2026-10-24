function leaves(value: unknown): (string | number)[] {
  if (typeof value === 'string' || typeof value === 'number') return [value]
  return value && typeof value === 'object' ? Object.values(value).flatMap(leaves) : []
}

export function coverage(fixture: unknown, rawOutput: string): number {
  const values = leaves(fixture)
  const output = rawOutput.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>|\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ').toLowerCase()
  const found = values.filter((value) => {
    if (typeof value === 'string') return output.includes(value.toLowerCase()) || output.includes(JSON.stringify(value).slice(1, -1).toLowerCase())
    const formats = [
      String(value),
      value.toLocaleString('en-US'),
      value.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      value.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 2 }),
      value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 }),
    ]
    return formats.some((text) => new RegExp(`(?<!\\d)(?<!\\d[.,])${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![.,]?\\d|(?:px|em|rem|vh|vw|vmin|vmax|ms|s|deg)\\b)`, 'i').test(output))
  })
  return values.length ? found.length / values.length : 1
}
