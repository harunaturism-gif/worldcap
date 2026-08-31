import { Heart, MessageCircle, Send, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { useMvpStore } from '../store/mvpStore';

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export function SocialPage({ notify }: { notify: (message: string) => void }) {
  const { snapshot, memberPosts, createPost, toggleReaction } = useMvpStore();
  const [body, setBody] = useState('');
  const submit = () => { if (!createPost(body)) { notify('Post must be 1–240 characters.'); return; } setBody(''); notify('Shared for this local session.'); };
  const posts = [...memberPosts, ...(snapshot?.activity ?? [])];
  return <div className="page-stack social-page">
    <div className="page-heading"><div><p className="eyebrow">Privacy-aware activity</p><h1>Human feed</h1><p>Title and winner milestones without exposing private ownership or balances.</p></div><span className="community-chip"><Users size={16} /> MVP</span></div>
    <section className="composer panel"><span className="feed-avatar current">YO</span><div><textarea maxLength={240} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share something with the WorldCAP community…" aria-label="Create a post" /><div><small>{body.length}/240</small><button disabled={!body.trim()} onClick={submit}><Send size={15} /> Post</button></div></div></section>
    <section className="feed-list">{posts.map((post) => {
      const isLocal = 'local' in post && post.local === true;
      const label = isLocal ? 'You' : 'WorldCAP activity';
      const reacted = 'reacted' in post && post.reacted === true;
      const reactions = 'reactions' in post && typeof post.reactions === 'number' ? post.reactions : 0;
      return <article className="feed-card" key={post.id}><span className={`feed-avatar ${post.type}`}>{isLocal ? 'YO' : 'WP'}</span><div className="feed-main"><div className="feed-meta"><b>{label}</b><ShieldCheck size={14} /><span>· {relativeTime(post.createdAt)}</span></div><p>{post.body}</p>{!isLocal ? <div className={`activity-tag ${post.type}`}><Sparkles size={14} /> {post.type === 'winner_activity' ? 'Winner activity' : post.type === 'purchase_activity' ? 'Title activity' : 'Jackpot milestone'}</div> : null}<div className="feed-actions"><button className={reacted ? 'reacted' : ''} disabled={!isLocal} onClick={() => toggleReaction(post.id)}><Heart size={16} fill={reacted ? 'currentColor' : 'none'} /> {reactions || 'Celebrate'}</button><button disabled><MessageCircle size={16} /> Reply soon</button></div></div></article>;
    })}</section>
  </div>;
}
