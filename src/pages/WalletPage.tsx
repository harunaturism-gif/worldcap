import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, History, Landmark, ShieldAlert, WalletCards } from 'lucide-react';
import { useMvpStore, formatWld } from '../store/mvpStore';

export function WalletPage() {
  const { snapshot } = useMvpStore();
  if (!snapshot) return null;
  const { verifiedSpend, simulatedLiability } = snapshot.ledger.reduce(
    (acc, entry) => {
      if (entry.classification === 'verified_purchase') {
        acc.verifiedSpend += BigInt(entry.amountUnits);
      } else if (entry.classification === 'simulated_scratch_prize') {
        acc.simulatedLiability += BigInt(entry.amountUnits);
      }
      return acc;
    },
    { verifiedSpend: 0n, simulatedLiability: 0n }
  );
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Finance</p><h1>Wallet & history</h1><p>Verified WLD purchases and simulated prize liabilities are intentionally separate.</p></div><span className="simulation-badge">Server ledger</span></div>
    <section className="wallet-card"><div className="wallet-orb"><WalletCards /></div><div><small>Connected payer</small><h2 className="wallet-address">{snapshot.walletAddress ? `${snapshot.walletAddress.slice(0, 8)}…${snapshot.walletAddress.slice(-6)}` : 'No verified payment yet'}</h2><p>No custodial or invented in-app balance</p></div><div className="wallet-actions"><button disabled><ArrowDownLeft size={17} /> Add WLD</button><button disabled><ArrowUpRight size={17} /> Send</button></div></section>
    <section className="wallet-stat-grid"><article><span><CircleDollarSign /></span><small>Verified WLD spent</small><strong>{formatWld(verifiedSpend)}</strong></article><article><span><ShieldAlert /></span><small>Simulated liabilities</small><strong>{formatWld(simulatedLiability)}</strong></article><article><span><Landmark /></span><small>Annual allocation</small><strong>{formatWld(snapshot.pools.annual_jackpot)}</strong></article></section>
    <section className="panel history-panel"><div className="section-heading"><div><p className="eyebrow">Ledger</p><h2>Activity</h2></div><History size={20} /></div><div className="ledger-list">{snapshot.ledger.length ? snapshot.ledger.map((entry) => <article key={entry.id}><span className={`ledger-icon ${entry.direction}`}>{entry.direction === 'credit' ? <ArrowDownLeft /> : <ArrowUpRight />}</span><div><b>{entry.description}</b><small>{entry.classification === 'verified_purchase' ? 'Verified purchase' : 'Simulated · non-spendable'} · {new Date(entry.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></div><strong className={entry.direction}>{entry.direction === 'credit' ? '+' : '-'}{formatWld(entry.amountUnits)}</strong></article>) : <p className="empty-ledger">No economic activity yet.</p>}</div></section>
    <section className="legal-notice"><ShieldAlert size={18} /><p><b>Prize settlement remains simulated.</b> Instant results create clearly labeled, non-spendable liabilities. They never increase a real or displayed WLD balance.</p></section>
  </div>;
}
