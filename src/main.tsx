import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import App from './App'
import Layout from './dashboard/Layout'
import Discover from './dashboard/Discover'
import Opportunity from './dashboard/Opportunity'
import Research from './dashboard/Research'
import Report from './dashboard/Report'
import Compare from './dashboard/Compare'
import Watchlist from './dashboard/Watchlist'
import History from './dashboard/History'
import Settings from './dashboard/Settings'
import './styles.css'
import './dashboard/dashboard.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Navigate to="discover" replace />} />
          <Route path="discover" element={<Discover />} />
          <Route path="opportunity/:poolId" element={<Opportunity />} />
          <Route path="research/:poolId" element={<Research />} />
          <Route path="report/:reportId" element={<Report />} />
          <Route path="compare" element={<Compare />} />
          <Route path="watchlist" element={<Watchlist />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="discover" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
