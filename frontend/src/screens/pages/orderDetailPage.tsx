import { Close } from '@mui/icons-material'
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber'
import EditIcon from '@mui/icons-material/Edit'
import MoneyOffIcon from '@mui/icons-material/MoneyOff'
import PrintIcon from '@mui/icons-material/Print'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  List,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  styled,
  tableCellClasses,
} from '@mui/material'
import React from 'react'

import { Won } from '../../components/elements/won'
import { Page } from '../../components/layouts/page'
import { useModifyOrderMutation, usePreviewLabelMutation } from '../../hooks/useAPIs'
import { GlobalContext } from '../../main'
import { Order } from '../../models'
import { getFormValue } from '../../utils/form'
import { compareOrderOptionGroupsByName, compareOrderProductOptionsReverse } from '../../utils/order'
import { DeskScreenContext } from '../dialogs'
import { ErrorToComponent } from '../dialogs/error'
import { PrintPreviewImage } from '../dialogs/printPreview'

const PNG_BASE64_HEADER = "data:image/png;base64,"

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  '&:nth-of-type(even)': {
    backgroundColor: theme.palette.grey[100],
  },

  [`& > .${tableCellClasses.root}`]: {
    textAlign: 'center',
    whiteSpace: 'nowrap',
    border: `1px solid ${theme.palette.divider}`,
    [`&.${tableCellClasses.head}`]: {
      fontWeight: 'bold',
      backgroundColor: theme.palette.grey[300],
    },
    '&:first-of-type': {
      fontWeight: 'bold',
      width: '40%',
    },
  },
}))

const SpaceBetweenHeaderAndButton = styled(Box)(({ theme }) => ({
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  marginBottom: theme.spacing(2),
}))

const ProductPropertyCard = styled(Card)(({ theme }) => ({
  width: '100%',
  height: 'max-content',
  overflow: 'visible',
  marginBottom: theme.spacing(2),
}))

const ProductOptionDetailListItem: React.FC<{
  orderProductOptionRel: Order['products'][0]['options'][0]
  inputDisabled?: boolean
  onChange: () => void
}> = ({ orderProductOptionRel, inputDisabled, onChange }) => {
  const response = orderProductOptionRel.product_option_group.is_custom_response
    ? orderProductOptionRel.custom_response
    : orderProductOptionRel.product_option?.name
  const responsePattern = new RegExp(orderProductOptionRel.product_option_group.custom_response_pattern || '', 'g')
  const [errorText, setErrorText] = React.useState('')

  return (
    <StyledTableRow hover key={orderProductOptionRel.id}>
      <TableCell>{orderProductOptionRel.product_option_group.name}</TableCell>
      <TableCell>
        <TextField
          defaultValue={response}
          disabled={!orderProductOptionRel.product_option_group.is_custom_response || inputDisabled}
          error={!!errorText}
          helperText={errorText}
          inputProps={{ pattern: responsePattern.source }}
          name={orderProductOptionRel.id}
          onChange={(e) => {
            if (!e.currentTarget.checkValidity()) {
              setErrorText(`입력 형식이 일치하지 않습니다. (${responsePattern.source})`)
              onChange()
            } else {
              setErrorText('')
              onChange()
            }
          }}
          sx={{ width: '100%' }}
          variant="standard"
        />
      </TableCell>
    </StyledTableRow>
  )
}

