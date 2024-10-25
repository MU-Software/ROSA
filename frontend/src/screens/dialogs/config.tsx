import AppRegistrationIcon from '@mui/icons-material/AppRegistration'
import CloseIcon from '@mui/icons-material/Close'
import PrintIcon from '@mui/icons-material/Print'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import SaveIcon from '@mui/icons-material/Save'
import SettingsIcon from '@mui/icons-material/Settings'
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  MenuItem,
  Select,
  Slide,
  Stack,
  Switch,
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
  tableCellClasses
} from '@mui/material'
import { TransitionProps } from '@mui/material/transitions'
import { wrap } from '@suspensive/react'
import { OptionsObject, VariantType, useSnackbar } from 'notistack'
import React from 'react'
import * as R from 'remeda'

import { DeskScreenContext } from '.'
import {
  useCheckShopAPIConnectionMutation,
  useDeleteDeviceConfigMutation,
  useListPossibleDevicesQuery,
  useSetDeviceConfigMutation,
  useSetSessionStateConfigMutation,
  useSetShopDomainConfigMutation,
} from '../../hooks/useAPIs'
import { GlobalContext } from '../../main'
import { SessionState, SessionStateConfig } from '../../models'
import { getFormValue, isFormValid } from '../../utils/form'

type ConfigTransitionProps = TransitionProps & { children: React.ReactElement }
const ConfigTransition = React.forwardRef((p: ConfigTransitionProps, r: React.Ref<unknown>) => <Slide direction="up" ref={r} {...p}>{p.children}</Slide>)
ConfigTransition.displayName = 'ConfigTransition'

const TabPanel: React.FC<React.PropsWithChildren<{ value: number; index: number }>> = ({ children, value, index }) => (
  <div hidden={value !== index}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>
)

const SnackBarOptionGen: (v: VariantType) => OptionsObject = (v) => ({ variant: v, anchorOrigin: { vertical: 'bottom', horizontal: 'center' } })

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

