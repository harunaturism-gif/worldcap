/* eslint-disable react-refresh/only-export-components -- provider and typed hook intentionally colocated */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSession } from '../domains/identity/types';
import { EconomyApi, formatWldUnits, type ActivityDto, type EconomySnapshot, type TitleDto } from '../services/economyApi';
import { GenesisCapApi, type GenesisJourneyDto } from '../services/genesisCapApi';

interface MemberPost extends ActivityDto { local: true; reactions: number; reacted: boolean }

interface StoreValue {
  snapshot: EconomySnapshot | null;
  journey: GenesisJourneyDto | null;
  myTitles: TitleDto[];
  isLoading: boolean;
  action: 'purchase' | 'cap-claim' | 'human-claim' | 'quest' | 'social-post' | null;
  error: string | null;
  memberPosts: MemberPost[];
  refresh: () => Promise<void>;
  buyTitles: (quantity: number, tierId: string) => Promise<{ ok: boolean; message: string }>;
  claimTitleCap: (titleId: string) => Promise<{ ok: boolean; message: string }>;
  registerHumanClaim: () => Promise<{ ok: boolean; message: string }>;
  evaluateQuest: (questId: string) => Promise<{ ok: boolean; message: string }>;
  claimQuest: (questId: string) => Promise<{ ok: boolean; message: string }>;
  registerReferral: (inviterCode: string) => Promise<{ ok: boolean; message: string }>;
  createPost: (body: string) => Promise<boolean>;
  toggleReaction: (postId: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function MvpStoreProvider({ children }: { session: AppSession; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<EconomySnapshot | null>(null);
  const [journey, setJourney] = useState<GenesisJourneyDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<StoreValue['action']>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberPosts, setMemberPosts] = useState<MemberPost[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [economy, genesis] = await Promise.all([EconomyApi.snapshot(), GenesisCapApi.journey()]);
      setSnapshot(economy); setJourney(genesis); setError(null);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Economic state unavailable'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const buyTitles = useCallback(async (quantity: number, tierId: string) => {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) return { ok: false, message: 'Choose 1–10 titles.' };
    setAction('purchase');
      try {
        const completion = await EconomyApi.purchase(quantity, tierId);
        if ('pending' in completion) {
          await refresh();
          return { ok: true, message: 'Payment is still finalizing. CAP will reconcile it automatically without issuing twice.' };
        }
        await refresh();
      return { ok: true, message: `${completion.titles.length} verified title${completion.titles.length === 1 ? '' : 's'} issued.` };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Purchase failed';
      setError(message);
      return { ok: false, message };
    } finally { setAction(null); }
  }, [refresh]);

  const claimTitleCap = useCallback(async (titleId: string) => {
    setAction('cap-claim');
    try {
      const result = await EconomyApi.claimTitleCap(titleId);
      await refresh();
      return { ok: true, message: `${result.claimedUnits} simulated CAP claimed. Quarterly eligibility is unchanged.` };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'CAP claim failed';
      setError(message);
      return { ok: false, message };
    } finally { setAction(null); }
  }, [refresh]);

  const registerHumanClaim = useCallback(async () => {
    setAction('human-claim');
    try { await GenesisCapApi.registerHumanClaim(); await refresh(); return { ok: true, message: 'Registered. CAP is settled only after the monthly pool closes.' }; }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Registration failed'; setError(message); return { ok: false, message }; }
    finally { setAction(null); }
  }, [refresh]);

  const evaluateQuest = useCallback(async (questId: string) => {
    setAction('quest');
    try { const result = await GenesisCapApi.evaluateQuest(questId); await refresh(); return { ok: result.status === 'QUALIFIED' || result.status === 'CLAIMED', message: result.status === 'QUALIFIED' ? 'Quest verified. Reward is ready to claim.' : result.reason ?? `Quest status: ${result.status}` }; }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Quest verification failed'; setError(message); return { ok: false, message }; }
    finally { setAction(null); }
  }, [refresh]);

  const claimQuest = useCallback(async (questId: string) => {
    setAction('quest');
    try { await GenesisCapApi.claimQuest(questId); await refresh(); return { ok: true, message: 'Simulated CAP reward recorded in the immutable source ledger.' }; }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Reward claim failed'; setError(message); return { ok: false, message }; }
    finally { setAction(null); }
  }, [refresh]);

  const registerReferral = useCallback(async (inviterCode: string) => {
    setAction('quest');
    try { await GenesisCapApi.registerReferral(inviterCode); await refresh(); return { ok: true, message: 'Referral recorded before qualification.' }; }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Referral registration failed'; setError(message); return { ok: false, message }; }
    finally { setAction(null); }
  }, [refresh]);

  const createPost = useCallback(async (body: string) => {
    const clean = body.trim();
    if (!clean || clean.length > 240) return false;
    setAction('social-post');
    try {
      const post = await GenesisCapApi.createSocialPost(clean);
      setMemberPosts((current) => [{ id: post.id, type: 'purchase_activity', body: post.body, createdAt: post.createdAt, local: true, reactions: 0, reacted: false }, ...current]);
      await refresh(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Post failed'); return false; }
    finally { setAction(null); }
  }, [refresh]);

  const toggleReaction = useCallback((postId: string) => {
    setMemberPosts((current) => current.map((post) => post.id === postId ? { ...post, reacted: !post.reacted, reactions: post.reactions + (post.reacted ? -1 : 1) } : post));
  }, []);

  const myTitles = useMemo(() => snapshot?.titles ?? [], [snapshot]);
  const value = useMemo<StoreValue>(() => ({ snapshot, journey, myTitles, isLoading, action, error, memberPosts, refresh, buyTitles, claimTitleCap, registerHumanClaim, evaluateQuest, claimQuest, registerReferral, createPost, toggleReaction }), [action, buyTitles, claimQuest, claimTitleCap, createPost, error, evaluateQuest, isLoading, journey, memberPosts, myTitles, refresh, registerHumanClaim, registerReferral, snapshot, toggleReaction]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useMvpStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useMvpStore must be used inside MvpStoreProvider');
  return value;
}

export { formatWldUnits as formatWld };
