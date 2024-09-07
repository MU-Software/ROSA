import { Typography } from '@mui/material'
import React from 'react'

import { DeskScreenContext } from '.'
import { RequestError } from '../../hooks/useAPIs'
import { ConfirmDialog } from './confirm'

export const ErrorToComponent: React.FC<{ error: Error }> = ({ error }) => {
  console.log(error)
  if (error instanceof RequestError)
    return <Typography color="text.primary" variant="body1">{error.toAlertString()}</Typography>

  return <>
    <Typography color="text.primary" variant="body1">문제가 발생했습니다. 다시 시도해주세요.</Typography>
    <Typography color="text.secondary" variant="caption">{JSON.stringify(error)}</Typography>
  </>
}

export const ErrorDialog: React.FC = () => {
  const { dialogMode, dialogChildren, setDeskScreenState } = React.useContext(DeskScreenContext)
  const closeDialog = () => setDeskScreenState((ps) => ({ ...ps, dialogMode: undefined, dialogChildren: undefined }))

  return (
    <ConfirmDialog onConfirm={closeDialog} open={dialogMode === 'error'} title="문제가 발생했습니다">
      <Typography color="text.primary" variant="body1">{dialogChildren ?? '문제가 발생했습니다. 다시 시도해주세요.'}</Typography>
    </ConfirmDialog>
  )
}
