import AutoDeleteIcon from '@mui/icons-material/AutoDelete'
import CloseIcon from '@mui/icons-material/Close'
import LeakAddIcon from '@mui/icons-material/LeakAdd'
import LoopIcon from '@mui/icons-material/Loop'
import SaveIcon from '@mui/icons-material/Save'
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  MenuItem,
  Select,
  Slide,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Typography,
  styled,
  tableCellClasses,
} from '@mui/material'
import { TransitionProps } from '@mui/material/transitions'
import { wrap } from '@suspensive/react'
import { MutateOptions } from '@tanstack/react-query'
import { VariantType, useSnackbar } from 'notistack'
import React from 'react'
import * as R from 'remeda'

import { DeskScreenContext } from '.'
import {
  useCheckShopAPIConnectionMutation,
  useClearSessionMutation,
  useListPossibleDevicesQuery,
  useSetShopDomainConfigMutation,
} from '../../hooks/useAPIs'
import { GlobalContext } from '../../main'
import { AppState } from '../../models'
import { getFormValue, isFormValid } from '../../utils/form'

type ConfigTransitionProps = TransitionProps & { children: React.ReactElement }
const ConfigTransition = React.forwardRef((p: ConfigTransitionProps, r: React.Ref<unknown>) => <Slide direction="up" ref={r} {...p}>{p.children}</Slide>)
ConfigTransition.displayName = 'ConfigTransition'

const TabPanel: React.FC<React.PropsWithChildren<{ value: number; index: number }>> = ({ children, value, index }) => (
  <div hidden={value !== index}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>
)

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  [`& > .${tableCellClasses.root}`]: {
    textAlign: 'center',
    whiteSpace: 'nowrap',
    [`&.${tableCellClasses.head}`]: {
      fontWeight: 'bold',
      backgroundColor: theme.palette.grey[300],
    },
    '&:first-of-type': {
      fontWeight: 'bold',
      width: '20%',
    },
  },
}))

const StyledTableRowWithButton = styled(TableRow)(({ theme }) => ({
  [`& > .${tableCellClasses.root}`]: {
    textAlign: 'center',
    whiteSpace: 'nowrap',
    // border: `1px solid ${theme.palette.divider}`,
    [`&.${tableCellClasses.head}`]: {
      fontWeight: 'bold',
      backgroundColor: theme.palette.grey[300],
    },
    '&:first-of-type': {
      fontWeight: 'bold',
      width: '20%',
    },
    '&:last-of-type': {
      fontWeight: 'bold',
      width: '20%',
    },
  },
}))

type ConfigTabProps = {
  index: number
  currentTab: number
  formRef: React.RefObject<HTMLFormElement>
  saveFunc: (option: MutateOptions<AppState, Error, AppState['shop_api'], unknown>) => void
}

