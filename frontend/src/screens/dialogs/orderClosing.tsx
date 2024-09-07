import { Typography } from '@mui/material'
import React from 'react'

import { DeskScreenContext } from '.'
import { ConfirmDialog } from './confirm'

export const ClosingOrderConfirmDialog: React.FC = () => {
  const { dialogMode, dialogTitle, dialogOnConfirm, closeDialog } = React.useContext(DeskScreenContext)
  return <ConfirmDialog onCancel={closeDialog} onConfirm={dialogOnConfirm ?? (() => { })} open={dialogMode === 'closingOrder'} title={dialogTitle ?? '주문 닫기'}>
    <Typography>
      현재 주문이 닫혀요, 이동하시겠어요?<br />
      (좌측 주문 이력에서 다시 돌아올 수 있어요.)
    </Typography>
  </ConfirmDialog>
}
