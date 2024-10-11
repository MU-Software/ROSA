import { wrap } from '@suspensive/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import * as R from 'remeda'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { LOCAL_STORAGE_SESSION_ID_KEY } from './consts/globals'
import { WS_DOMAIN, useSessionQuery } from './hooks/useAPIs'
import { INITIAL_APP_SESSION_STATE, SessionState } from './models'
import { DeskScreen } from './screens/deskScreen'
import { WelcomeScreen } from './screens/welcomeScreen'

import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { CircularProgress } from '@mui/material'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 3, refetchOnMount: 'always', gcTime: 1, staleTime: 10000 } },
})

export const GlobalContext = React.createContext<{
  state: SessionState
  isWSConnected: boolean
  dispatch: React.Dispatch<React.SetStateAction<SessionState>>
}>({
  state: INITIAL_APP_SESSION_STATE,
  isWSConnected: false,
  dispatch: () => { },
})

const App: React.FC = () => {
  const [state, dispatch] = React.useState(INITIAL_APP_SESSION_STATE)
  const [isWSConnected, setIsWSConnected] = React.useState(false)
  const websocketRef = React.useRef<WebSocket>()
  const commitIdRef = React.useRef<string>()

  const logAndSetIsWSConnected = (evt: Event, value: boolean) => {
    console.log(evt.type, evt)
    setIsWSConnected(value)
  }
  const setData = (dataStr: string) => {
    try {
      const data = JSON.parse(dataStr)
      if (data.commit_id === commitIdRef.current) return

      console.log(`new commit : ${commitIdRef.current} -> ${data.commit_id}`)
      commitIdRef.current = data.commit_id
      dispatch(data)
    } catch (e) {
      console.error(e)
    }
  }

  const SessionApp = wrap
    .ErrorBoundary({ fallback: <div>에러 발생, 새로고침을 해주세요.</div> })
    .Suspense({ fallback: <CircularProgress /> })
    .on(() => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { data } = useSessionQuery()

      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useEffect(() => {
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN)
          return

        window.localStorage.setItem(LOCAL_STORAGE_SESSION_ID_KEY, data.id)
        websocketRef.current = new WebSocket(`${WS_DOMAIN}/ws?session_id=${data.id}`)
        websocketRef.current.onmessage = (evt) => setData(evt.data)
        websocketRef.current.onopen = (evt) => logAndSetIsWSConnected(evt, true)
        websocketRef.current.onclose = (evt) => logAndSetIsWSConnected(evt, false)
        websocketRef.current.onerror = (evt) => logAndSetIsWSConnected(evt, false)
      }, [data.id])

      return <GlobalContext.Provider value={{ state, isWSConnected, dispatch }}>
        <BrowserRouter>
          <Routes>
            <Route element={<WelcomeScreen />} path="/welcome-screen" />
            <Route element={<DeskScreen />} path="/*" />
          </Routes>
        </BrowserRouter>
      </GlobalContext.Provider>
    })

  return <ErrorBoundary fallbackRender={({ error }: FallbackProps) => {
    websocketRef.current?.close()
    setTimeout(() => window.location.reload(), 1000)
    return R.isObjectType(error) ? <pre>{error.toLocaleString()}</pre> : <div>에러 발생, 새로고침을 해주세요.</div>
  }}>
    <SessionApp />
  </ErrorBoundary>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
      <App />
    </QueryClientProvider>
  </React.StrictMode >
)
