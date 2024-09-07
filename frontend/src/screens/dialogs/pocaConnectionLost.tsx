import { Typography } from '@mui/material'
import React from 'react'

import { DeskScreenContext } from '.'
import { ConfirmDialog } from './confirm'

export const POCAConnectionLostConfirmDialog: React.FC = () => {
  const { dialogMode } = React.useContext(DeskScreenContext)
  return <ConfirmDialog onConfirm={() => window.location.reload()} open={dialogMode === 'pocaConnectionLost'} title="POCA 연결 끊김">
    <Typography>POCA와의 연결이 끊겼습니다, &quot;확인&quot;을 누르시면 새로고침됩니다.</Typography>
  </ConfirmDialog>
}
