import { expect, test } from 'vitest'
import { whenCurrent } from './async'

const settle = () => new Promise((r) => setTimeout(r))

test('a result that resolves after cancel is dropped', async () => {
  const applied: string[] = []
  let resolveOld!: (v: string) => void
  const cancelOld = whenCurrent(new Promise<string>((r) => (resolveOld = r)), (v) => applied.push(v))
  cancelOld()
  whenCurrent(Promise.resolve('new'), (v) => applied.push(v))
  resolveOld('old')
  await settle()
  expect(applied).toEqual(['new'])
})

test('a pane load cancelled by a live run never applies, even if already resolved', async () => {
  const applied: string[] = []
  const cancel = whenCurrent(Promise.resolve('loaded'), (v) => applied.push(v))
  cancel()
  cancel()
  await settle()
  expect(applied).toEqual([])
})

test('onError fires only while current', async () => {
  const errors: string[] = []
  let rejectOld!: (e: Error) => void
  const cancelOld = whenCurrent(new Promise<string>((_, r) => (rejectOld = r)), () => {}, (e) => errors.push(e.message))
  cancelOld()
  rejectOld(new Error('old'))
  whenCurrent(Promise.reject(new Error('new')), () => {}, (e) => errors.push(e.message))
  await settle()
  expect(errors).toEqual(['new'])
})
