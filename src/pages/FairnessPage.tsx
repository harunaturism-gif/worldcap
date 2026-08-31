import { useState } from 'react';
import { CheckCircle2, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react';

interface FairnessResult { drawId: string; status: string; eligibleCount: string; snapshotCommitment: string | null; randomnessProvider: string | null; randomnessRequestId: string | null; randomnessSeed: string | null; algorithmVersion: string; winningIndex: string | null; winningTitle: string | null; verificationStatus: string }

export function FairnessPage() {
  const [drawId, setDrawId] = useState(''); const [result, setResult] = useState<FairnessResult | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const verify = async () => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(drawId)) { setError('Enter a valid public draw ID.'); return; }
    setLoading(true); setError(null);
    try { const response = await fetch(`${(import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')}/api/draws/${encodeURIComponent(drawId)}/fairness`); if (!response.ok) throw new Error('Draw not found or not yet public.'); setResult(await response.json() as FairnessResult); }
    catch (cause) { setResult(null); setError(cause instanceof Error ? cause.message : 'Verification unavailable.'); }
    finally { setLoading(false); }
  };
  return <div className="page-stack fairness-page"><div className="page-heading"><div><p className="eyebrow"><ShieldCheck size={14} /> Public trust data</p><h1>Verify a draw</h1><p>WorldCAP is designed so administrators cannot choose or alter winners after draw closure. Results can be independently reproduced from published data.</p></div></div>
    <section className="panel fairness-search"><label htmlFor="draw-id">Public draw ID</label><div><input id="draw-id" value={drawId} onChange={(event) => setDrawId(event.target.value)} placeholder="e.g. september-global-2026" /><button className="primary-button" onClick={() => void verify()} disabled={loading}>{loading ? <Loader2 className="spin" /> : <Search size={17} />} Verify</button></div>{error ? <p className="verify-error"><XCircle size={15} /> {error}</p> : null}</section>
    {result ? <section className="panel verification-result"><div className="section-heading"><div><p className="eyebrow">Recomputed public result</p><h2>{result.drawId}</h2></div><span className={result.verificationStatus === 'VERIFIED' ? 'verified-pill' : 'pending-pill'}>{result.verificationStatus === 'VERIFIED' ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}{result.verificationStatus}</span></div><dl><dt>Status</dt><dd>{result.status}</dd><dt>Eligible titles</dt><dd>{result.eligibleCount}</dd><dt>Manifest commitment</dt><dd><code>{result.snapshotCommitment ?? 'Not published'}</code></dd><dt>Randomness provider</dt><dd>{result.randomnessProvider ?? 'Pending'}</dd><dt>Request ID</dt><dd><code>{result.randomnessRequestId ?? 'Pending'}</code></dd><dt>Algorithm</dt><dd>{result.algorithmVersion}</dd><dt>Winning index</dt><dd>{result.winningIndex ?? 'Pending'}</dd><dt>Winning title</dt><dd>{result.winningTitle ?? 'Pending'}</dd></dl></section> : <section className="panel fairness-explainer"><h2>What the verifier checks</h2><ol><li>The public manifest hashes to its published commitment.</li><li>The randomness response belongs to the exact provider request.</li><li>The supported algorithm recomputes the winning index.</li><li>The winning title is the entry at that index—not an administrator input.</li></ol><p>On-chain anchoring is non-custodial and optional until the Sepolia registry is deployed. No Prize Vault funding or real payout is claimed.</p></section>}
  </div>;
}
