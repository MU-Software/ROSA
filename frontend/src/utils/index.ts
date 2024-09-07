import * as R from 'remeda'

/**
 * Check if all elements in the array are true
 * @param arr Array to check
 * @returns If all elements are true
 */
export const isAllTrue = (arr: unknown): arr is true[] => {
  return R.isArray(arr) && !R.isEmpty(arr) && arr.every((v) => v === true)
}
