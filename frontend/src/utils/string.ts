import * as R from 'remeda'

export const isFilledString = (data: unknown): data is string => R.isString(data) && !R.isEmpty(data)

export const isDigit = (data: unknown): data is string => R.isString(data) && /^\d+$/.test(data)

// From https://stackoverflow.com/a/40031979
export const buf2hex = (buffer: ArrayBufferLike) => [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join('')

// Generate random safe string
export const generateRandomSecureToken = (bytes: number) => {
  const randArray = new Uint32Array(bytes)
  window.crypto.getRandomValues(randArray)
  return buf2hex(randArray)
}

export const formatDateToKorean = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${year}년 ${month}월 ${day}일`
}

export const formatTimeToKorean = (date: Date) => {
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${hour}시 ${minute}분 ${second}초`
}

export const getFullYmdStr = (d: Date) => {
  let result = d.getFullYear() + '년 '
  result += d.getMonth() + 1 + '월 '
  result += d.getDate() + '일 '
  result += d.getHours() + '시 '
  result += d.getMinutes() + '분 '
  result += d.getSeconds() + '초 '
  result += '일월화수목금토'.charAt(d.getUTCDay()) + '요일'
  return result
}
