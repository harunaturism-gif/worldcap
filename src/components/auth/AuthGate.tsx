import { useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, Check, Loader2, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import type { AppSession } from '../../domains/identity/types';
import { AuthService } from '../../services/authService';
import { FairnessPage } from '../../pages/FairnessPage';

export function AuthGate({ children }: { children: (session: AppSession, logout: () => Promise<void>) => ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [publicFairness, setPublicFairness] = useState(false);

  const authenticate = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    const nextSession = await AuthService.authenticate();
    if (!nextSession) { setStatus('error'); return; }
    setSession(nextSession);
    setStatus('idle');
  };

  const logout = async () => { await AuthService.logout(); setSession(null); setStatus('idle'); };
  if (session) return children(session, logout);
  if (publicFairness) return <main className="public-fairness-shell"><button className="public-back" onClick={() => setPublicFairness(false)}>← Back to sign in</button><FairnessPage /></main>;

  const devMode = AuthService.isDevelopmentBypass();
  return <main className="auth-screen">
    <div className="auth-glow auth-glow-one" aria-hidden="true" />
    <div className="auth-glow auth-glow-two" aria-hidden="true" />
    <section className="auth-card">
      <div className="auth-mark"><Trophy size={31} strokeWidth={2.2} /></div>
      <p className="eyebrow"><Sparkles size={13} /> Built for World App</p>
      <h1>Collect today.<br /><em>Come back monthly.</em></h1>
      <p className="auth-intro">Own numbered titles, join a free Human Claim every month, and follow each draw from commitment to result.</p>
      <div className="auth-points">
        <span><Check size={15} /> One human, one identity</span>
        <span><Check size={15} /> A reason to return monthly</span>
        <span><Check size={15} /> Results anyone can verify</span>
      </div>
      <button className="auth-button" disabled={status === 'loading'} onClick={authenticate} aria-busy={status === 'loading'}>
        {status === 'loading' ? <><Loader2 className="spin" size={19} /> Opening…</> : devMode ? <><Sparkles size={19} /> Enter the local beta <ArrowRight size={18} /></> : <><ShieldCheck size={19} /> Continue with World ID <ArrowRight size={18} /></>}
      </button>
      <button className="fairness-public-button" onClick={() => setPublicFairness(true)}><ShieldCheck size={17} /> See how CAP keeps draws verifiable</button>
      <div className="auth-status" aria-live="polite">
        {status === 'error' ? <p className="auth-error"><AlertCircle size={15} /> We could not verify you. Open CAP inside World App and try again.</p> : devMode ? <p><span className="status-dot" /> Local tour · simulated data only</p> : <p><ShieldCheck size={14} /> Verified securely through World ID</p>}
      </div>
      <p className="demo-disclaimer">Closed technical beta. Prize liabilities and payouts are simulated; real-money prize operation is not authorized.</p>
    </section>
  </main>;
}
