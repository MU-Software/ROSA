import * as R from 'remeda'

import { Order } from '../models'

export const getOrderNameFromOrder = (order: Order): string => {
  return order.products.length === 0
    ? '알 수 없는 구매 이력'
    : order.products[0].product.name + (order.products.length - 1 === 0 ? '' : ` 외 ${order.products.length - 1}개`)
}

type TicketInfo = {
  name: string
  org: string
  email: string
  phone: string
}

export const getTicketInfoFromOrder = (order: Order): TicketInfo => {
  let name = '알 수 없는 구매자'
  let org = '알 수 없는 소속'
  let email = '알 수 없는 이메일'
  let phone = '알 수 없는 전화번호'

  if (
    !(
      R.isObjectType(order) &&
      R.isArray(order.products) && !R.isEmpty(order.products) &&
      R.isArray(order.products[0].options) && !R.isEmpty(order.products[0].options)
    )
  )
    return { name, org, email, phone }

  order.products[0].options.forEach((option) => {
    if (option.product_option_group.is_custom_response) {
      switch (option.product_option_group.name) {
        case '성함':
          name = option.custom_response || '알 수 없는 구매자'
          break
        case '소속':
          org = option.custom_response || '알 수 없는 소속'
          break
        case '이메일':
          email = option.custom_response || '알 수 없는 이메일'
          break
        case '연락처 번호 (-를 포함해주세요!)':
          phone = option.custom_response || '알 수 없는 전화번호'
          break
      }
    }
  })

  return { name, org, email, phone }
}

type OrderProductOptionsType = Order['products'][0]['options'][0]
/**
 * is_custom_response인 옵션을 우선적으로 노출되도록 정렬합니다.
 * @param a 비교할 OrderProductOptionsType
 * @param b 비교할 OrderProductOptionsType
 */
export const compareOrderProductOptions = (a: OrderProductOptionsType, b: OrderProductOptionsType) => {
  if (a.product_option_group.is_custom_response === b.product_option_group.is_custom_response) return 0
  return a.product_option_group.is_custom_response ? -1 : 1
}

export const compareOrderProductOptionsReverse = (a: OrderProductOptionsType, b: OrderProductOptionsType) => {
  return -compareOrderProductOptions(a, b)
}

/**
 * option_group의 이름으로 정렬합니다.
 * @param a 비교할 OrderProductOptionsType
 * @param b 비교할 OrderProductOptionsType
 */
export const compareOrderOptionGroupsByName = (a: OrderProductOptionsType, b: OrderProductOptionsType) => {
  if (a.product_option_group.name === b.product_option_group.name) return 0
  return a.product_option_group.name < b.product_option_group.name ? -1 : 1
}
