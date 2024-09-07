export const DAY = 24 * 60 * 60 * 1000

export const calcDDay = (date?: Date | null) => {
  if (!date) return null
  const today = new Date()
  const diff = date.getTime() - today.getTime()
  const diffDay = Math.ceil(diff / DAY)
  return diffDay
}