const DefaultConfigTab: React.FC<ConfigTabProps> = ({ index, currentTab, formRef, saveFunc }) => {
  const { state } = React.useContext(GlobalContext)
  const checkConnectionMutation = useCheckShopAPIConnectionMutation()
  const clearSessionMutation = useClearSessionMutation()
  const { enqueueSnackbar } = useSnackbar()

  const addSnackbar = (children: string | React.ReactNode, variant: VariantType) => enqueueSnackbar(
    children,
    { variant, anchorOrigin: { vertical: 'bottom', horizontal: 'center' } }
  )

  const testConnection = () => {
    saveFunc({
      onSuccess: () => {
        checkConnectionMutation.mutate(undefined, {
          onSuccess: ({ status }) => (status ? addSnackbar('연결 성공', 'success') : addSnackbar('연결 실패', 'error')),
          onError: () => addSnackbar('연결 실패', 'error'),
        })
      },
    })
  }

  const clearSession = () => {
    saveFunc({
      onSuccess: () =>
        clearSessionMutation.mutate(undefined, {
          onSuccess: () => addSnackbar('세션 초기화 성공', 'success'),
          onError: () => addSnackbar('세션 초기화 실패', 'error'),
        }),
    })
  }

  return (
    <TabPanel
      index={index}
      value={currentTab}
    >
      <form ref={formRef}>
        <Stack spacing={2}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell colSpan={2}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="h5" sx={{ fontWeight: 'bold' }}>결제 서버 설정</Typography>
                      <Button
                        disabled={checkConnectionMutation.isPending}
                        onClick={testConnection}
                        startIcon={checkConnectionMutation.isPending ? <LoopIcon /> : <LeakAddIcon />}
                        variant="contained"
                      >
                        연결 테스트
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                <StyledTableRow>
                  <TableCell>결제 서버 주소</TableCell>
                  <TableCell>
                    <TextField
                      defaultValue={state.shop_api.domain}
                      fullWidth
                      label="결제 서버 주소"
                      name="domain"
                      placeholder="https://api.example.com/"
                    />
                  </TableCell>
                </StyledTableRow>

                <StyledTableRow>
                  <TableCell>결제 서버 API Key</TableCell>
                  <TableCell>
                    <TextField
                      defaultValue={state.shop_api.api_key}
                      fullWidth
                      label="결제 서버 API Key"
                      name="api_key"
                      placeholder="registration_desk"
                    />
                  </TableCell>
                </StyledTableRow>

                <StyledTableRow>
                  <TableCell>결제 서버 API Secret</TableCell>
                  <TableCell>
                    <TextField
                      label="결제 서버 API Secret"
                      defaultValue={state.shop_api.api_secret}
                      name="api_secret"
                      fullWidth
                    />
                  </TableCell>
                </StyledTableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell colSpan={2}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="h5" sx={{ fontWeight: 'bold' }}>주문 내역 이력 초기화</Typography>
                      <Button
                        disabled={clearSessionMutation.isPending}
                        onClick={clearSession}
                        startIcon={clearSessionMutation.isPending ? <LoopIcon /> : <AutoDeleteIcon />}
                        variant="contained"
                      >초기화</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              </TableHead>
            </Table>
          </TableContainer>
        </Stack>
      </form>
    </TabPanel>
  )
}

const CurrentDevices: React.FC<{ devices: AppState['printers'] | AppState['readers'] }> = ({ devices }) => {
  return R.isArray(devices) && !R.isEmpty(devices) ? (
    devices.map((d, i) => (
      <StyledTableRowWithButton key={i}>
        <TableCell>{d.name}</TableCell>
        <TableCell><TextField defaultValue={d.name} disabled label="장치 이름" /></TableCell>
        <TableCell><TextField defaultValue={d.block_path} disabled label="장치 경로" /></TableCell>
        <TableCell><Button startIcon={<CloseIcon />} variant="contained">삭제</Button></TableCell>
      </StyledTableRowWithButton>
    ))
  ) : <StyledTableRow><TableCell colSpan={4}>등록된 장치가 없습니다.</TableCell></StyledTableRow>
}

const DeviceConfigTabTitleRow: React.FC<{
  title: string
  colSpan?: number
  variant?: 'h4' | 'h5' | 'h6'
}> = ({ title, colSpan, variant }) => <TableRow>
  <TableCell colSpan={colSpan}>
    <Typography variant={variant} sx={{ fontWeight: 'bold' }}>{title}</Typography>
  </TableCell>
</TableRow>

