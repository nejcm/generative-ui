import { expect, test } from 'vitest'
import { readNdjson } from './ndjson.ts'

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c))
      controller.close()
    },
  })

const collect = async (stream: ReadableStream<Uint8Array>) => {
  const events = []
  for await (const e of readNdjson(stream)) events.push(e)
  return events
}

test('splits lines across chunk boundaries, including inside a multi-byte character', async () => {
  const bytes = new TextEncoder().encode('{"t":"delta","text":"é"}\n\n{"t":"done","ttftMs":1,"totalMs":2}\n')
  const split = bytes.indexOf(0xa9) // second byte of é
  const chunks = [bytes.slice(0, 5), bytes.slice(5, split), bytes.slice(split)]
  expect(await collect(streamOf(chunks))).toEqual([
    { t: 'delta', text: 'é' },
    { t: 'done', ttftMs: 1, totalMs: 2 },
  ])
})

test('parses a final line without a trailing newline', async () => {
  const chunks = [new TextEncoder().encode('{"t":"error","message":"x"}')]
  expect(await collect(streamOf(chunks))).toEqual([{ t: 'error', message: 'x' }])
})
