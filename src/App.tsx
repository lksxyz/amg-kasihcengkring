/**
 * KasihCengkring — root router.
 * Routes:
 *   /            → LandingPage
 *   /app         → AppDashboard (SIWE login, onboarding, dashboard)
 *   /app/history → HistoryPage
 *   /app/setting → SettingsPage
 *   /:username   → CreatorPage (public profile + donation form)
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AppDashboard from './pages/AppDashboard';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import CreatorPage from './pages/CreatorPage';
import OverlayPage from './pages/OverlayPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home / landing */}
        <Route path="/" element={<LandingPage />} />

        {/* Creator dashboard routes */}
        <Route path="/app" element={<AppDashboard />} />
        <Route path="/app/history" element={<HistoryPage />} />
        <Route path="/app/setting" element={<SettingsPage />} />

        <Route path="/overlay" element={<OverlayPage />} />
        <Route path="/overlay/:username" element={<OverlayPage />} />

        {/* Public creator profile — must be last to avoid shadowing /app/* */}
        <Route path="/:username" element={<CreatorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
