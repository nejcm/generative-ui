import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { models, type Model } from '@/models'
import { Pane } from './Pane'

const render = (model: Model, effort?: string) =>
  renderToString(<Pane config={{ key: 'k', approach: 'html', modelId: model.id, settings: { effort } }} models={[model]} draft={{ prompt: '' }} stopTick={0} onChange={() => {}} />)
const effortShown = (markup: string) => markup.match(/aria-label="Effort"[^>]*>(?:<[^>]+>)*([^<]*)/)?.[1]

test('the effort picker shows only for models that list reasoning values', () => {
  const kimi = models.find((m) => m.id === 'kimi-k3-opencode-go')!
  expect(render(kimi)).toContain('aria-label="Effort"')
  const markup = render({ ...kimi, supports: { ...kimi.supports, effort: [] } })
  expect(markup).toContain('aria-label="Model"')
  expect(markup).not.toContain('aria-label="Effort"')
})

test('an effort the model does not list shows as default, matching what a run sends', () => {
  const kimi = models.find((m) => m.id === 'kimi-k3-opencode-go')!
  expect(effortShown(render(kimi, 'max'))).toBe('max')
  expect(effortShown(render(kimi, 'low'))).toBe('default')
})
