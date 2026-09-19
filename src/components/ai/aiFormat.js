export function formatCompactTokens(value) {
  if (!value) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

export function formatCost(cost) {
  if (!cost) return ''
  const amount = typeof cost === 'number' ? cost : cost.amount
  if (!Number.isFinite(amount)) return ''
  return `~$${amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`
}
