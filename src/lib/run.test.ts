import { expect, test } from 'vitest'
import { strictOutputOf } from './run'

test('strict output is unknown unless the server said so', () => {
  expect(strictOutputOf(new Headers())).toBeNull()
  expect(strictOutputOf(new Headers({ 'x-strict-output': 'true' }))).toBe(true)
  expect(strictOutputOf(new Headers({ 'x-strict-output': 'false' }))).toBe(false)
})
