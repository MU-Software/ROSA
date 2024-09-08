export type DeskStatus = 'idle' | 'registering' | 'closed'
export type OrderProductStatus = 'pending' | 'paid' | 'used' | 'refunded'
export type PaymentHistoryStatus = 'pending' | 'completed' | 'partial_refunded' | 'refunded'

export type APIErrorResponseType = {
  type: string
  errors: {
    code: string
    detail: string
    attr?: string
  }[]
}

export type OrderModifyRequest = {
  products: {
    id: string // UUID
    status?: OrderProductStatus
    options?: {
      id: string // UUID
      custom_response: string
    }[]
  }[]
}

export type Order = {
  id: string // UUID
  first_paid_price: number
  first_paid_at: string // ISO8601
  current_paid_price: number
  current_status: PaymentHistoryStatus

  payment_histories: {
    status: PaymentHistoryStatus
    price: number
    created_at: string // ISO8601
  }[]
  products: {
    id: string // UUID
    price: number
    donation_price: number
    status: OrderProductStatus
    product: {
      id: string // UUID
      name: string
      price: number
    }
    options: {
      id: string // UUID
      product_option_group: {
        id: string // UUID
        name: string
        is_custom_response: boolean
        custom_response_pattern: string | null
      }
      product_option: {
        id: string // UUID
        name: string
        additional_price: number
      } | null
      custom_response: string | null
    }[]
  }[]
  user: {
    id: number
    username: string
    email: string
  }
}

export type USBDevice = {
  id: string
  bus: number
  device: number
  block_path: string
  cdc_path: string
  name: string
}

export type SetDevices = {
  reader_names: string[]
  printer_names: string[]
}

export type AppState = {
  shop_api: {
    domain: string
    api_key: string
    api_secret: string
  }

  readers: USBDevice[]
  printers: USBDevice[]

  desk_status: DeskStatus
  order: Order | null
  handled_order: Order[]

  commit_id: string
}

export const INITIAL_APP_SESSION_STATE: AppState = {
  shop_api: {
    domain: '',
    api_key: '',
    api_secret: '',
  },

  readers: [],
  printers: [],

  desk_status: 'closed',
  order: null,
  handled_order: [],

  commit_id: '',
}
