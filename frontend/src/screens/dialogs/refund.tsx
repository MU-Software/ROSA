import { TextField, Typography } from '@mui/material'
import React from 'react'

import { DeskScreenContext } from '.'
import { useRefundOrderMutation } from '../../hooks/useAPIs'
import { ConfirmDialog } from './confirm'
import { ErrorToComponent } from './error'

export const RefundConfirm: React.FC = () => {
  const otpInputRef = React.useRef<HTMLInputElement>(null)
  const { dialogMode, setDeskScreenState, closeDialog } = React.useContext(DeskScreenContext)

  const refundOrderMutation = useRefundOrderMutation()
  const refundOrder = () => {
    if (!otpInputRef.current) return
    if (!otpInputRef.current.checkValidity() || !otpInputRef.current.value.match(/^[0-9]{6}$/)) {
      setDeskScreenState((ps) => ({ ...ps, dialogMode: 'error', dialogChildren: 'OTP 코드는 6자리 숫자여야 합니다.' }))
      return
    }

    setDeskScreenState((ps) => ({ ...ps, dialogMode: 'loading' }))
    refundOrderMutation.mutate(otpInputRef.current.value, {
      onSuccess: closeDialog,
      onError: (e) => setDeskScreenState((ps) => ({ ...ps, dialogMode: 'error', children: <ErrorToComponent error={e} /> })),
    })
  }

  return <ConfirmDialog onCancel={closeDialog} onConfirm={refundOrder} open={dialogMode === 'refund'} title="주문 환불">
    <Typography color="text.primary" variant="body1">
      주문을 환불 하시겠습니까? 이 작업은 취소할 수 없습니다!<br />
      환불을 진행하시려면 아래에 OTP 코드를 입력해주세요.<br />
      (OTP 코드는 홈페이지팀에 문의해주세요.)<br />
    </Typography>
    <TextField
      fullWidth
      inputProps={{ pattern: '[0-9]{6}' }}
      inputRef={otpInputRef}
      label="OTP 코드"
      variant="standard"
    />
  </ConfirmDialog>
}
