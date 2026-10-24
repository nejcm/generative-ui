import { fixtures, presets } from '@/prompts'
import { Choice } from './Choice'
import type { RunRequest } from './Pane'

type Draft = Omit<RunRequest, 'batchId'>

export function PromptBar({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const preset = presets.find((p) => p.id === draft.presetId)
  return (
    <section className="panel flex flex-col gap-2.5" style={{ padding: 14 }} aria-label="Prompt">
      <div className="flex items-center gap-2">
        <label htmlFor="prompt" className="lbl">
          Prompt
        </label>
        <span className={`tag${preset ? ' tag-sig' : ''}`}>{preset ? `Preset: ${preset.label}` : draft.prompt.trim() ? 'Free text' : 'Empty'}</span>
        <div className="ml-auto w-[200px]">
          <Choice
            label="Fixture"
            value={draft.fixtureId ?? ''}
            options={[
              { value: '', label: 'No fixture' },
              ...Object.keys(fixtures).map((id) => ({
                value: id,
                label: `Fixture: ${id}`,
              })),
            ]}
            onChange={(id) => onChange({ ...draft, fixtureId: id || undefined })}
          />
        </div>
      </div>
      <textarea
        id="prompt"
        className="prompt"
        placeholder="Describe the UI to generate, or pick a preset below"
        value={draft.prompt}
        onChange={(e) => onChange({ ...draft, prompt: e.target.value, presetId: undefined })}
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Presets">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip${p.id === draft.presetId ? ' on' : ''}`}
            aria-pressed={p.id === draft.presetId}
            onClick={() =>
              onChange({
                prompt: p.prompt,
                presetId: p.id,
                fixtureId: p.fixtureId,
              })
            }
          >
            {p.label}
            {p.fixtureId && <span className="fx">{p.fixtureId}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
