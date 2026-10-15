import React from 'react'
import { toggleInList } from '../util'

interface Props {
  label: string
  idPrefix: string
  /** `key` sert d'identifiant DOM, `value` est ce qui est retenu dans la sélection. */
  options: { key: string; value: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}

/** Liste de cases à cocher en colonne, avec sélection groupée. Partagée par les écrans de configuration. */
export function CheckList({ label, idPrefix, options, selected, onChange }: Props): React.JSX.Element {
  const values = options.map((o) => o.value)
  const allChecked = values.length > 0 && values.every((v) => selected.includes(v))

  return (
    <>
      <div className="check-head">
        <label>{label}</label>
        <span className="spacer" />
        <button type="button" onClick={() => onChange(values)} disabled={allChecked || values.length === 0}>Tout</button>
        <button type="button" onClick={() => onChange([])} disabled={selected.length === 0}>Aucun</button>
      </div>
      <div className="check-list">
        {options.map((o) => (
          <label key={o.key} className="check" htmlFor={`${idPrefix}-${o.key}`}>
            <input
              id={`${idPrefix}-${o.key}`}
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => onChange(toggleInList(selected, o.value))}
            />
            {o.value}
          </label>
        ))}
      </div>
    </>
  )
}
