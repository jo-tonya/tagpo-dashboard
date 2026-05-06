'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

// 数値入力。フォーカス外し時にカンマ区切りで表示し、内部値はカンマなしの文字列で保持する。
// integerOnly=true で整数のみ受け付ける（売上予算など）。
export function NumericInput({
  value,
  onChange,
  readOnly,
  className,
  placeholder,
  integerOnly = false,
}: {
  value: string
  onChange?: (val: string) => void
  readOnly?: boolean
  className?: string
  placeholder?: string
  integerOnly?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const displayValue = (!focused && value)
    ? Number(value).toLocaleString('ja-JP')
    : value
  const pattern = integerOnly ? /^-?\d*$/ : /^-?\d*\.?\d*$/
  return (
    <Input
      type="text"
      inputMode={integerOnly ? 'numeric' : 'decimal'}
      value={displayValue}
      onChange={e => {
        const raw = e.target.value.replace(/,/g, '')
        if (raw === '' || pattern.test(raw)) onChange?.(raw)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      readOnly={readOnly}
      className={className}
      placeholder={placeholder}
    />
  )
}
