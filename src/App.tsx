import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Run } from '@/lib/run'
import type { Model } from '@/models'
import { CatalogPreview } from './ui/CatalogPreview'
import { History } from './ui/History'
import { Pane, type PaneConfig, type RunRequest } from './ui/Pane'
import { PromptBar } from './ui/PromptBar'

const PANES_KEY = 'playground.panes'
const newPane = (approach: PaneConfig['approach']): PaneConfig => ({ key: crypto.randomUUID(), approach, modelId: '', settings: {} })

function loadPanes(): PaneConfig[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PANES_KEY) ?? 'null')
    if (Array.isArray(stored) && stored.length >= 2) return stored
  } catch {
    // unreadable storage falls back to defaults
  }
  return [newPane('json-render'), newPane('flat-strict'), newPane('html')]
}

export default function App() {
  const [view, setView] = useState('play')
  const [models, setModels] = useState<Model[]>()
  const [panes, setPanes] = useState(loadPanes)
  const [loaded, setLoaded] = useState<Record<string, Run>>({})
  const [draft, setDraft] = useState<Omit<RunRequest, 'batchId'>>({ prompt: '' })
  const [batch, setBatch] = useState<RunRequest>()
  const [stopTick, setStopTick] = useState(0)

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then(setModels)
      .catch(() => setModels([]))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PANES_KEY, JSON.stringify(panes))
    } catch {
      // convenience only
    }
  }, [panes])

  function openBatch(runs: Run[]) {
    const configs = runs.map((run) => ({
      key: crypto.randomUUID(),
      approach: run.approach,
      modelId: run.modelId,
      settings: run.settings as PaneConfig['settings'],
      systemOverride: run.systemOverridden ? run.system : undefined,
    }))
    setPanes(configs.length >= 2 ? configs : [...configs, newPane('html')])
    setLoaded(Object.fromEntries(configs.map((c, i) => [c.key, runs[i]])))
    setDraft({ prompt: runs[0].prompt, presetId: runs[0].presetId, fixtureId: runs[0].fixtureId })
    setView('play')
  }

  if (location.hash === '#catalog') return <CatalogPreview />

  return (
    <main className="flex flex-col gap-4 p-4">
      <Tabs value={view} onValueChange={setView}>
        <div className="flex items-center gap-4">
          <h1 className="font-semibold">Generative UI playground</h1>
          <TabsList>
            <TabsTrigger value="play">Playground</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="play" keepMounted className="flex flex-col gap-4">
          {models?.length === 0 && <p className="text-sm text-destructive">No models available: set a provider key in .env or log in to the claude or codex CLI.</p>}
          <PromptBar
            draft={draft}
            canRun={Boolean(models?.length)}
            onChange={setDraft}
            onRun={() => setBatch({ ...draft, batchId: crypto.randomUUID() })}
            onStop={() => setStopTick((t) => t + 1)}
          />
          <div className="flex items-start gap-4">
            {panes.map((config) => (
              <Pane
                key={config.key}
                config={config}
                models={models ?? []}
                draft={draft}
                batch={batch}
                stopTick={stopTick}
                loaded={loaded[config.key]}
                onChange={(next) => setPanes((ps) => ps.map((p) => (p.key === next.key ? next : p)))}
                onRemove={panes.length > 2 ? () => setPanes((ps) => ps.filter((p) => p.key !== config.key)) : undefined}
              />
            ))}
            {panes.length < 4 && (
              <Button variant="outline" onClick={() => setPanes((ps) => [...ps, newPane('json-render')])}>
                + Pane
              </Button>
            )}
          </div>
        </TabsContent>
        <TabsContent value="history">{view === 'history' && <History onOpenBatch={openBatch} />}</TabsContent>
      </Tabs>
    </main>
  )
}
