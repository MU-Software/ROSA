import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import HistoryIcon from '@mui/icons-material/History'
import MenuIcon from '@mui/icons-material/Menu'
import SearchIcon from '@mui/icons-material/Search'
import SettingsIcon from '@mui/icons-material/Settings'
import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputBase,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  MenuItem,
  Select,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
  styled,
} from '@mui/material'
import { blue } from '@mui/material/colors'
import { SnackbarProvider } from 'notistack'
import React from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import * as R from 'remeda'

import { useSearchOrderMutation, useSetSessionDeskStatusMutation, useSetSessionOrderMutation } from '../hooks/useAPIs'
import { GlobalContext } from '../main'
import { DeskStatus, Order } from '../models'
import { getTicketInfoFromOrder } from '../utils/order'
import { DeskScreenContext, DeskScreenProvider } from './dialogs'
import { DeskClosedPage } from './pages/deskClosedPage'
import { OrderDetailPage } from './pages/orderDetailPage'
import { OrderIdlePage } from './pages/orderIdlePage'

const UUID_REGEX = /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i

const PageOuterContainer = styled(Box)(() => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}))

const PageMidContainer = styled(Box)(() => ({
  width: '100%',
  height: '100%',
  overflowY: 'scroll',
}))

const PageInnerContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  height: 'fit-content',
  minHeight: '100%',
  backgroundColor: theme.palette.grey[200],
}))

const GradientAppBar = styled(AppBar)(() => ({
  // background: 'linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)',
  background: `linear-gradient(15deg, ${blue[600]} 10%, ${blue[900]} 90%)`,
}))

const Search = styled('div')(({ theme }) => ({
  position: 'relative',
  margin: theme.spacing(1),
  flexGrow: '1',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.25) },
}))

const SearchIconWrapper = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: '100%',
  position: 'absolute',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}))

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  width: '100%',
  color: 'inherit',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '100%',
  },
}))

type WrappedDeskScreenStateType = {
  initialWSConnected: boolean
  showHistoryDrawer: boolean
  searchResult: Order[] | undefined
}

