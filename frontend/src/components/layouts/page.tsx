import { styled } from '@mui/material'
import React from 'react'

export const Page: React.FC<React.PropsWithChildren> = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  alignItems: 'flex-start',
  flexGrow: 1,
  width: '100%',
  maxWidth: 1300,
  padding: theme.spacing(4),

  overflowY: 'scroll',
}))

export const CenteredPage: React.FC<React.PropsWithChildren> = styled(Page)(() => ({
  justifyContent: 'flex-start',
  alignItems: 'center',
}))
