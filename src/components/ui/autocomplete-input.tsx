import { type ComponentProps, useId } from 'react'
import { Input } from './input'

/** Native editable suggestions; callers decide whether values outside the list are allowed. */
export function AutocompleteInput({
  options,
  ...props
}: ComponentProps<typeof Input> & { options: readonly { value: string; label?: string }[] }) {
  const listId = useId()
  return (
    <>
      <Input {...props} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={JSON.stringify([option.value, option.label])} value={option.value}>
            {option.label ?? option.value}
          </option>
        ))}
      </datalist>
    </>
  )
}
