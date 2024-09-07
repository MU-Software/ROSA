import React from 'react'

import { ConfigDialog } from './config'
import { ErrorDialog } from './error'
import { LoadingDialog } from './loading'
import { ClosingOrderConfirmDialog } from './orderClosing'
import { POCAConnectionLostConfirmDialog } from './pocaConnectionLost'
import { PrintPreviewDialog } from './printPreview'
import { RefundConfirm } from './refund'

type DeskScreenDialogMode = 'loading' | 'refund' | 'error' | 'pocaConnectionLost' | 'printPreview' | 'closingOrder' | 'config' | undefined
export type DeskScreenState = {
  dialogMode?: DeskScreenDialogMode
  dialogTitle?: string
  dialogChildren?: React.ReactNode
  dialogOnConfirm?: () => void

  setDeskScreenState: React.Dispatch<React.SetStateAction<DeskScreenState>>
  closeDialog: () => void
}
export const DeskScreenContext = React.createContext<DeskScreenState>({
  setDeskScreenState: () => null,
  closeDialog: () => null,
})

export const DeskScreenProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, setState] = React.useState<DeskScreenState>({
    setDeskScreenState: () => null,
    closeDialog: () => null,
  })
  const closeDialog = () =>
    setState((ps) => ({
      ...ps,
      dialogMode: undefined,
      dialogTitle: undefined,
      dialogChildren: undefined,
      dialogOnConfirm: undefined,
    }))

  return <DeskScreenContext.Provider value={{ ...state, setDeskScreenState: setState, closeDialog }}>
    {children}
    <LoadingDialog />
    <ErrorDialog />
    <POCAConnectionLostConfirmDialog />
    <ClosingOrderConfirmDialog />
    <PrintPreviewDialog />
    <RefundConfirm />
    <ConfigDialog />
  </DeskScreenContext.Provider>
}
