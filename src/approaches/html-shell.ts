// The page shell a real site would already ship: its stylesheet and chart helper. The model writes only the body.

export const palette = ['oklch(0.62 0.17 255)', 'oklch(0.7 0.13 185)', 'oklch(0.78 0.15 80)', 'oklch(0.6 0.18 300)', 'oklch(0.65 0.2 15)']

export const shellCss = `
:root{--bg:#fff;--card:#fff;--fg:#111417;--muted:#5E6670;--border:#E1E5E9;--subtle:#F3F5F6;--primary:#111417;--primary-fg:#fff;--danger:#BE2A1F;--ok:#1F7A4D;--radius:7px;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#15181B;--card:#191D21;--fg:#ECEEF0;--muted:#9AA2AC;--border:#2A3037;--subtle:#1D2227;--primary:#ECEEF0;--primary-fg:#15181B;--danger:#F0786E;--ok:#5FC78F}}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
h1,h2,h3,h4{margin:0;line-height:1.25;font-weight:600}h1{font-size:28px}h2{font-size:22px}h3{font-size:17px}h4{font-size:15px}
p{margin:0}a{color:inherit}
.page{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:24px}
.stack{display:flex;flex-direction:column;gap:12px}.row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.between{justify-content:space-between}.center{align-items:center;justify-content:center}
.gap-sm{gap:6px}.gap-lg{gap:24px}
.grid{display:grid;gap:16px;grid-template-columns:1fr}
@media (min-width:640px){.cols-2,.cols-3,.cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:960px){.cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 1px 2px rgb(0 0 0/.04)}
.card-title{font-size:16px;font-weight:600}.card-desc,.muted{color:var(--muted)}
.lead{font-size:17px;color:var(--muted)}.small{font-size:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:var(--radius);border:1px solid var(--primary);background:var(--primary);color:var(--primary-fg);font:inherit;font-weight:500;cursor:pointer;text-decoration:none}
.btn-secondary{background:var(--subtle);border-color:var(--subtle);color:var(--fg)}.btn-outline{background:transparent;border-color:var(--border);color:var(--fg)}
.btn-ghost{background:transparent;border-color:transparent;color:var(--fg)}.btn-destructive{background:var(--danger);border-color:var(--danger);color:#fff}
.btn-sm{height:30px;padding:0 10px;font-size:13px}.btn-lg{height:42px;padding:0 20px}.btn-block{width:100%}
label{display:flex;flex-direction:column;gap:6px;font-weight:500}
input:not([type=checkbox]):not([type=radio]),select,textarea{width:100%;height:36px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--fg);font:inherit}
textarea{height:auto;min-height:80px;padding:8px 10px}
label.check{flex-direction:row;align-items:center;gap:8px;font-weight:400}input[type=checkbox],input[type=radio]{accent-color:var(--primary);width:16px;height:16px}
.badge{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:var(--primary);color:var(--primary-fg);font-size:12px;font-weight:500;white-space:nowrap}
.badge-secondary{background:var(--subtle);color:var(--fg)}.badge-outline{background:transparent;border:1px solid var(--border);color:var(--fg)}.badge-destructive{background:var(--danger);color:#fff}
.stat-label{color:var(--muted);font-size:13px}.stat-value{font-size:26px;font-weight:600;letter-spacing:-.01em}
.up{color:var(--ok)}.down{color:var(--danger)}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:var(--muted);font-weight:500}
th,td{padding:10px 8px;border-bottom:1px solid var(--border)}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.alert{border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px}.alert-destructive{border-color:var(--danger);color:var(--danger)}
.progress{height:8px;border-radius:999px;background:var(--subtle);overflow:hidden}.progress>div{height:100%;background:var(--primary)}
.avatar{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:999px;background:var(--subtle);font-weight:600;overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
hr{border:0;border-top:1px solid var(--border);margin:0;width:100%}
.chart svg{display:block;width:100%;height:auto;max-height:280px}.chart text{fill:var(--muted);font-size:11px}
`

