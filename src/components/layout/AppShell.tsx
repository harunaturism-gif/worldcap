import { Home, ShieldCheck, Sparkles, Ticket, Users, WalletCards } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppSession } from '../../domains/identity/types';
import { formatWld, useMvpStore } from '../../store/mvpStore';

export type Tab = 'home' | 'titles' | 'play' | 'social' | 'wallet' | 'fairness';
const navigation = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'titles', label: 'Titles', icon: Ticket },
  { id: 'play', label: 'Play', icon: Sparkles },
  { id: 'social', label: 'Social', icon: Users },
  { id: 'wallet', label: 'Wallet', icon: WalletCards },
  { id: 'fairness', label: 'Fairness', icon: ShieldCheck },
] as const;

export function AppShell({ session, tab, onTab, onLogout, children }: { session: AppSession; tab: Tab; onTab: (tab: Tab) => void; onLogout: () => void; children: ReactNode }) {
  const { snapshot } = useMvpStore();
  const verifiedSpend = snapshot?.ledger.filter((entry) => entry.classification === 'verified_purchase').reduce((sum, entry) => sum + BigInt(entry.amountUnits), 0n) ?? 0n;
  return <div className="app-shell">
    <header className="topbar">
      <button className="brand-button" onClick={() => onTab('home')} aria-label="CAP home">
        <span className="brand-symbol">C</span><span><b>CAP</b><small><i /> Verified human</small></span>
      </button>
      <button className="balance-chip" onClick={() => onTab('wallet')}>
        <span>Verified spend</span><strong>{formatWld(verifiedSpend)}</strong>
      </button>
      <button className="avatar-button" title={`Sign out ${session.user.username}`} onClick={onLogout}>{session.user.username.slice(-2).toUpperCase()}</button>
    </header>
    <main className="app-content">{children}</main>
    <nav className="bottom-nav" aria-label="Main navigation">
      {navigation.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => onTab(id)} aria-current={tab === id ? 'page' : undefined}>
        <span className="nav-icon"><Icon size={21} /></span><span>{label}</span>
      </button>)}
    </nav>
  </div>;
}
