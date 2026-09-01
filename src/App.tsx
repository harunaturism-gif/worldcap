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

export default function App({ session, logout }: { session: AppSession; logout: () => Promise<void> }) {
  return <MvpStoreProvider session={session}><AuthenticatedApp session={session} logout={logout} /></MvpStoreProvider>;
}

function AuthenticatedApp({ session, logout }: { session: AppSession; logout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>('home');
  const [notice, setNotice] = useState<string | null>(null);
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(null), 2600); };
  return <AppShell session={session} tab={tab} onTab={setTab} onLogout={() => void logout()}>
    {tab === 'home' && <HomePage onNavigate={setTab} notify={notify} />}
    {tab === 'titles' && <TitlesPage onNavigate={setTab} notify={notify} />}
    {tab === 'play' && <PlayPage onNavigate={setTab} notify={notify} />}
    {tab === 'social' && <SocialPage notify={notify} />}
    {tab === 'wallet' && <WalletPage />}
    {tab === 'fairness' && <FairnessPage />}
    {notice && <div className="toast" role="status">{notice}</div>}
  </AppShell>;
}
