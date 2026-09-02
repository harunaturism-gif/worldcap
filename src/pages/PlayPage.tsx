import { CheckCircle2, Clock3, Gift, Loader2, LockKeyhole, ShieldAlert, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { useMvpStore } from '../store/mvpStore';
import type { Tab } from '../components/layout/AppShell';
import type { QuestDto } from '../services/genesisCapApi';

function cap(value: string): string { return `${BigInt(value).toLocaleString()} CAP`; }
function questLabel(kind: string): string { return kind.toLowerCase().split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '); }
function statusIcon(status: QuestDto['status']) {
  if (status === 'CLAIMED' || status === 'QUALIFIED') return <CheckCircle2 />;
  if (status === 'PENDING_VERIFICATION' || status === 'IN_PROGRESS') return <Clock3 />;
  if (status === 'UNAVAILABLE') return <ShieldAlert />;
  return <LockKeyhole />;
}

export function PlayPage({ onNavigate, notify }: { onNavigate: (tab: Tab) => void; notify: (message: string) => void }) {
  void onNavigate;
  const { journey, action, registerHumanClaim, evaluateQuest, claimQuest, registerReferral } = useMvpStore();
  const [referral, setReferral] = useState('');
  if (!journey) return <section className="empty-state"><Loader2 className="spin" /><h2>Loading Genesis Journey</h2></section>;
  const human = journey.humanClaim;
  const register = async () => { const result = await registerHumanClaim(); notify(result.message); };
  const submitReferral = async () => { const result = await registerReferral(referral); notify(result.message); if (result.ok) setReferral(''); };
  return <div className="page-stack genesis-page">
    <div className="page-heading"><div><p className="eyebrow">Your monthly return</p><h1>Claim. Collect. Progress.</h1><p>Come back each month for your free Human Claim, then complete verified quests to grow your simulated $CAP balance. No purchase required.</p></div><span className="simulation-badge">Local simulation</span></div>
    <section className="panel human-claim-card">
      <div className="section-heading"><div><p className="eyebrow">Your free monthly claim</p><h2>{human.epoch?.calendarPeriod ?? 'No open period'}</h2></div><span className={human.participation === 'SETTLED' ? 'verified-pill' : 'pending-pill'}>{human.participation}</span></div>
      {human.epoch ? <><div className="claim-pool"><span><Gift /></span><div><small>Fixed monthly pool</small><strong>{cap(human.epoch.poolUnits)}</strong></div><div><small>People registered</small><strong>{BigInt(human.epoch.participantCount).toLocaleString()}</strong></div></div>
        {human.estimatedUnits !== null ? <p className="estimate-line"><b>ESTIMATE</b> If registration closed now, your share would be {cap(human.estimatedUnits)}. The final amount is locked when the month closes.</p> : null}
        {human.participation === 'SETTLED' ? <p className="settled-line"><CheckCircle2 /> Finalized allocation: {cap(human.settledUnits)}. The integer remainder remains unissued.</p> : null}
        <button className="primary-button wide" disabled={!human.available || human.participation !== 'NOT_CLAIMED' || action === 'human-claim'} onClick={() => void register()}>{action === 'human-claim' ? <Loader2 className="spin" /> : <Users />} {human.participation === 'NOT_CLAIMED' ? 'Register for this month' : human.participation === 'REGISTERED' ? 'Registered — settlement pending' : 'Monthly share settled'}</button></> : <div className="unavailable-state"><ShieldAlert /><p>{human.reason}. A fixed pool must be published before registration opens.</p></div>}
    </section>
    <section className="panel genesis-campaign">
      <div className="section-heading"><div><p className="eyebrow">Your Genesis Journey</p><h2>{journey.campaign?.name ?? 'No active campaign'}</h2></div>{journey.campaign ? <span className="pending-pill">{journey.campaign.version}</span> : null}</div>
      {journey.campaign ? <><div className="budget-row"><span>Published budget <b>{cap(journey.campaign.budgetUnits)}</b></span><span>Distributed <b>{cap(journey.campaign.distributedUnits)}</b></span><span>Reserved <b>{cap(journey.campaign.reservedUnits)}</b></span><span>Remaining <b>{cap(journey.campaign.remainingUnits)}</b></span></div>
        <div className="quest-list">{journey.quests.map((quest) => <article key={quest.questId} className={`quest-card status-${quest.status.toLowerCase()}`}><span className="quest-icon">{statusIcon(quest.status)}</span><div><b>{questLabel(quest.kind)}</b><small>{quest.verificationMode === 'EXTERNAL' ? 'Authoritative external verification required' : `${quest.progressCurrent}/${quest.progressRequired} verified progress`}</small>{quest.reason ? <em>{quest.reason}</em> : null}</div><strong>{cap(quest.rewardUnits)}</strong>{quest.status === 'QUALIFIED' ? <button onClick={() => void claimQuest(quest.questId).then((result) => notify(result.message))}>Claim</button> : quest.status === 'CLAIMED' || quest.status === 'UNAVAILABLE' ? null : <button disabled={action === 'quest'} onClick={() => void evaluateQuest(quest.questId).then((result) => notify(result.message))}>Check</button>}</article>)}</div>
        <div className="referral-panel"><div><small>Your privacy-safe referral code</small><code>{journey.referralCode}</code></div><div><input value={referral} maxLength={16} onChange={(event) => setReferral(event.target.value.toUpperCase())} placeholder="Inviter code" aria-label="Inviter referral code" /><button disabled={referral.length !== 16 || action === 'quest'} onClick={() => void submitReferral()}>Record referral</button></div><p>Invite a different verified human before they complete a quest. Self-referrals and late referrals are rejected.</p></div>
      </> : <div className="unavailable-state"><Sparkles /><p>No budgeted Genesis campaign is active. Reward amounts are never invented by the client.</p></div>}
    </section>
  </div>;
}
