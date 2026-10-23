import { CatalogPreview } from './ui/CatalogPreview'

export default function App() {
  if (location.hash === '#catalog') return <CatalogPreview />
  return <main className="p-6 text-xl font-semibold">Generative UI playground</main>
}