// Plain JS source, not a serialised TS function: toString() of transpiled code can reference build helpers
// (esbuild keepNames adds __name) that do not exist inside the iframe.
const chartSvgJs = String.raw`function chartSvg(spec, colors) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';')
  const data = (Array.isArray(spec.data) ? spec.data : []).filter((d) => typeof d?.value === 'number' && Number.isFinite(d.value))
  const title = spec.title ? '<title>' + esc(spec.title) + '</title>' : ''
  if (!data.length) return '<svg viewBox="0 0 400 40" role="img">' + title + '<text x="0" y="24">No data</text></svg>'
  if (spec.type === 'pie') {
    const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0) || 1
    let angle = -Math.PI / 2
    const slices = data.map((d, i) => {
      const color = colors[i % colors.length]
      const sweep = (Math.max(0, d.value) / total) * Math.PI * 2
      const x0 = 80 + 70 * Math.cos(angle), y0 = 80 + 70 * Math.sin(angle)
      angle += sweep
      const x1 = 80 + 70 * Math.cos(angle), y1 = 80 + 70 * Math.sin(angle)
      const shape = sweep >= Math.PI * 2 - 1e-9 ? '<circle cx="80" cy="80" r="70"' : '<path d="M80 80L' + x0 + ' ' + y0 + 'A70 70 0 ' + (sweep > Math.PI ? 1 : 0) + ' 1 ' + x1 + ' ' + y1 + 'Z"'
      const share = Math.round((Math.max(0, d.value) / total) * 100)
      return shape + ' fill="' + color + '"/><rect x="176" y="' + (16 + i * 20) + '" width="10" height="10" rx="2" fill="' + color + '"/><text x="192" y="' + (25 + i * 20) + '">' + esc(d.label) + ' (' + share + '%)</text>'
    })
    return '<svg viewBox="0 0 400 ' + Math.max(160, 24 + data.length * 20) + '" role="img">' + title + slices.join('') + '</svg>'
  }
  const w = 400, h = 200, left = 44, bottom = 22
  const max = Math.max(...data.map((d) => d.value), 0) || 1
  const min = Math.min(...data.map((d) => d.value), 0)
  const y = (v) => 8 + (h - bottom - 8) * (1 - (v - min) / (max - min || 1))
  const step = (w - left) / data.length
  const x = (i) => left + step * i + step / 2
  const axis = [max, min].map((v) => '<text x="' + (left - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + esc(Math.round(v * 100) / 100) + '</text>').join('')
  const labels = data.map((d, i) => '<text x="' + x(i) + '" y="' + (h - 6) + '" text-anchor="middle">' + esc(d.label) + '</text>').join('')
  const line = data.map((d, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(d.value)).join('')
  const area = spec.type === 'area' ? '<path d="' + line + 'L' + x(data.length - 1) + ' ' + y(min) + 'L' + x(0) + ' ' + y(min) + 'Z" fill="' + colors[0] + '" opacity=".2"/>' : ''
  const marks = spec.type === 'line' || spec.type === 'area'
    ? area + '<path d="' + line + '" fill="none" stroke="' + colors[0] + '" stroke-width="2"/>'
    : data.map((d, i) => '<rect x="' + (x(i) - step * 0.35) + '" y="' + Math.min(y(d.value), y(0)) + '" width="' + step * 0.7 + '" height="' + Math.abs(y(0) - y(d.value)) + '" rx="3" fill="' + colors[0] + '"/>').join('')
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img">' + title + axis + marks + labels + '</svg>'
}`

export const chartScript = `document.addEventListener('DOMContentLoaded', () => {
const colors = ${JSON.stringify(palette)}
${chartSvgJs}
for (const el of document.querySelectorAll('[data-chart]')) {
  el.classList.add('chart')
  let spec
  try { spec = JSON.parse(el.getAttribute('data-chart')) } catch { el.textContent = 'Chart data is not valid JSON'; continue }
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) { el.textContent = 'Chart data must be a JSON object'; continue }
  try { el.innerHTML = chartSvg(spec, colors) } catch { el.textContent = 'Chart could not be drawn' }
}
})`

export const shellPrompt = `
PAGE SHELL (already loaded; do not restate it):
- A stylesheet with these classes. Use them instead of writing CSS:
  layout: page (centered column), stack, row, between, center, gap-sm, gap-lg, grid + cols-2|cols-3|cols-4 (responsive)
  surfaces: card, card-title, card-desc, alert, alert-destructive, hr
  text: h1-h4 (styled), lead, muted, small, up, down (trend colours)
  controls: btn, btn-secondary|btn-outline|btn-ghost|btn-destructive, btn-sm|btn-lg, btn-block; label wraps input/select/textarea; label.check wraps a checkbox or radio
  data: table (styled; td.num for numbers), badge, badge-secondary|badge-outline|badge-destructive, stat-label, stat-value, progress (inner div with style="width:NN%"), avatar
- Charts: <div data-chart='{"type":"bar|line|area|pie","title":"…","data":[{"label":"W1","value":120}]}'></div> renders an SVG chart (single series, pie gets a legend). Do not draw charts yourself.
- Light and dark mode are handled by the stylesheet.`
