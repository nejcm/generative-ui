import { expect, test } from 'vitest'
import { approaches, parseAll } from '.'
import { replay } from './replay'

const outputs: Record<string, string> = {
  'json-render': '{"op":"add","path":"/root","value":"t"}\n{"op":"add","path":"/elements/t","value":{"type":"Text","props":{"text":"Hi"},"children":[]}}\n',
  'flat-strict': '{"root":"t","elements":[{"id":"t","type":"Text","props":[{"key":"text","value":"Hi"}],"children":[]}]}',
  html: '<html><body><p>Hi</p></body></html>',
  markup: '<Text text="Hi"/>',
}

test.each(approaches)('replaying $id from rawOutput matches the streamed result', async (approach) => {
  const streamed = await replay(approach.createParser(), outputs[approach.id], 5)
  expect(await parseAll(approach, outputs[approach.id])).toEqual(streamed.final)
  expect(streamed.final.errors).toEqual([])
})
