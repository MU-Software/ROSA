import { styled } from '@mui/material'
import React from 'react'

import logo from '../assets/pycon_logo.png'
import { GlobalContext } from '../main'
import { Order } from '../models'
import { getTicketInfoFromOrder } from '../utils/order'

const WelcomeScreenPageContainer = styled('div')(() => ({
  display: 'flex',
  justifyContent: 'start',
  alignItems: 'center',
  height: '100vh',
  padding: 0,
  margin: 0,
  backgroundColor: '#000',
  color: '#fff',
  wordBreak: 'keep-all',

  img: {
    margin: '5rem 6rem',
    aspectRatio: 1,
    width: '80vh',
    minWidth: '66.666vh',
  },
}))

const WelcomeScreenTextContainer = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'start',
  textAlign: 'start',

  h1: {
    fontSize: '8rem',
    margin: 0,
    marginTop: '1.5rem',
    marginBottom: '1rem',
  },

  h4: {
    fontSize: '4.5rem',
    margin: 0,
  },
}))

const DefaultText: React.FC = () => <WelcomeScreenTextContainer>
  <h1>PyCon Korea 2024</h1>
  <h4>접수 / 도우미 데스크 (Registration & Help desk)</h4>
</WelcomeScreenTextContainer>

const DeskNotAvailable: React.FC = () => <WelcomeScreenTextContainer>
  <h1>옆 창구를 이용해주세요.</h1>
  <h4>Please use next window.</h4>
</WelcomeScreenTextContainer>

const UserDefinedText: React.FC<{ order: Order }> = ({ order }) => {
  const ticketInfo = getTicketInfoFromOrder(order)
  return <WelcomeScreenTextContainer>
    <h1>{ticketInfo.name}님, 안녕하세요!</h1>
    <h4>{ticketInfo.org} 소속</h4>
  </WelcomeScreenTextContainer>
}

export const WelcomeScreen: React.FC = () => {
  React.useEffect(() => window.resizeTo(1920, 480), [])
  const { state } = React.useContext(GlobalContext)

  let screen: React.ReactNode
  switch (state.desk_status) {
    case 'idle':
      screen = <DefaultText />
      break
    case 'registering':
      screen = state.order ? <UserDefinedText order={state.order} /> : <DefaultText />
      break
    case 'closed':
      screen = <DeskNotAvailable />
      break
    default:
      screen = <DefaultText />
  }

  return <WelcomeScreenPageContainer><img src={logo} />{screen}</WelcomeScreenPageContainer>
}
