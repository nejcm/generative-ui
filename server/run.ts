import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { Output, jsonSchema, streamText, type JSONSchema7, type LanguageModel } from 'ai'
import type { Context } from 'hono'
import { z } from 'zod'
import type { RunEvent } from '../src/lib/ndjson.ts'
import { models, type Provider } from '../src/models.ts'

const providers: Record<Provider, (modelName: string) => LanguageModel> = { anthropic, openai }

const RunRequest = z.object({
  runId: z.string(),
  modelId: z.string(),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    effort: z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  }),
  system: z.string(),
  prompt: z.string().min(1),
  output: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text') }),
    z.object({ kind: z.literal('json-schema'), schema: z.record(z.string(), z.unknown()) }),
  ]),
})

export async function run(c: Context) {
  const parsed = RunRequest.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400)
  const { modelId, settings, system, prompt, output } = parsed.data
  const model = models.find((m) => m.id === modelId)
  if (!model) return c.json({ error: `Unknown model: ${modelId}` }, 400)

  // Fires when the client disconnects (@hono/node-server aborts the request on premature close).
  const signal = c.req.raw.signal
  const strict = output.kind === 'json-schema' && model.supports.strictJson
  const started = performance.now()
  const result = streamText({
    model: providers[model.provider](model.modelName),
    system,
    prompt,
    temperature: model.supports.temperature ? settings.temperature : undefined,
    reasoning: settings.effort && model.supports.effort?.includes(settings.effort) ? settings.effort : undefined,
    ...(strict && {
      output: Output.object({ schema: jsonSchema(output.schema as JSONSchema7) }),
    }),
    maxRetries: 0, // retries would distort TTFT and total time
    abortSignal: signal,
  })

  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      let ttftMs: number | null = null
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            ttftMs ??= performance.now() - started
            send({ t: 'delta', text: part.text })
          } else if (part.type === 'error') {
            throw part.error
          } else if (part.type === 'finish') {
            const usage = part.totalUsage
            send({
              t: 'usage',
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
              cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens,
            })
          }
        }
        if (signal.aborted) return
        send({ t: 'done', ttftMs, totalMs: performance.now() - started })
      } catch (error) {
        if (signal.aborted) return
        send({ t: 'error', message: errorMessage(error) })
      }
      controller.close()
    },
  })
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson', 'x-strict-output': String(strict) } })
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