const DeviceConfigTab: React.FC<ConfigTabProps> = ({ index, currentTab, formRef }) => {
  const { state } = React.useContext(GlobalContext)
  const PossibleDevices = wrap
    .ErrorBoundary({ fallback: <TableCell colSpan={2} sx={{ color: 'red' }}>추가 가능한 장치 목록을 불러오는 중 오류가 발생했습니다.</TableCell> })
    .Suspense({ fallback: <TableCell colSpan={2}><CircularProgress size="0.875rem" /></TableCell> })
    .on(() => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { data } = useListPossibleDevicesQuery()

      return R.isArray(data) && !R.isEmpty(data) ? (
        <>
          <TableCell>추가 가능한 장치</TableCell>
          <TableCell><Select>{data.map((r, i) => <MenuItem key={i} value={r.name}>{r.name}</MenuItem>)}</Select></TableCell>
        </>
      ) : <TableCell colSpan={2}>추가 가능한 장치가 없습니다.</TableCell>
    })

  return (
    <TabPanel index={index} value={currentTab}>
      <form ref={formRef}>
        <Stack spacing={2}>
          <TableContainer>
            <Table>
              <TableHead><DeviceConfigTabTitleRow colSpan={2} variant="h5" title="바코드 리더 설정" /></TableHead>
              <TableBody><StyledTableRow><PossibleDevices /></StyledTableRow></TableBody>
            </Table>
          </TableContainer>

          <TableContainer>
            <Table>
              <TableHead><DeviceConfigTabTitleRow title="현재 등록된 장치 목록" /></TableHead>
              <TableBody>
                <DeviceConfigTabTitleRow title="프린터" colSpan={4} variant="h6" />
                <CurrentDevices devices={state.printers} />
                <DeviceConfigTabTitleRow title="바코드 리더기" colSpan={4} variant="h6" />
                <CurrentDevices devices={state.readers} />
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </form>
    </TabPanel>
  )
}

export const ConfigDialog: React.FC = () => {
  const defaultConfigFormRef = React.useRef<HTMLFormElement>(null)
  const deviceConfigFormRef = React.useRef<HTMLFormElement>(null)
  const { dialogMode, closeDialog } = React.useContext(DeskScreenContext)
  const [tabIndex, setTabIndex] = React.useState(0)
  const setSessionConfigMutation = useSetShopDomainConfigMutation()
  const { enqueueSnackbar } = useSnackbar()

  const addSnackbar = (children: string | React.ReactNode, variant: VariantType) => enqueueSnackbar(
    children,
    { variant, anchorOrigin: { vertical: 'bottom', horizontal: 'center' } }
  )

  const saveFunc = (option: MutateOptions<AppState, Error, AppState['shop_api'], unknown>) => {
    if (!isFormValid(defaultConfigFormRef.current)) return

    const formData = getFormValue<AppState['shop_api']>({ form: defaultConfigFormRef.current })
    addSnackbar('설정 저장 중...', 'info')
    // TODO: FIXME: 저장 후 defaultValue 값을 서버의 값으로 초기화해야 함.
    setSessionConfigMutation.mutate(formData, {
      ...option,
      onSuccess: (d, v, c) => {
        addSnackbar('설정 저장 성공', 'success')
        option.onSuccess?.(d, v, c)
      },
      onError: (e, v, c) => {
        addSnackbar('설정 저장 실패', 'error')
        option.onError?.(e, v, c)
      },
    })
  }
  const saveAndClose = () => saveFunc({ onSuccess: closeDialog })

  return (
    <Dialog TransitionComponent={ConfigTransition} disableEscapeKeyDown fullScreen open={dialogMode === 'config'}>
      <AppBar>
        <Toolbar>
          {/* X 버튼을 누를 시, 내용이 수정된 경우 저장하겠냐는 팝업을 띄워야 함 */}
          <IconButton color="inherit" edge="start" onClick={saveAndClose}><CloseIcon /></IconButton>
          <Typography component="div" sx={{ ml: 2, flex: 1 }} variant="h6">설정</Typography>
          <Button autoFocus color="inherit" onClick={saveAndClose} startIcon={<SaveIcon />}>저장</Button>
        </Toolbar>
      </AppBar>
      <Toolbar />
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs centered onChange={(_, v) => setTabIndex(v)} value={tabIndex}>
          <Tab label="기본" />
          <Tab label="장치" />
        </Tabs>
      </Box>
      <DefaultConfigTab currentTab={tabIndex} formRef={defaultConfigFormRef} index={0} saveFunc={saveFunc} />
      <DeviceConfigTab currentTab={tabIndex} formRef={deviceConfigFormRef} index={1} saveFunc={saveFunc} />
    </Dialog>
  )
}
