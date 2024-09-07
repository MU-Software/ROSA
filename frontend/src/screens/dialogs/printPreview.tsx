import { Typography } from '@mui/material'
import React from 'react'

import { DeskScreenContext } from '.'
import { usePrintLabelMutation } from '../../hooks/useAPIs'
import { ConfirmDialog } from './confirm'

export const PrintPreviewImage: React.FC<{ image: Blob }> = ({ image }) => {
  return (
    <img
      alt="인쇄 미리보기"
      src={URL.createObjectURL(image)}
      style={{
        width: '100%',
        height: 'auto',
        objectFit: 'contain',
        border: '1px solid black',
      }}
    />
  )
}

export const PrintPreviewDialog: React.FC = () => {
  const { dialogMode, dialogChildren, closeDialog, setDeskScreenState } = React.useContext(DeskScreenContext)
  const printLabelMutation = usePrintLabelMutation()

  const onConfirm = () => {
    // TODO: FIXME: 프린터 설정이 없다면 프린터가 설정되어 있지 않다는 얼랏을 띄워야 함
    setDeskScreenState((ps) => ({ ...ps, dialogMode: 'loading' }))
    printLabelMutation.mutate(undefined, {
      onSuccess: closeDialog,
      onError: () => setDeskScreenState((ps) => ({ ...ps, dialogMode: 'error', dialogChildren: <>출력 요청 중 문제가 발생했습니다.</> })),
    })
  }

  return <ConfirmDialog onCancel={closeDialog} onConfirm={onConfirm} open={dialogMode === 'printPreview'} title="인쇄 미리보기">
    {dialogChildren && <>
      {dialogChildren}
      <Typography color="text.primary" variant="body1">위 이미지로 인쇄하시겠습니까?</Typography>
      {/* TODO: FIXME: 프린터 설정이 없다면 프린터 설정이 없어서 출력할 수 없다는 얼랏을 띄워야 함 */}
    </>}
  </ConfirmDialog>
}