const ProductDetailListItem: React.FC<{ order: Order | null; orderProductRel: Order['products'][0] }> = ({ order, orderProductRel }) => {
  const formRef = React.useRef<HTMLFormElement>(null)
  const { setDeskScreenState, closeDialog } = React.useContext(DeskScreenContext)
  const onError = (e: Error) => setDeskScreenState((ps) => ({ ...ps, dialogMode: 'error', dialogChildren: <ErrorToComponent error={e} /> }))
  const showLoading = () => setDeskScreenState((ps) => ({ ...ps, dialogMode: 'loading' }))
  const showPrintPreview = (images: string[]) => {
    console.log(images)
    setDeskScreenState((ps) => ({
      ...ps,
      dialogMode: 'printPreview',
      dialogChildren: <Stack spacing={2}>
        {images.map((base64Image, i) => <PrintPreviewImage key={i} base64Image={PNG_BASE64_HEADER + base64Image} />)}
      </Stack>,
    }))
  }

  const [, setState] = React.useState({})
  const rerender = () => setState({})

  const modifyOrderProductMutation = useModifyOrderMutation()
  const setOrderProductStatus = (status: 'paid' | 'used') => {
    showLoading()
    modifyOrderProductMutation.mutate({ products: [{ id: orderProductRel.id, status }] }, { onSuccess: closeDialog, onError })
  }
  const modifyOrderProductOptionCustomResponse = () => {
    if (!formRef.current || !formRef.current.checkValidity()) return
    setDeskScreenState((prevState) => ({ ...prevState, dialogMode: 'loading' }))

    const data = Object.entries(getFormValue<{ [key: string]: string }>({ form: formRef.current })).map(([id, custom_response]) => ({ id, custom_response }))
    modifyOrderProductMutation.mutate({ products: [{ id: orderProductRel.id, options: data }] }, { onSuccess: closeDialog, onError })
  }

  const retrievePrintPreviewMutation = usePreviewLabelMutation()
  const retrievePrintPreview = () => {
    showLoading()
    retrievePrintPreviewMutation.mutate(undefined, { onSuccess: showPrintPreview, onError })
  }

  const resetForm = () => {
    showLoading()
    formRef.current?.reset()
    closeDialog()
  }

  if (!order) return <></>

  const checkCustomResponseModified = () => {
    if (!formRef.current) return false
    if (!formRef.current.checkValidity()) return true

    const data = getFormValue<{ [key: string]: string }>({ form: formRef.current })
    if (Object.keys(data).length === 0) return false

    for (const [key, value] of Object.entries(data)) {
      if (value !== orderProductRel.options.find((op) => op.id === key)?.custom_response) return true
    }
    return false
  }

  const isOrderRefunded = order.current_status === 'refunded'
  const isRefunded = isOrderRefunded || orderProductRel.status === 'refunded'
  const isUsed = orderProductRel.status === 'used'
  const isModified = checkCustomResponseModified()
  const isFormValid = formRef.current ? formRef.current.checkValidity() : false

  return (
    <List>
      <SpaceBetweenHeaderAndButton sx={{ marginBottom: 0 }}>
        <Typography variant="h6">
          {orderProductRel.product.name} <Chip
            color={isUsed ? 'success' : isRefunded ? 'error' : 'primary'}
            label={orderProductRel.status}
          />
        </Typography>

        <Box>
          <Button
            color="error"
            disabled={isRefunded || isUsed}
            onClick={() => setDeskScreenState((ps) => ({ ...ps, dialogMode: 'refund' }))}
            size="small"
            startIcon={<MoneyOffIcon />}
            variant="outlined"
          >환불</Button>
          &nbsp;
          <Button
            color="success"
            disabled={isRefunded || isUsed || !isModified || !isFormValid}
            onClick={modifyOrderProductOptionCustomResponse}
            size="small"
            startIcon={<EditIcon />}
            variant="outlined"
          >수정
          </Button>
          {isModified ? <Button
            color="error"
            onClick={resetForm}
            size="small"
            startIcon={<RestartAltIcon />}
            variant="outlined"
          >수정 취소</Button> : null}
          &nbsp;
          <Button
            color={isUsed ? 'primary' : 'success'}
            disabled={isRefunded || isModified}
            onClick={() => setOrderProductStatus(isUsed ? 'paid' : 'used')}
            size="small"
            startIcon={<ConfirmationNumberIcon />}
            variant="outlined"
          >{isUsed ? '사용 안한 상태로 변경' : '사용 처리'}</Button>
          &nbsp;
          <Button
            color="primary"
            disabled={isRefunded || !isUsed || isModified}
            onClick={retrievePrintPreview}
            size="small"
            startIcon={<PrintIcon />}
            variant="outlined"
          >출력</Button>
        </Box>
      </SpaceBetweenHeaderAndButton>

      <Typography variant="subtitle1">
        결제 금액 : <Won price={orderProductRel.price} />&nbsp;
        {orderProductRel.donation_price > 0 && <> (+기부금 <Won price={orderProductRel.donation_price} />)</>}
      </Typography>

      <form ref={formRef}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <StyledTableRow>
                <TableCell>옵션명</TableCell>
                <TableCell>선택한 옵션</TableCell>
              </StyledTableRow>
            </TableHead>

            <TableBody>
              {orderProductRel.options
                .sort(compareOrderOptionGroupsByName)
                .sort(compareOrderProductOptionsReverse)
                .map((orderProductOptionRel) => (
                  <ProductOptionDetailListItem
                    inputDisabled={isRefunded || isUsed}
                    key={orderProductOptionRel.id}
                    onChange={rerender}
                    orderProductOptionRel={orderProductOptionRel}
                  />
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </form>
    </List>
  )
}

const PaymentHistoryTable: React.FC<{ order: Order }> = ({ order }) => {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <StyledTableRow>
            <TableCell>결제 상태</TableCell>
            <TableCell>남은 금액</TableCell>
            <TableCell>적용 일시</TableCell>
          </StyledTableRow>
        </TableHead>
        <TableBody>
          {order.payment_histories.map((history) => (
            <StyledTableRow key={history.created_at}>
              <TableCell>{history.status}</TableCell>
              <TableCell><Won price={history.price} /></TableCell>
              <TableCell>{new Date(history.created_at).toLocaleString()}</TableCell>
            </StyledTableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export const OrderDetailPage: React.FC<{ closeOrder: () => void }> = ({ closeOrder }) => {
  const { state } = React.useContext(GlobalContext)

  if (!state.order) {
    return <Page>
      <Typography sx={{ fontWeight: 'bold' }} variant="h4">주문 상세</Typography>
      <Typography variant="caption">주문 정보를 불러오는 중입니다...</Typography>
    </Page>
  }

  return (
    <Page>
      <SpaceBetweenHeaderAndButton>
        <Box>
          <Typography sx={{ fontWeight: 'bold' }} variant="h4">주문 상세</Typography>
          <Typography variant="caption"> 주문 ID : {state.order.id}</Typography>
        </Box>
        <Box><Button color="success" onClick={closeOrder} startIcon={<Close />} variant="contained">닫기</Button></Box>
      </SpaceBetweenHeaderAndButton>

      <ProductPropertyCard>
        <CardContent>
          <Typography color="text.primary" sx={{ fontWeight: 'bold' }} variant="h5">주문 정보</Typography>
          {state.order.products.map((proRel) => <ProductDetailListItem key={proRel.id} order={state.order} orderProductRel={proRel} />)}
        </CardContent>
      </ProductPropertyCard>

      <ProductPropertyCard>
        <CardContent>
          <Typography color="text.primary" sx={{ fontWeight: 'bold' }} variant="h5">결제 정보</Typography>
          <Typography color="text.secondary" variant="body1">
            주문 결제 일시 : {new Date(state.order.first_paid_at).toLocaleString()}<br />
            최초 결제 금액 : <Won price={state.order.first_paid_price} /><br />
            현재 주문 상태 : {state.order?.current_status}<br />
            {state.order.current_status !== 'completed' && <>현재 남은 잔액 : <Won price={state.order.current_paid_price} /><br /></>}
          </Typography>
          <br />
          <Typography color="text.primary" sx={{ fontWeight: 'bold' }} variant="h6">거래 정보</Typography>
          <PaymentHistoryTable order={state.order} />
        </CardContent>
      </ProductPropertyCard>
    </Page>
  )
}
