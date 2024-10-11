import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import * as R from 'remeda'

import { LOCAL_STORAGE_SESSION_ID_KEY } from '../consts/globals'
import { APIErrorResponseType, DeskStatus, Order, OrderModifyRequest, SessionState, SessionStateConfig, SetDeviceRequest, USBDevice } from '../models'
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
    headers: new Headers({
      'Content-Type': 'application/json',
      'X-Session-ID': window.localStorage.getItem(LOCAL_STORAGE_SESSION_ID_KEY) ?? '',
    }),
    credentials: 'include',
    referrerPolicy: 'origin',
    mode: 'cors',
    ...(['POST', 'PUT', 'PATCH'].includes(reqOption.method) ? { body: JSON.stringify(reqOption.data ?? {}) as BodyInit } : {}),
  })
  if (!result.ok) throw new RequestError('요청에 실패했습니다.', result.status, await result.text())

  return reqOption.expectedMediaType === undefined || reqOption.expectedMediaType === 'application/json' ? await result.json() : await result.blob()
}

export const QUERY_KEYS = {
  GET_SESSION: ['query', 'session'],
  GET_DEVICES_POSSIBLES: ['query', 'devices', 'possibles'],
}

export const MUTATION_KEYS = {
  SET_SESSION_DESK_STATUS: ['mutation', 'desk', 'set'],
  SET_SESSION_ORDER: ['mutation', 'order', 'set'],
  SET_CONFIG_DOMAIN: ['mutation', 'config', 'shop_domain', 'set'],
  SET_CONFIG_DEVICE: ['mutation', 'config', 'device', 'set'],
  SET_CONFIG_SESSION_STATE: ['mutation', 'config', 'session_state', 'set'],
  DELETE_CONFIG_DEVICE: ['mutation', 'config', 'device', 'delete'],
  CREATE_SESSION: ['mutation', 'session', 'create'],
  CHECK_SHOP_API_CONNECTION: ['mutation', 'shop', 'check'],
  SEARCH_ORDER: ['mutation', 'order', 'search'],
  MODIFY_ORDER: ['mutation', 'order', 'modify'],
  REFUND_ORDER: ['mutation', 'order', 'refund'],
  PREVIEW_LABEL: ['mutation', 'label', 'preview'],
  PRINT_LABEL: ['mutation', 'label', 'print'],
}

// ==================== Query Hooks ====================
export const useSessionQuery = () =>
  useSuspenseQuery({
    queryKey: QUERY_KEYS.GET_SESSION,
    queryFn: () => LocalRequest<SessionState>({ route: 'session', method: 'POST' }),
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  })

export const useListPossibleDevicesQuery = () =>
  useSuspenseQuery({
    queryKey: QUERY_KEYS.GET_DEVICES_POSSIBLES,
    queryFn: () => LocalRequest<USBDevice[]>({ route: 'config/devices/possibles', method: 'GET' }),
  })

// ==================== Mutation Hooks ====================
export const useCreateSessionMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.CREATE_SESSION,
    mutationFn: () => LocalRequest<SessionState>({ route: 'session', method: 'POST' }),
  })

export const useListSessionMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.CREATE_SESSION,
    mutationFn: () => LocalRequest<SessionState[]>({ route: 'session', method: 'GET' }),
  })

export const useSetSessionOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_SESSION_ORDER,
    mutationFn: (orderId: string) => LocalRequest<SessionState>({ route: `session/my/order?order_id=${orderId}`, method: 'PUT' }),
  })

export const useSetSessionDeskStatusMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_SESSION_DESK_STATUS,
    mutationFn: (deskStatus: DeskStatus) => LocalRequest<SessionState>({ route: `session/my/desk?status=${deskStatus}`, method: 'PUT' }),
  })

export const useSetShopDomainConfigMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_CONFIG_DOMAIN,
    mutationFn: (config: SessionState['app_state']['shop_api']) => LocalRequest<SessionState>({ route: 'config/shop-domain', method: 'PUT', data: config }),
  })

export const useSetSessionStateConfigMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_CONFIG_SESSION_STATE,
    mutationFn: (config: SessionStateConfig) => LocalRequest<SessionState>({ route: 'config/session-state', method: 'PUT', data: config }),
  })

export const useSetDeviceConfigMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SET_CONFIG_DEVICE,
    mutationFn: (payload: SetDeviceRequest) => LocalRequest<SessionState>({ route: `session/my/devices/${payload.deviceType}`, method: 'PUT', data: payload }),
  })

export const useDeleteDeviceConfigMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.DELETE_CONFIG_DEVICE,
    mutationFn: (deviceType: 'reader' | 'printer') => LocalRequest<SessionState>({ route: `session/my/devices/${deviceType}`, method: 'DELETE' }),
  })

export const useCheckShopAPIConnectionMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.CHECK_SHOP_API_CONNECTION,
    mutationFn: () => LocalRequest<{ status: boolean }>({ route: 'config/shop-domain/check-connectivity', method: 'GET' }),
  })

export const useSearchOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.SEARCH_ORDER,
    mutationFn: (keyword: string) => LocalRequest<Order[]>({ route: `session/my/order?custom_responses=${keyword}`, method: 'GET' }),
  })

export const useModifyOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.MODIFY_ORDER,
    mutationFn: (req: OrderModifyRequest) => LocalRequest<Order>({ route: `session/my/order`, method: 'PATCH', data: req }),
  })

export const useRefundOrderMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.REFUND_ORDER,
    mutationFn: (otpCode: string) => LocalRequest<Order>({ route: `session/my/order?otp=${otpCode}`, method: 'DELETE' }),
  })

export const usePreviewLabelMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.PREVIEW_LABEL,
    mutationFn: () => LocalRequest<string[]>({ route: 'label/preview', method: 'GET' }),
  })

export const usePrintLabelMutation = () =>
  useMutation({
    mutationKey: MUTATION_KEYS.PRINT_LABEL,
    mutationFn: () => LocalRequest<SessionState>({ route: 'label/print', method: 'POST' }),
  })
