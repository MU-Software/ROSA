import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import * as R from 'remeda'

import { APIErrorResponseType, AppState, DeskStatus, Order, OrderModifyRequest, SetDevices, USBDevice } from '../models'
import { isAllTrue } from '../utils'

export const DOMAIN = import.meta.env.VITE_POCA_URL
export const WS_DOMAIN = import.meta.env.VITE_POCA_WS_URL
const DEFAULT_TIMEOUT = 15 * 1000 // 15 seconds

export type RequestFetchMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RequestFetchArguments = {
  route: string
  method: RequestFetchMethod
  data?: Record<string, unknown> | Record<string, unknown>[]
  expectedMediaType?: string
}

const isJsonParsable = (data: unknown): boolean => {
  try {
    JSON.parse(data as string)
    return true
  } catch (e: unknown) {
    console.log('isJsonParsable', e)
    return false
  }
}

const isAPIErrorResponseType = (data: unknown): data is APIErrorResponseType => {
  const errReasonObjChecker = R.allPass<APIErrorResponseType['errors'][0]>([R.isObjectType, (d) => R.isString(d.code), (d) => R.isString(d.detail)])

  const errObjChecker = R.allPass<APIErrorResponseType>([
    R.isObjectType,
    (d) => R.isString(d.type),
    (d) => R.isArray(d.errors),
    (d) => R.allPass(d.errors, [R.isArray, (de) => R.hasAtLeast(de, 1), (de) => isAllTrue(de.map(errReasonObjChecker))]),
  ])

  try {
    return errObjChecker(data as APIErrorResponseType)
  } catch (e: unknown) {
    console.log('isAPIErrorResponseType', e)
    return false
  }
}

export class RequestError extends Error {
  readonly status: number
  readonly payload: string

  constructor(message: string, status: number, payload: string) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.payload = payload
  }

  toAlertString() {
    if (isJsonParsable(this.payload)) {
      const errObj = JSON.parse(this.payload)
      return ((isAPIErrorResponseType(errObj) && R.first(errObj.errors)?.detail) || errObj.message) ?? this.message
    }

    return this.message
  }
}

export const LocalRequest: <T>(reqOption: RequestFetchArguments) => Promise<T> = async (reqOption) => {
  const result = await fetch(`${DOMAIN}/${reqOption.route}`, {
    method: reqOption.method,
    cache: 'no-cache',
    redirect: 'follow',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    referrerPolicy: 'origin',
    mode: 'cors',
    ...(['POST', 'PUT', 'PATCH'].includes(reqOption.method) ? { body: JSON.stringify(reqOption.data ?? {}) as BodyInit } : {}),
  })
  if (!result.ok) throw new RequestError('요청에 실패했습니다.', result.status, await result.text())

  return reqOption.expectedMediaType === undefined || reqOption.expectedMediaType === 'application/json' ? await result.json() : await result.blob()
}

export const QUERY_KEYS = {
  GET_DEVICES_POSSIBLES: ['query', 'devices', 'possibles'],
}

export const MUTATION_KEYS = {
  SET_SESSION_DESK_STATUS: ['mutation', 'desk', 'set'],
  SET_SESSION_ORDER: ['mutation', 'order', 'set'],
  SET_CONFIG_DOMAIN: ['mutation', 'config', 'shop_domain'],
  SET_CONFIG_DEVICES: ['mutation', 'config', 'devices'],
  CLEAR_SESSION: ['mutation', 'clear'],
  CHECK_SHOP_API_CONNECTION: ['mutation', 'shop', 'check'],
  SEARCH_ORDER: ['mutation', 'order', 'search'],
  MODIFY_ORDER: ['mutation', 'order', 'modify'],
  REFUND_ORDER: ['mutation', 'order', 'refund'],
  PREVIEW_LABEL: ['mutation', 'label', 'preview'],
  PRINT_LABEL: ['mutation', 'label', 'print'],
}

// ==================== Query Hooks ====================

export const useListPossibleDevicesQuery = () =>
  useSuspenseQuery({
    queryKey: QUERY_KEYS.GET_DEVICES_POSSIBLES,
    queryFn: () => LocalRequest<USBDevice[]>({ route: 'config/devices/possibles', method: 'GET' }),
  })

// ==================== Mutation Hooks ====================

export const useSetSessionOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_SESSION_ORDER,
    mutationFn: (orderId: string) => LocalRequest<AppState>({ route: `session/order?order_id=${orderId}`, method: 'PUT' }),
  })

export const useSetSessionDeskStatusMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_SESSION_DESK_STATUS,
    mutationFn: (deskStatus: DeskStatus) => LocalRequest<AppState>({ route: `session/desk?status=${deskStatus}`, method: 'PUT' }),
  })

export const useSetShopDomainConfigMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_CONFIG_DOMAIN,
    mutationFn: (config: AppState['shop_api']) => LocalRequest<AppState>({ route: 'config/domain', method: 'PUT', data: config }),
  })

export const useSetDevicesConfigMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_CONFIG_DEVICES,
    mutationFn: (config: SetDevices) => LocalRequest<AppState>({ route: 'config/devices', method: 'PUT', data: config }),
  })

export const useClearSessionMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.CLEAR_SESSION,
    mutationFn: () => LocalRequest<AppState>({ route: 'session', method: 'DELETE' }),
  })

export const useCheckShopAPIConnectionMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.CHECK_SHOP_API_CONNECTION,
    mutationFn: () => LocalRequest<{ status: boolean }>({ route: 'config/domain/check-connectivity', method: 'GET' }),
  })

export const useSearchOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SEARCH_ORDER,
    mutationFn: (keyword: string) => LocalRequest<Order[]>({ route: `session/order?custom_responses=${keyword}`, method: 'GET' }),
  })

export const useModifyOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.MODIFY_ORDER,
    mutationFn: (req: OrderModifyRequest) => LocalRequest<Order>({ route: `session/order`, method: 'PATCH', data: req }),
  })

export const useRefundOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.REFUND_ORDER,
    mutationFn: (otpCode: string) => LocalRequest<Order>({ route: `session/order?otp=${otpCode}`, method: 'DELETE' }),
  })

export const usePreviewLabelMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.PREVIEW_LABEL,
    mutationFn: () => LocalRequest<Blob>({ route: 'label/preview', method: 'GET', expectedMediaType: 'image/png' }),
  })

export const usePrintLabelMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.PRINT_LABEL,
    mutationFn: () => LocalRequest<AppState>({ route: 'label/print', method: 'POST' }),
  })
