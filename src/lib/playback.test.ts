import { expect, test } from 'vitest'
import { approaches, parseAll } from '../approaches'
import { fold, frames } from './playback'

const outputs: Record<string, string> = {
  'json-render': '{"op":"add","path":"/root","value":"t"}\n{"op":"add","path":"/elements/t","value":{"type":"Text","props":{"text":"Hi"},"children":[]}}\n',
  'flat-strict': '{"root":"t","elements":[{"id":"t","type":"Text","props":[{"key":"text","value":"Hi"}],"children":[]}]}',
  html: '<html><body><p>Hi</p></body></html>',
  markup: '<Text text="Hi"/>',
}
const chunked = (text: string): [number, string][] => (text.match(/[\s\S]{1,7}/g) ?? []).map((chunk, i) => [i * 40, chunk])

test.each(approaches)('$id frames end at parseAll(rawOutput) with the recorded times', async (approach) => {
  const deltas = chunked(outputs[approach.id])
  const result = await frames(approach, deltas)
  expect(result.map((f) => f.t)).toEqual([...deltas.map((d) => d[0]), deltas.at(-1)![0]])
  expect(result.at(-1)!.state).toEqual(await parseAll(approach, outputs[approach.id]))
  const renderable = result.map((f) => f.state.renderable)
  expect(renderable.slice(renderable.indexOf(true))).not.toContain(false)
})

test('no deltas is one frame at 0', async () => {
  expect(await frames(approaches[0], [])).toEqual([{ t: 0, state: await parseAll(approaches[0], '') }])
})

const html = approaches.find((a) => a.id === 'html')!
const failing = (on: 'push' | 'end') => ({
  ...html,
  createParser: () => {
    const parser = html.createParser()
    let pushes = 0
    return {
      push: (text: string) => (on === 'push' && ++pushes === 2 ? Promise.reject(new Error('boom')) : parser.push(text)),
      end: () => (on === 'end' ? Promise.reject(new Error('boom')) : parser.end()),
    }
  },
})
const boom = { at: 'parser', message: 'boom' }

test('a parser error at end keeps the last state and appends the error', async () => {
  const result = await frames(failing('end'), [[0, '<p>hi'], [10, '</p>']])
  expect(result.at(-1)).toEqual({ t: 10, state: { html: '<p>hi</p>', renderable: true, errors: [boom] } })
})

test('a parser error on push keeps the last state, appends the error and stops', async () => {
  const result = await frames(failing('push'), [[0, '<p>hi'], [10, '</p>'], [20, '<p>more</p>']])
  expect(result).toEqual([
    { t: 0, state: { html: '<p>hi', renderable: true, errors: [] } },
    { t: 10, state: { html: '<p>hi', renderable: true, errors: [boom] } },
    { t: 10, state: { html: '<p>hi', renderable: true, errors: [boom] } },
  ])
})

test('fold keeps the first push state after a throw on the second and ignores later pushes', async () => {
  const parse = fold(failing('push'))
  await parse.push('<p>hi')
  await parse.push('</p>')
  expect(parse.failed).toBe(true)
  await parse.push('<p>more</p>')
  expect(await parse.end()).toEqual({ html: '<p>hi', renderable: true, errors: [boom] })
})

test('unchanged state is shared between frames, not copied', async () => {
  const jsonRender = approaches.find((a) => a.id === 'json-render')!
  const lines = outputs['json-render'].split('\n')
  const result = await frames(jsonRender, [[0, `${lines[0]}\n`], [5, lines[1].slice(0, 20)], [9, `${lines[1].slice(20)}\n`]])
  expect(result[1].state).toBe(result[0].state)
  expect(result[2].state.spec!.root).toBe('t')
})

test('an own "__proto__" key survives into the final frame', async () => {
  const state = () => JSON.parse('{"renderable":true,"errors":[],"spec":{"state":{"data":{"__proto__":{"x":1},"normal":1}}}}')
  const approach = { ...html, createParser: () => ({ push: async () => state(), end: async () => state() }) }
  const last = (await frames(approach, [[0, 'a']])).at(-1)!.state
  expect(last).toEqual(await parseAll(approach, 'a'))
  expect(Object.hasOwn(last.spec!.state!.data as object, '__proto__')).toBe(true)
  expect(Object.getPrototypeOf(last.spec!.state!.data)).toBe(Object.prototype)
})
