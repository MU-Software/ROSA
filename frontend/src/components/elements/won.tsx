import React from 'react'

export const Won: React.FC<{ price: number }> = ({ price }) => <>{price.toLocaleString()}원</>
