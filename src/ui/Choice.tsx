import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Option<T> = { value: T; label: string }

export function Choice<T extends string>(props: { label: string; value: T; options: Option<T>[]; onChange: (value: T) => void }) {
  return (
    <Select items={props.options} value={props.value} onValueChange={(v) => v !== null && props.onChange(v)}>
      <SelectTrigger aria-label={props.label} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
