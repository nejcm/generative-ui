import { Button } from '@/components/ui/button'
import { fixtures, presets } from '@/prompts'
import { Choice } from './Choice'
import type { RunRequest } from './Pane'

type Draft = Omit<RunRequest, 'batchId'>

type Props = { draft: Draft; canRun: boolean; onChange: (draft: Draft) => void; onRun: () => void; onStop: () => void }

export function PromptBar({ draft, canRun, onChange, onRun, onStop }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Choice
          label="Preset"
          value={draft.presetId ?? ''}
          options={[{ value: '', label: 'Free text' }, ...presets.map((p) => ({ value: p.id, label: p.label }))]}
          onChange={(id) => {
            const preset = presets.find((p) => p.id === id)
            onChange(preset ? { prompt: preset.prompt, presetId: preset.id, fixtureId: preset.fixtureId } : { ...draft, presetId: undefined })
          }}
        />
        <Choice
          label="Fixture"
          value={draft.fixtureId ?? ''}
          options={[{ value: '', label: 'No fixture' }, ...Object.keys(fixtures).map((id) => ({ value: id, label: `Fixture: ${id}` }))]}
          onChange={(id) => onChange({ ...draft, fixtureId: id || undefined })}
        />
        <Button disabled={!canRun || !draft.prompt.trim()} onClick={onRun}>
          Run all
        </Button>
        <Button variant="outline" onClick={onStop}>
          Stop all
        </Button>
      </div>
      <textarea
        aria-label="Prompt"
        placeholder="Describe the UI to generate"
        className="h-20 w-full rounded-md border bg-transparent p-2 text-sm"
        value={draft.prompt}
        onChange={(e) => onChange({ ...draft, prompt: e.target.value, presetId: undefined })}
      />
    </div>
  )
}
