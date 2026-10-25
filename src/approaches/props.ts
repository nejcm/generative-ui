import { componentProps, type ComponentName } from '@/catalog/schema'

type Validator = { safeParse(v: unknown): { success: boolean } }

// Own keys only: a prop named like an Object.prototype member (toString) must not resolve to a function.
export const validatorOf = (type: unknown, key: string): Validator | undefined => {
  const shape: Record<string, Validator> = typeof type === 'string' && Object.hasOwn(componentProps, type)
    ? componentProps[type as ComponentName].shape : {}
  return Object.hasOwn(shape, key) ? shape[key] : undefined
}

export function decodeProp(type: unknown, key: string, value: string): unknown {
  try {
    const decoded: unknown = JSON.parse(value)
    if (validatorOf(type, key)?.safeParse(decoded).success) return decoded
  } catch {}
  return value
}

// An optional prop that fails its schema costs only that prop, not the element (and its subtree).
export const droppableProps = (type: unknown, props: Record<string, unknown>) =>
  Object.keys(props).filter((key) => {
    const validator = validatorOf(type, key)
    return validator && !validator.safeParse(props[key]).success && validator.safeParse(undefined).success
  })

// Static approaches cannot use the catalog's state and event binding hints.
export const componentLines = (prompt: string) =>
  prompt
    .split('\n')
    .filter((line) => Object.keys(componentProps).some((name) => line.startsWith(`- ${name}: `)))
    .map((line) => line.replace(/ Bind [^.]*\./g, ''))
