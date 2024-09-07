import { Card, CardContent, Chip, List, ListItem, ListItemButton, Typography } from '@mui/material'
import React from 'react'
import DinoGame from 'react-chrome-dino-ts'
import 'react-chrome-dino-ts/index.css'
import * as R from 'remeda'

import { CenteredPage, Page } from '../../components/layouts/page'
import { Order } from '../../models'
import { getTicketInfoFromOrder } from '../../utils/order'

const OrderSearchResultListItem: React.FC<{ order: Order; onClick?: () => void }> = ({ order, onClick }) => {
  const ticketInfo = getTicketInfoFromOrder(order)
  // TODO: FIXME: 단일 상품일 것을 가정하고 작성된 로직임
  const isUsed = order.products.length !== 0 && order.products[0].status === 'used'
  const isRefunded = order.products.length !== 0 && order.products[0].status === 'refunded'
  return (
    <ListItem disablePadding>
      <ListItemButton alignItems="flex-start" onClick={onClick} sx={{ flexDirection: 'column' }}>
        <Card sx={{ width: '100%' }}>
          <CardContent>
            <Typography color="text.secondary" variant="body2">
              {new Date(order.first_paid_at).toLocaleString()}
              &nbsp;
              <Chip
                color={isUsed ? 'success' : isRefunded ? 'error' : 'primary'}
                label={order.current_status}
                size="small"
                sx={{ fontSize: '0.75rem', lineHeight: '0.75rem', height: '1.25rem' }}
              />
            </Typography>
            <Typography color="text.primary" variant="h6">{ticketInfo.name} {`소속 : ${ticketInfo.org}`}</Typography>
            <Typography color="text.secondary" variant="subtitle1">{ticketInfo.phone} / {ticketInfo.email}</Typography>
          </CardContent>
        </Card>
      </ListItemButton>
    </ListItem>
  )
}

export const OrderIdlePage: React.FC<{
  orders?: Order[]
  setOrder?: (orderId: string) => void
}> = ({ orders, setOrder }) => {
  const [easterEggCounter, setEasterEggCounter] = React.useState(0)
  const incrEggCounter = () => setEasterEggCounter(easterEggCounter + 1)

  if (!R.isArray(orders))
    return (
      <CenteredPage>
        <h3 onClick={incrEggCounter} style={{ fontWeight: 'bold' }}>QR 코드를 인식하거나 위의 검색 창에 주문 정보를 입력해주세요.</h3>
        {easterEggCounter > 10 && (
          <details open style={{ width: '100%' }}>
            <summary>이스터 에그 발견! 🥚</summary>
            <fieldset>
              <legend>스페이스바를 눌러보세요! 🦖</legend>
              <DinoGame hideInstructions />
            </fieldset>
          </details>
        )}
      </CenteredPage>
    )

  if (R.isEmpty(orders))
    return <CenteredPage><h3 style={{ fontWeight: 'bold' }}>주문 내역을 찾을 수 없습니다. 다른 검색어로 검색해주세요.</h3></CenteredPage>

  return <Page>
      <Typography component="div" sx={{ fontWeight: 'bold' }} variant="h4">검색 결과</Typography>
      <List sx={{ width: '100%' }}>{orders.map((o) => <OrderSearchResultListItem key={o.id} onClick={() => setOrder?.(o.id)} order={o} />)}</List>
    </Page>
}
