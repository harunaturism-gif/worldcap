import { ArrowRight, Check, Gift, LockKeyhole, Sparkles, Ticket, Trophy } from 'lucide-react';
import { ScratchCard } from '../components/game/ScratchCard';
import { useMvpStore, formatWld } from '../store/mvpStore';
import type { Tab } from '../components/layout/AppShell';

export function PlayPage({ onNavigate }: { onNavigate: (tab: Tab) => void; notify: (message: string) => void }) {
  const { myTitles, prepareScratch, showReveal, lastReveal, clearLastReveal } = useMvpStore();
  const unrevealed = myTitles.filter((title) => title.scratchStatus === 'available');
  const outcomeTitle = lastReveal ? myTitles.find((title) => title.id === lastReveal.result.titleId) ?? lastReveal.title : null;

  if (lastReveal && outcomeTitle) {
    const won = BigInt(lastReveal.result.prizeUnits) > 0n;
    return <div className="result-wrap"><section className={`prize-result ${won ? 'winner' : ''}`}><div className="result-rays" aria-hidden="true" /><span className="result-icon">{won ? <Trophy /> : <Sparkles />}</span><p className="eyebrow">Persisted legacy result</p><h1>{won ? formatWld(lastReveal.result.prizeUnits) : 'Not this time'}</h1><p>{won ? 'This is a simulated legacy liability—not spendable WLD and not an on-chain payout.' : 'This title remains live for monthly draws and the quarterly jackpot.'}</p><div className="result-title"><Ticket size={17} /><span>{outcomeTitle.serial}</span><b><Check size={15} /> Draw eligible</b></div>{won ? <button className="primary-button wide" onClick={() => onNavigate('wallet')}>View simulated liability <ArrowRight size={17} /></button> : null}<button className="text-button centered" onClick={clearLastReveal}>{unrevealed.length ? 'View another legacy reveal' : 'Close result'}</button></section></div>;
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Instant game</p><h1>Scratch & reveal</h1><p>Drag across the foil. WorldCAP cannot manually change the persisted result shown by this reveal.</p></div></div>
    <section className="play-banner"><div><span className="icon-tile"><Gift /></span><div><small>Ready to play</small><strong>{unrevealed.length} title{unrevealed.length === 1 ? '' : 's'}</strong></div></div><span><LockKeyhole size={15} /> Simulated prize logic</span></section>
    {unrevealed.length === 0 ? <section className="empty-state"><span className="icon-tile"><Sparkles /></span><h2>No reveals waiting</h2><p>{myTitles.length ? 'Every title has a persisted result and remains draw eligible.' : 'Buy a title to unlock its scratch surface.'}</p><button className="primary-button" onClick={() => onNavigate(myTitles.length ? 'titles' : 'home')}>{myTitles.length ? 'View my titles' : 'Get a title'} <ArrowRight size={17} /></button></section> : <section className="scratch-list">{unrevealed.map((title) => <ScratchCard key={title.id} title={title} prepare={prepareScratch} onRevealed={showReveal} />)}</section>}
  </div>;
}
