import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { supabase } from './lib/supabase'

// Test connection — remove after confirming
supabase.from('test').select('*').then(({ data, error }) => {
  if (error) console.log('Supabase connected but no tables yet — this is expected!')
  else console.log('Supabase connected!', data)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