const WrappedDeskScreen: React.FC = () => {
  const navigate = useNavigate()

  const [screenState, setScreenState] = React.useState<WrappedDeskScreenStateType>({
    initialWSConnected: false,
    showHistoryDrawer: false,
    searchResult: undefined,
  })
  const setInitialWSConnected = (value: boolean) => setScreenState((ps) => ({ ...ps, initialWSConnected: value }))
  const toggleHistoryDrawer = () => setScreenState((ps) => ({ ...ps, showHistoryDrawer: !ps.showHistoryDrawer }))
  const setSearchResult = (orders?: Order[]) => setScreenState((ps) => ({ ...ps, searchResult: orders }))
  const { state, isWSConnected } = React.useContext(GlobalContext)

  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const setSessionOrderMutation = useSetSessionOrderMutation()
  const setSessionDeskStatusMutation = useSetSessionDeskStatusMutation()
  const searchOrderMutation = useSearchOrderMutation()

  const { setDeskScreenState, closeDialog } = React.useContext(DeskScreenContext)
  const onError = closeDialog
  const showLoading = () => setDeskScreenState((ps) => ({ ...ps, dialogMode: 'loading' }))
  const showClosingOrder = (title: string, onConfirm: () => void) =>
    setDeskScreenState((ps) => ({
      ...ps,
      dialogMode: 'closingOrder',
      dialogTitle: title,
      dialogOnConfirm: onConfirm,
    }))
  const setSearchResultAndClose = (orders?: Order[]) => {
    setSearchResult(orders)
    closeDialog()
  }
  const preventEventDefault = (evt: { preventDefault: () => void; stopPropagation: () => void }) => {
    evt.preventDefault()
    evt.stopPropagation()
  }

  const handleDeskStatusChange = (status: DeskStatus, skipConfirm?: boolean) => {
    const changeDeskStatus = () => {
      showLoading()
      if (state.desk_status === status) return closeDialog()
      else setSessionDeskStatusMutation.mutate(status, { onSuccess: closeDialog, onError })
    }

    if (state.order && !skipConfirm) showClosingOrder('데스크 접수 상태 변경', changeDeskStatus)
    else changeDeskStatus()
  }

  const setOrder = (orderId: string) => {
    showLoading()
    setSessionOrderMutation.mutate(orderId, { onSuccess: closeDialog, onError })
  }

  const onSearch = () => {
    handleDeskStatusChange('idle', true)

    if (!searchInputRef.current) return
    const searchKeyword = searchInputRef.current.value?.trim()
    if (!searchKeyword) {
      setSearchResultAndClose()
      return
    }

    searchOrderMutation.mutate(searchKeyword, { onSuccess: setSearchResultAndClose, onError })
  }

  const onSearchBtnClick: React.MouseEventHandler<HTMLButtonElement> = (evt) => {
    preventEventDefault(evt)
    if (state.order) showClosingOrder('검색으로 이동', onSearch)
    else onSearch()
  }

  const onEnterPress: React.KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (evt.key !== 'Enter' || evt.nativeEvent.isComposing) return
    preventEventDefault(evt)
    if (state.order) showClosingOrder('검색으로 이동', onSearch)
    else onSearch()
  }

  React.useEffect(() => {
    if (state.order && R.isString(state.order.id) && UUID_REGEX.test(state.order.id)) {
      navigate(`/order/${state.order.id}`)
    } else if (state.desk_status === 'closed') {
      navigate('/closed')
    } else {
      navigate('/')
    }
  }, [state.order, state.desk_status, navigate])

  React.useEffect(() => {
    if (!screenState.initialWSConnected && !isWSConnected) {
      setDeskScreenState((ps) => ({ ...ps, dialogMode: 'loading' }))
    } else if (!screenState.initialWSConnected && isWSConnected) {
      setInitialWSConnected(true)
      closeDialog()
    } else if (screenState.initialWSConnected && !isWSConnected) {
      setDeskScreenState((ps) => ({ ...ps, dialogMode: 'pocaConnectionLost' }))
    }
  }, [screenState.initialWSConnected, isWSConnected, closeDialog, setDeskScreenState])

  return (
    <Box sx={{ height: '100%' }}>
      <CssBaseline />

      <GradientAppBar>
        <Toolbar sx={{ justifyContent: 'space-between', gap: '1rem' }}>
          <Tooltip title="처리한 주문 내역">
            <Button onClick={toggleHistoryDrawer} sx={{ color: '#fff', minWidth: 'initial' }}>
              <MenuIcon />
            </Button>
          </Tooltip>

          <Typography component="div" variant="h6">
            <a href="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bolder' }}>ROSA</a>
          </Typography>

          <Search>
            <SearchIconWrapper><SearchIcon /></SearchIconWrapper>
            <StyledInputBase
              inputRef={searchInputRef}
              onKeyDown={onEnterPress}
              placeholder="주문 검색 (콤마로 여러 키워드를 같이 검색하실 수 있어요!)"
            />
            <Button onClick={onSearchBtnClick} sx={{ color: '#fff' }}>검색</Button>
          </Search>

          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <FormControl size="small" sx={{ m: 0, minWidth: 125 }}>
              <InputLabel sx={{ color: '#fff' }}>데스크 접수 상태</InputLabel>
              <Select
                label="데스크 접수 상태"
                onChange={(e) => handleDeskStatusChange(e.target.value as DeskStatus)}
                sx={{ color: '#fff' }}
                value={state.desk_status}
              >
                <MenuItem value="idle">접수 가능</MenuItem>
                {state.order && <MenuItem value="registering">접수 진행 중</MenuItem>}
                <MenuItem value="closed">접수 마감</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Tooltip title="설정">
            <Button onClick={() => setDeskScreenState((ps) => ({ ...ps, dialogMode: 'config' }))} sx={{ color: '#fff' }}>
              <SettingsIcon />
            </Button>
          </Tooltip>
        </Toolbar>
      </GradientAppBar>

      <Box component="main" sx={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}>
        <Drawer sx={{ flexShrink: 0, '& .MuiDrawer-paper': { boxSizing: 'border-box' } }} open={screenState.showHistoryDrawer}>
          <List sx={{ padding: 0 }}>
            <ListSubheader sx={{ height: '64px' }}>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>처리 이력</div>
                <IconButton onClick={toggleHistoryDrawer}><ChevronLeftIcon /></IconButton>
              </Box>
            </ListSubheader>
            <Divider />
            {[...state.handled_order].reverse().map((order) => {
              const ticketInfo = getTicketInfoFromOrder(order)
              return <ListItem disablePadding key={order.id}>
                <ListItemButton onClick={() => setOrder(order.id)}>
                  <ListItemIcon sx={{ minWidth: '32px' }}><HistoryIcon /></ListItemIcon>
                  <ListItemText
                    primary={`${ticketInfo.name} (${ticketInfo.org})`}
                    secondary={
                      <>
                        주문 시각 : {new Date(order.first_paid_at).toLocaleString()}<br />
                        주문 상태 : {order.current_status}
                      </>
                    }
                  />
                </ListItemButton>
              </ListItem>
            })}
          </List>
        </Drawer>

        <PageOuterContainer>
          <Toolbar />
          <PageMidContainer>
            <PageInnerContainer>
              <Routes>
                <Route element={<OrderIdlePage orders={screenState.searchResult} setOrder={setOrder} />} path="/" />
                <Route element={<OrderDetailPage closeOrder={() => handleDeskStatusChange('idle', true)} />} path="/order/:orderId" />
                <Route element={<DeskClosedPage />} path="/closed" />
                <Route element={<OrderIdlePage />} path="*" />
              </Routes>
            </PageInnerContainer>
          </PageMidContainer>
        </PageOuterContainer>
      </Box>
    </Box>
  )
}

export const DeskScreen: React.FC = () => {
  return (
    <SnackbarProvider>
      <DeskScreenProvider>
        <WrappedDeskScreen />
      </DeskScreenProvider>
    </SnackbarProvider>
  )
}
