import { ArrowRight, CalendarDays, ChevronRight, CircleDollarSign, Loader2, ShieldCheck, Sparkles, Ticket, Trophy, X } from 'lucide-react';
import { useState } from 'react';
import { formatWld, useMvpStore } from '../store/mvpStore';
import type { Tab } from '../components/layout/AppShell';
import { PURPLE_TIER_ID } from '../services/economyApi';

const buyOptions = [1, 3, 5, 10];

export function HomePage({ onNavigate, notify }: { onNavigate: (tab: Tab) => void; notify: (message: string) => void }) {
  const { buyTitles, myTitles, snapshot, action } = useMvpStore();
  const [quantity, setQuantity] = useState(1);
  const [tierId, setTierId] = useState(PURPLE_TIER_ID);
  const [fairnessOpen, setFairnessOpen] = useState(false);
  if (!snapshot) return <section className="empty-state"><Loader2 className="spin" /><h2>Loading campaign</h2></section>;
  const campaign = snapshot.campaign;
  const selectedTier = snapshot.titleTiers.find((tier) => tier.id === tierId) ?? snapshot.titleTiers[0];
  if (!selectedTier) return <section className="empty-state"><h2>No active title tiers</h2></section>;
  const totalUnits = BigInt(selectedTier.priceUnits) * BigInt(quantity);
  const purchase = async () => {
    const result = await buyTitles(quantity, selectedTier.id);
    notify(result.message);
    if (result.ok) onNavigate('titles');
  };
  return <div className="page-stack">
    <section className="hero-card">
      <div className="hero-topline"><span className="live-pill"><i /> Annual jackpot</span><span>Draw · {new Date(campaign.annualDrawAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></div>
      <div className="jackpot-lockup"><span className="jackpot-icon"><Trophy /></span><div><small>Verified allocation ledger</small><h1>{formatWld(snapshot.pools.annual_jackpot)}</h1></div></div>
      <p>Every issued title stays eligible for the annual draw—even after its instant reveal.</p>
      <button className="hero-action" disabled={action === 'purchase' || snapshot.paymentMode === 'disabled'} onClick={() => void purchase()}>{action === 'purchase' ? <Loader2 className="spin" /> : null}{snapshot.paymentMode === 'disabled' ? 'Payments unavailable here' : `Get a title · ${formatWld(totalUnits)}`} <ArrowRight size={18} /></button>
      <button className="fairness-cta" onClick={() => setFairnessOpen(true)}><ShieldCheck size={17} /> How do we guarantee a fair draw?</button>
      <div className="hero-fine"><span><CalendarDays size={14} /> Monthly draw {new Date(campaign.monthlyDrawAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span><span><Sparkles size={14} /> Simulated instant reveal</span></div>
    </section>

    <section className="stat-grid" aria-label="Campaign summary">
      <article><span className="stat-icon peach"><Ticket /></span><small>Titles issued</small><strong>{snapshot.titlesSold.toLocaleString()}</strong><em>Persisted campaign</em></article>
      <article><span className="stat-icon mint"><CircleDollarSign /></span><small>Monthly allocation</small><strong>{formatWld(snapshot.pools.monthly_prize_pool)}</strong><em>60% accounting</em></article>
      <article><span className="stat-icon lilac"><Sparkles /></span><small>Your titles</small><strong>{myTitles.length}</strong><em>{myTitles.filter((title) => title.scratchStatus === 'available').length} ready to reveal</em></article>
    </section>

    <section className="panel campaign-panel">
      <div className="section-heading"><div><p className="eyebrow">Live now</p><h2>{campaign.name}</h2></div><button className="text-button" onClick={() => onNavigate('titles')}>My titles <ChevronRight size={16} /></button></div>
      <div className={`campaign-ticket tier-${selectedTier.skin}`}><div className="ticket-cut left" /><div className="ticket-cut right" /><span className="campaign-number">09</span><div><small>{campaign.monthLabel}</small><strong>{selectedTier.name} title</strong><p>Collectible · instant reveal · monthly + annual draw</p></div><b>{formatWld(selectedTier.priceUnits)}</b></div>
      <div className="tier-grid" aria-label="Choose title tier">{snapshot.titleTiers.map((tier) => <button key={tier.id} className={`tier-option tier-${tier.skin} ${selectedTier.id === tier.id ? 'selected' : ''}`} onClick={() => setTierId(tier.id)} aria-pressed={selectedTier.id === tier.id}><span>{tier.name}</span><strong>{formatWld(tier.priceUnits)}</strong><small>{tier.code === 'accessible' ? 'Open to everyone' : tier.code === 'purple' ? 'Premium identity' : 'Collector status'}</small></button>)}</div>
      <div className="quantity-row" aria-label="Purchase quantity">{buyOptions.map((option) => <button key={option} className={quantity === option ? 'selected' : ''} onClick={() => setQuantity(option)}><b>{option}</b><span>{option === 1 ? 'title' : 'titles'}</span></button>)}</div>
      <button className="primary-button wide" disabled={action === 'purchase' || snapshot.paymentMode === 'disabled'} onClick={() => void purchase()}>{action === 'purchase' ? 'Verifying payment…' : `Buy ${quantity} title${quantity === 1 ? '' : 's'}`} <span>{formatWld(totalUnits)}</span></button>
      <p className="payment-mode-note">{snapshot.paymentMode === 'real' ? 'World App WLD payment · server verified before issuance' : snapshot.paymentMode === 'development-fake' ? 'Explicit development-only fake payment · server flow exercised' : snapshot.paymentDisabledReason}</p>
    </section>

    <section className="panel allocation-panel"><div className="section-heading"><div><p className="eyebrow">Every verified purchase</p><h2>Exact capital allocation</h2></div><span className="simulation-badge">Accounting ledger</span></div><div className="allocation-bar" aria-label="60% monthly, 10% jackpot, 20% platform, 10% growth"><i className="monthly" /><i className="jackpot" /><i className="platform" /><i className="growth" /></div><div className="allocation-legend"><span><i className="monthly" /><b>60%</b> Monthly prizes</span><span><i className="jackpot" /><b>10%</b> Annual jackpot</span><span><i className="platform" /><b>20%</b> Platform & ops</span><span><i className="growth" /><b>10%</b> Commercial growth</span></div></section>
    {fairnessOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFairnessOpen(false); }}><section className="fairness-modal" role="dialog" aria-modal="true" aria-labelledby="fairness-title"><button className="modal-close" onClick={() => setFairnessOpen(false)} aria-label="Close fairness explanation"><X /></button><span className="fairness-mark"><ShieldCheck /></span><p className="eyebrow">Verify, don’t merely trust</p><h2 id="fairness-title">How a fair draw is designed</h2><ol><li>Eligible titles freeze when the draw closes.</li><li>Public randomness is requested only after closure.</li><li>A published deterministic algorithm maps that randomness to one title.</li><li>Administrators cannot choose or replace the winner.</li><li>Prize vault rules and payout evidence remain independently inspectable.</li></ol><div className="fairness-status"><b>Current MVP status</b><p>Purchase accounting and title eligibility are persisted now. Frozen draw snapshots, verifiable randomness, funded vault contracts, and automatic payouts are Phase 3 trust infrastructure—not yet claimed as live.</p></div></section></div> : null}
  </div>;
}
