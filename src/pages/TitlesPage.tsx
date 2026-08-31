import { ArrowRight, CalendarCheck, CheckCircle2, Sparkles, Ticket } from 'lucide-react';
import { formatWld, useMvpStore } from '../store/mvpStore';
import type { Tab } from '../components/layout/AppShell';

export function TitlesPage({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { myTitles, snapshot } = useMvpStore();
  const results = new Map(snapshot?.scratchResults.map((result) => [result.titleId, result]));
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Your persisted collection</p><h1>My titles</h1><p>Individually numbered, issued only after payment verification.</p></div><button className="small-primary" onClick={() => onNavigate('home')}>+ Buy</button></div>
    <div className="eligibility-note"><CheckCircle2 size={18} /><div><b>Revealing never removes draw eligibility</b><span>Scratch status and draw-entry status are separate server records.</span></div></div>
    {myTitles.length === 0 ? <section className="empty-state"><span className="icon-tile"><Ticket /></span><h2>Your first title is waiting</h2><p>Complete a verified purchase to issue a title and enter the scheduled draws.</p><button className="primary-button" onClick={() => onNavigate('home')}>Choose a title <ArrowRight size={17} /></button></section> : <section className="title-list">
      {myTitles.map((title) => {
        const result = results.get(title.id);
        const issuePriceUnits = snapshot?.purchases.find((purchase) => purchase.id === title.purchaseId)?.unitPriceUnits;
        return <article className={`owned-title tier-${title.tierCode}`} key={title.id}>
          <div className="title-stub"><span>09</span><small>{title.tierName.toUpperCase()}<br />2026</small></div>
          <div className="title-details"><span className="title-state"><i className={title.scratchStatus === 'revealed' ? 'revealed' : ''} /> {title.tierName} · {title.scratchStatus === 'revealed' ? 'Revealed' : 'Ready to reveal'}</span><h3>{title.serial}</h3><p><CalendarCheck size={14} /> Monthly + annual draw eligible</p><small className="title-lifecycle">Active collection · Renewal not yet eligible</small></div>
          <div className="title-action">{result ? <><strong>{BigInt(result.prizeUnits) > 0n ? `+${formatWld(result.prizeUnits)}` : 'No instant prize'}</strong><span className="simulated-label">Simulated result</span></> : <button className="reveal-button" onClick={() => onNavigate('play')}><Sparkles size={16} /> Scratch</button>}<small>{issuePriceUnits ? formatWld(issuePriceUnits) : '—'} issue price</small></div>
        </article>;
      })}
    </section>}
  </div>;
}