export const ConfigDialog: React.FC = () => {
  const shopDomainConfigFormRef = React.useRef<HTMLFormElement>(null)
  const sessionStateConfigFormRef = React.useRef<HTMLFormElement>(null)
  const { state } = React.useContext(GlobalContext)
  const { dialogMode, closeDialog } = React.useContext(DeskScreenContext)
  const [tabIndex, setTabIndex] = React.useState(0)

  const checkConnectionMutation = useCheckShopAPIConnectionMutation()
  const setShopDomainConfigMutation = useSetShopDomainConfigMutation()
  const setSessionStateConfigMutation = useSetSessionStateConfigMutation()
  const deleteDeviceConfigMutation = useDeleteDeviceConfigMutation()

  const { enqueueSnackbar } = useSnackbar()
  const addSnackbar = (c: string | React.ReactNode, v: VariantType) => enqueueSnackbar(c, SnackBarOptionGen(v))

  const saveShopDomainConfigAndTestConnection = () => {
    const form = shopDomainConfigFormRef.current
    if (!isFormValid(form)) return

    addSnackbar('설정 저장 중...', 'info')
    setShopDomainConfigMutation.mutate(getFormValue<SessionState['app_state']['shop_api']>({ form }), {
      onSuccess: () => {
        addSnackbar('설정 저장 성공', 'success')
        checkConnectionMutation.mutate(undefined, {
          onSuccess: ({ status }) => (status ? addSnackbar('연결 성공', 'success') : addSnackbar('연결 실패', 'error')),
          onError: () => addSnackbar('연결 실패', 'error'),
        })
      },
      onError: () => addSnackbar('설정 저장 실패', 'error'),
    })
  }

  const saveSessionStateConfig = () => {
    const form = sessionStateConfigFormRef.current
    if (!isFormValid(form)) return

    addSnackbar('설정 저장 중...', 'info')
    setSessionStateConfigMutation.mutate(getFormValue<SessionStateConfig>({ form }), {
      onSuccess: () => addSnackbar('설정 저장 성공', 'success'),
      onError: () => addSnackbar('설정 저장 실패', 'error'),
    })
  }

  const deleteDevice = (deviceType: 'printer' | 'reader') => {
    deleteDeviceConfigMutation.mutate(deviceType, {
      onSuccess: () => addSnackbar('장치 삭제 성공', 'success'),
      onError: () => addSnackbar('장치 삭제 실패', 'error'),
    })
  }

  const PossibleDevices = wrap
    .ErrorBoundary({ fallback: <Box sx={{ color: 'red' }}>장치 목록을 불러오는 중 오류가 발생했습니다.</Box> })
    .Suspense({ fallback: <CircularProgress size="0.875rem" /> })
    .on(() => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const selectRef = React.useRef<HTMLSelectElement>(null)
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { data } = useListPossibleDevicesQuery()
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const setDeviceConfigMutation = useSetDeviceConfigMutation()

      const addDevice = (deviceType: 'printer' | 'reader') => {
        if (!selectRef.current || selectRef.current.value === '') return

        setDeviceConfigMutation.mutate({
          deviceType,
          cdc_path: selectRef.current.value,
          cmd_type: 'ESCP',
          label: { width: 960, height: 410 },
        }, {
          onSuccess: () => addSnackbar('장치 추가 성공', 'success'),
          onError: () => addSnackbar('장치 추가 실패', 'error'),
        })
      }

      const isPending = setDeviceConfigMutation.isPending || deleteDeviceConfigMutation.isPending

      return R.isArray(data) && !R.isEmpty(data) ? <Box sx={{ width: '100%', display: 'flex', gap: '1rem' }}>
        <Select sx={{ flexGrow: '1' }} inputRef={selectRef}>
          {data.map((r, i) => <MenuItem key={i} value={r.cdc_path}>{r.name}</MenuItem>)}
        </Select>
        <Button startIcon={<QrCodeScannerIcon />} onClick={() => addDevice('reader')} disabled={isPending}>리더기 추가</Button>
        <Button startIcon={<PrintIcon />} onClick={() => addDevice('printer')} disabled={isPending}>프린터 추가</Button>
      </Box>
        : <>추가 가능한 장치가 없습니다.</>
    })

  return <Dialog TransitionComponent={ConfigTransition} disableEscapeKeyDown fullScreen open={dialogMode === 'config'}>
    <AppBar>
      <Toolbar>
        <SettingsIcon />
        <Typography component="div" sx={{ ml: 2, flex: 1 }} variant="h6">설정 [세션 ID: {state.id}]</Typography>
        <Button autoFocus color="inherit" onClick={closeDialog} startIcon={<CloseIcon />}>닫기</Button>
      </Toolbar>
    </AppBar>
    <Toolbar />
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs centered onChange={(_, v) => setTabIndex(v)} value={tabIndex}>
        <Tab label="기본" />
        <Tab label="장치" />
      </Tabs>
    </Box>

    <TabPanel index={0} value={tabIndex}>
      <form ref={shopDomainConfigFormRef}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold' }}>결제 서버 설정</Typography>
                    <Stack direction="row" sx={{ gap: '0.5rem' }}>
                      <Button
                        disabled={checkConnectionMutation.isPending}
                        onClick={saveShopDomainConfigAndTestConnection}
                        startIcon={<SaveIcon />}
                        variant="contained"
                      >
                        저장 후 연결 테스트
                      </Button>
                    </Stack>
                  </Stack>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              <StyledTableRow>
                <TableCell>결제 서버 주소</TableCell>
                <TableCell>
                  <TextField
                    defaultValue={state.app_state.shop_api.domain}
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
                    defaultValue={state.app_state.shop_api.api_key}
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
                    defaultValue={state.app_state.shop_api.api_secret}
                    name="api_secret"
                    fullWidth
                  />
                </TableCell>
              </StyledTableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </form>

      <form ref={sessionStateConfigFormRef}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={2}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold' }}>기타 설정</Typography>
                    <Stack direction="row" sx={{ gap: '0.5rem' }}>
                      <Button
                        disabled={checkConnectionMutation.isPending}
                        onClick={saveSessionStateConfig}
                        startIcon={<SaveIcon />}
                        variant="contained"
                      >
                        저장
                      </Button>
                    </Stack>
                  </Stack>
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              <StyledTableRow>
                <TableCell>자동 모드</TableCell>
                <TableCell>
                  <Stack sx={{ flexGrow: '1', alignItems: 'flex-end' }}>
                    <Switch name="automated" defaultChecked={state.automated} />
                  </Stack>
                </TableCell>
              </StyledTableRow>

              <StyledTableRow>
                <TableCell>가격이 있는 옵션의 라벨 인쇄</TableCell>
                <TableCell>
                  <Stack sx={{ flexGrow: '1', alignItems: 'flex-end' }}>
                    <Switch name="print_priced_option_label" defaultChecked={state.print_priced_option_label} />
                  </Stack>
                </TableCell>
              </StyledTableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </form>
    </TabPanel>

    <TabPanel index={1} value={tabIndex}>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell colSpan={2}>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>장치 설정</Typography>
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            <TableRow>
              <TableCell colSpan={2}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>장치 추가</Typography>
              </TableCell>
            </TableRow>
            <StyledTableRow>
              <TableCell>추가 가능한 장치</TableCell>
              <TableCell>
                <PossibleDevices />
              </TableCell>
            </StyledTableRow>

            <TableRow>
              <TableCell colSpan={2}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>프린터</Typography>
              </TableCell>
            </TableRow>
            <StyledTableRow>
              <TableCell>{state.printer?.name ?? "등록된 장치 없음"}</TableCell>
              <TableCell>
                <Stack direction="column" sx={{ gap: '0.5rem' }}>
                  <TextField defaultValue={state.printer?.block_path ?? ""} label="장치 경로 (USB)" />
                  <TextField defaultValue={state.printer?.cdc_path ?? ""} label="장치 경로 (CDC)" />
                  <Stack direction="row" sx={{ flexGrow: '1', gap: '0.5rem' }}>
                    <TextField sx={{ flexGrow: '1' }} defaultValue={state.printer?.label.width ?? ""} label="라벨 Width" />
                    <TextField sx={{ flexGrow: '1' }} defaultValue={state.printer?.label.height ?? ""} label="라벨 Height" />
                    <Select defaultValue={state.printer?.cmd_type ?? "ESCP"} label="장치 타입">
                      <option value="ESCP">ESC/P</option>
                      <option value="TSPL">TSPL</option>
                    </Select>
                    <TextField defaultValue={state.printer?.serial_number || ""} label="기기 일련번호" />
                  </Stack>
                  <Stack direction="row" sx={{ flexGrow: '1', gap: '0.5rem' }}>
                    <Button variant="contained" sx={{ flexGrow: '1' }} disabled={!state.printer} startIcon={<AppRegistrationIcon />} onClick={() => { }}>수정</Button>
                    <Button variant="contained" sx={{ flexGrow: '1' }} disabled={!state.printer} startIcon={<CloseIcon />} onClick={()  => deleteDevice('printer')}>삭제</Button>
                  </Stack>
                </Stack>
              </TableCell>
            </StyledTableRow>

            <TableRow>
              <TableCell colSpan={2}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>바코드 리더기</Typography>
              </TableCell>
            </TableRow>
            <StyledTableRow>
              <TableCell>{state.reader?.name ?? "등록된 장치 없음"}</TableCell>
              <TableCell>
                <Stack direction="column" sx={{ gap: '0.5rem' }}>
                  <TextField defaultValue={state.reader?.block_path ?? ""} label="장치 경로 (USB)" />
                  <TextField defaultValue={state.reader?.cdc_path ?? ""} label="장치 경로 (CDC)" />
                  <TextField defaultValue={state.reader?.serial_number || ""} label="기기 일련번호" />
                  <Stack direction="row" sx={{ flexGrow: '1', gap: '0.5rem' }}>
                    <Button variant="contained" sx={{ flexGrow: '1' }} disabled={!state.reader} startIcon={<AppRegistrationIcon />} onClick={() => { }}>수정</Button>
                    <Button variant="contained" sx={{ flexGrow: '1' }} disabled={!state.reader} startIcon={<CloseIcon />} onClick={() => deleteDevice('reader')}>삭제</Button>
                  </Stack>
                </Stack>
              </TableCell>
            </StyledTableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </TabPanel>
  </Dialog>
}
