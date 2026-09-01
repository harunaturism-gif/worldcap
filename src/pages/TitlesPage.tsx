import { ArrowRight, CalendarCheck, CheckCircle2, Sparkles, Ticket } from 'lucide-react';
import { formatWld, useMvpStore } from '../store/mvpStore';
import type { Tab } from '../components/layout/AppShell';

export function TitlesPage({ onNavigate, notify }: { onNavigate: (tab: Tab) => void; notify: (message: string) => void }) {
  const { myTitles, snapshot, claimTitleCap, action } = useMvpStore();
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Your persisted collection</p><h1>My titles</h1><p>Individually numbered, issued only after payment verification.</p></div><button className="small-primary" onClick={() => onNavigate('home')}>+ Buy</button></div>
    <div className="eligibility-note"><CheckCircle2 size={18} /><div><b>CAP redemption preserves quarterly eligibility</b><span>Monthly CAP availability and quarterly draw-entry state are independent server records.</span></div></div>
    {myTitles.length === 0 ? <section className="empty-state"><span className="icon-tile"><Ticket /></span><h2>Your first title is waiting</h2><p>Complete a verified purchase to issue a title and enter the scheduled draws.</p><button className="primary-button" onClick={() => onNavigate('home')}>Choose a title <ArrowRight size={17} /></button></section> : <section className="title-list">
      {myTitles.map((title) => {
        const issuePriceUnits = snapshot?.purchases.find((purchase) => purchase.id === title.purchaseId)?.unitPriceUnits;
        return <article className={`owned-title tier-${title.tierCode}`} key={title.id}>
          <div className="title-stub"><span>09</span><small>{title.tierName.toUpperCase()}<br />2026</small></div>
          <div className="title-details"><span className="title-state"><i className={title.capRedemptionState === 'available' ? 'revealed' : ''} /> {title.tierName} · CAP {title.capRedemptionState}</span><h3>{title.serial}</h3><p><CalendarCheck size={14} /> Monthly + quarterly draw eligible</p><small className="title-lifecycle">Active collection · Redemption never removes quarterly eligibility</small></div>
          <div className="title-action">{title.capRedemptionState === 'available' ? <button className="reveal-button" disabled={action === 'cap-claim'} onClick={() => void claimTitleCap(title.id).then((outcome) => notify(outcome.message))}><Sparkles size={16} /> Claim CAP</button> : <><strong>{title.capEntitlementUnits} CAP</strong><span className="simulated-label">{title.capRedemptionState === 'locked' ? 'Available after monthly draw' : 'Simulated CAP claimed'}</span></>}<small>{issuePriceUnits ? formatWld(issuePriceUnits) : '—'} issue price</small></div>
        </article>;
      })}
    </section>}
  </div>;
}
