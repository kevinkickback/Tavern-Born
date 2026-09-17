/** Format a value stored in copper pieces using the largest useful denominations. */
export function formatCopperValue(value: number): string {
  if (value >= 100) {
    const gp = Math.floor(value / 100)
    const remainingCopper = value % 100
    if (remainingCopper === 0) return `${gp} gp`
    if (remainingCopper % 10 === 0) return `${gp} gp ${remainingCopper / 10} sp`
    return `${gp} gp ${remainingCopper} cp`
  }
  if (value >= 10 && value % 10 === 0) return `${value / 10} sp`
  return `${value} cp`
}
