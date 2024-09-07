import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import React from 'react'

type ConfirmDialogProps = React.PropsWithChildren<{
  title?: string
  open: boolean
  onCancel?: () => void
  onConfirm: () => void
}>

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, children, open, onCancel, onConfirm }) => {
  return (
    <Dialog disableEscapeKeyDown open={open}>
      {title && <DialogTitle>{title}</DialogTitle>}
      <DialogContent dividers>{children}</DialogContent>

      <DialogActions>
        {onCancel && <Button onClick={onCancel}>취소</Button>}
        <Button onClick={onConfirm}>확인</Button>
      </DialogActions>
    </Dialog>
  )
}
