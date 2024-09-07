import { Box, CircularProgress, Dialog, DialogContent, DialogTitle } from '@mui/material'
import React from 'react'

import { DeskScreenContext } from '.'

export const LoadingDialog: React.FC = () => {
  const { dialogMode } = React.useContext(DeskScreenContext)
  return (
    <Dialog disableEscapeKeyDown open={dialogMode === 'loading'}>
      <DialogTitle>로딩 중입니다, 잠시만 기다려주세요...</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 2 }}>
          만약 5초 이상 로딩이 지속된다면, F5 버튼으로 새로고침을 시도해주세요.
          <br />
          <br />
          <CircularProgress />
        </Box>
      </DialogContent>
    </Dialog>
  )
}
