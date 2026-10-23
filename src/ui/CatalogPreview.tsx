import type { Spec } from '@json-render/core'
import { catalog, SpecView } from '@/catalog/catalog'
import type { ComponentName } from '@/catalog/schema'

const names = Object.keys(catalog.data.components) as ComponentName[]
const sampleChildren = ['sample-1', 'sample-2']

export const previewSpec: Spec = {
  root: 'preview',
  elements: {
    preview: { type: 'Stack', props: { gap: 'lg' }, children: names },
    'sample-1': { type: 'Text', props: { text: 'First child' }, children: [] },
    'sample-2': { type: 'Text', props: { text: 'Second child' }, children: [] },
    ...Object.fromEntries(
      names.map((name) => {
        const { example, slots } = catalog.data.components[name]
        return [name, { type: name, props: example, children: slots.length ? sampleChildren : [] }]
      }),
    ),
  },
}

export function CatalogPreview() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <SpecView spec={previewSpec} />
    </main>
  )
}
