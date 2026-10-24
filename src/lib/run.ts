import { z } from 'zod'

export const runId = z.string().regex(/^[\w-]{1,64}$/)

const error = z.object({ at: z.string(), message: z.string() })

export const RunRecord = z.strictObject({
  id: runId,
  createdAt: z.iso.datetime(),
  batchId: runId,
  approach: z.enum(['json-render', 'flat-strict', 'html']),
  modelId: z.string(),
  settings: z.strictObject({ temperature: z.number().optional(), effort: z.string().optional() }),
  presetId: z.string().optional(),
  prompt: z.string(),
  fixtureId: z.string().optional(),
  system: z.string(),
  systemHash: z.string().regex(/^[0-9a-f]{64}$/),
  systemOverridden: z.boolean(),
  strictOutput: z.boolean().nullable(),
  rawOutput: z.string(),
  // [ms since request start, text] per streamed delta; absent on runs saved before replay.
  deltas: z.array(z.tuple([z.number().int().min(0), z.string()])).optional(),
  metrics: z.strictObject({
    ttftMs: z.number().nullable(),
    ttfrMs: z.number().nullable(),
    totalMs: z.number(),
    // null: no usage reported (aborted stream), not zero spend.
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
    costUsd: z.number().nullable(),
    valid: z.boolean(),
    errorCount: z.number().int(),
    errors: z.array(error),
    aborted: z.boolean(),
  }),
  rating: z.int().min(1).max(5).optional(),
  notes: z.string().optional(),
}).refine((run) => !run.deltas || run.deltas.map((d) => d[1]).join('') === run.rawOutput, { message: 'deltas do not join to rawOutput', path: ['deltas'] })

export const RunPatch = z.strictObject({ rating: z.int().min(1).max(5).optional(), notes: z.string().optional() })

export const strictOutputOf = (headers: Headers) => {
  const value = headers.get('x-strict-output')
  return value === null ? null : value === 'true'
}

export type Run = z.infer<typeof RunRecord>
export type RunSummary = Omit<Run, 'system' | 'rawOutput' | 'deltas'>
