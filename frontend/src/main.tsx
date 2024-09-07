import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary, FallbackProps } from 'react-error-boundary'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import * as R from 'remeda'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { WS_DOMAIN } from './hooks/useAPIs'
import { AppState, INITIAL_APP_SESSION_STATE } from './models'
import { DeskScreen } from './screens/deskScreen'
import { WelcomeScreen } from './screens/welcomeScreen'

import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 3, refetchOnMount: 'always', gcTime: 1, staleTime: 10000 } },
})

export const GlobalContext = React.createContext<{
  state: AppState
  isWSConnected: boolean
  dispatch: React.Dispatch<React.SetStateAction<AppState>>
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

  const setData = (dataStr: string) => {
    try {
      const data = JSON.parse(dataStr)
      if (data.commit_id === commitIdRef.current) return

      console.log('new commit', data.commit_id, commitIdRef.current)
      commitIdRef.current = data.commit_id
      dispatch(data)
    } catch (e) {
      console.error(e)
    }
  }
  const logAndSetIsWSConnected = (evt: Event, value: boolean) => {
    console.log(evt.type, evt)
    setIsWSConnected(value)
  }

  React.useEffect(() => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) return

    websocketRef.current = new WebSocket(`${WS_DOMAIN}/ws`)
    websocketRef.current.onopen = (evt) => logAndSetIsWSConnected(evt, true)
    websocketRef.current.onmessage = (evt) => setData(evt.data)
    websocketRef.current.onclose = (evt) => logAndSetIsWSConnected(evt, false)
    websocketRef.current.onerror = (evt) => logAndSetIsWSConnected(evt, false)
  }, [state])

  const onError = ({ error }: FallbackProps) => {
    websocketRef.current?.close()
    setTimeout(() => window.location.reload(), 100)
    return R.isObjectType(error) ? <pre>{error.toLocaleString()}</pre> : null
  }

  return <ErrorBoundary fallbackRender={onError}>
    <GlobalContext.Provider value={{ state, isWSConnected, dispatch }}>
      <QueryClientProvider client={queryClient}>
        <ReactQueryDevtools initialIsOpen={false} />
        <BrowserRouter>
          <Routes>
            <Route element={<WelcomeScreen />} path="/welcome-screen" />
            <Route element={<DeskScreen />} path="/*" />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </GlobalContext.Provider>
  </ErrorBoundary>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
