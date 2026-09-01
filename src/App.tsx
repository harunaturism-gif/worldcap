import { useState } from 'react';
import type { AppSession } from './domains/identity/types';
import { AppShell, type Tab } from './components/layout/AppShell';
import { MvpStoreProvider } from './store/mvpStore';
import { HomePage } from './pages/HomePage';
import { TitlesPage } from './pages/TitlesPage';
import { PlayPage } from './pages/PlayPage';
import { SocialPage } from './pages/SocialPage';
import { WalletPage } from './pages/WalletPage';
import { FairnessPage } from './pages/FairnessPage';
import { FounderControlCenterPage } from './pages/FounderControlCenterPage';

export default function App({ session, logout }: { session: AppSession; logout: () => Promise<void> }) {
  return <MvpStoreProvider session={session}><AuthenticatedApp session={session} logout={logout} /></MvpStoreProvider>;
}

function AuthenticatedApp({ session, logout }: { session: AppSession; logout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>('home');
  const [founderOpen, setFounderOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 2600); };
  const navigate = (next: Tab) => { setFounderOpen(false); setTab(next); };
  return <AppShell session={session} tab={tab} onTab={navigate} onLogout={() => void logout()}>
    {founderOpen && <FounderControlCenterPage onBack={() => setFounderOpen(false)} />}
    {!founderOpen && tab === 'home' && <HomePage onNavigate={navigate} notify={notify} />}
    {!founderOpen && tab === 'titles' && <TitlesPage onNavigate={navigate} notify={notify} />}
    {!founderOpen && tab === 'play' && <PlayPage onNavigate={navigate} notify={notify} />}
    {!founderOpen && tab === 'social' && <SocialPage notify={notify} />}
    {!founderOpen && tab === 'wallet' && <WalletPage onOpenFounder={() => setFounderOpen(true)} />}
    {!founderOpen && tab === 'fairness' && <FairnessPage />}
    {notice && <div className="toast" role="status">{notice}</div>}
  </AppShell>;
}
