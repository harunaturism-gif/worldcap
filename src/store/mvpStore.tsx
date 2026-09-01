/* eslint-disable react-refresh/only-export-components -- provider and typed hook intentionally colocated */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSession } from '../domains/identity/types';
import { EconomyApi, formatWldUnits, type ActivityDto, type EconomySnapshot, type ScratchCompletionDto, type TitleDto } from '../services/economyApi';

interface MemberPost extends ActivityDto { local: true; reactions: number; reacted: boolean }

interface StoreValue {
  snapshot: EconomySnapshot | null;
  myTitles: TitleDto[];
  isLoading: boolean;
  action: 'purchase' | 'scratch' | null;
  error: string | null;
  lastReveal: ScratchCompletionDto | null;
  memberPosts: MemberPost[];
  refresh: () => Promise<void>;
  buyTitles: (quantity: number, tierId: string) => Promise<{ ok: boolean; message: string }>;
  prepareScratch: (titleId: string) => Promise<ScratchCompletionDto | null>;
  showReveal: (outcome: ScratchCompletionDto) => void;
  clearLastReveal: () => void;
  createPost: (body: string) => boolean;
  toggleReaction: (postId: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function MvpStoreProvider({ children }: { session: AppSession; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<EconomySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<'purchase' | 'scratch' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastReveal, setLastReveal] = useState<ScratchCompletionDto | null>(null);
  const [memberPosts, setMemberPosts] = useState<MemberPost[]>([]);

  const refresh = useCallback(async () => {
    try { setSnapshot(await EconomyApi.snapshot()); setError(null); }
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
          return { ok: true, message: 'Payment is still finalizing. WorldCAP will reconcile it automatically without issuing twice.' };
        }
        await refresh();
      return { ok: true, message: `${completion.titles.length} verified title${completion.titles.length === 1 ? '' : 's'} issued.` };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Purchase failed';
      setError(message);
      return { ok: false, message };
    } finally { setAction(null); }
  }, [refresh]);

  const prepareScratch = useCallback(async (titleId: string) => {
    setAction('scratch');
    try {
      const outcome = await EconomyApi.reveal(titleId);
      return outcome;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scratch reveal failed');
      return null;
    } finally { setAction(null); }
  }, []);

  const showReveal = useCallback((outcome: ScratchCompletionDto) => {
    setLastReveal(outcome);
    void refresh();
  }, [refresh]);

  const createPost = useCallback((body: string) => {
    const clean = body.trim();
    if (!clean || clean.length > 240) return false;
    setMemberPosts((current) => [{ id: crypto.randomUUID(), type: 'purchase_activity', body: clean, createdAt: new Date().toISOString(), local: true, reactions: 0, reacted: false }, ...current]);
    return true;
  }, []);

  const toggleReaction = useCallback((postId: string) => {
    setMemberPosts((current) => current.map((post) => post.id === postId ? { ...post, reacted: !post.reacted, reactions: post.reactions + (post.reacted ? -1 : 1) } : post));
  }, []);

  const myTitles = useMemo(() => snapshot?.titles ?? [], [snapshot]);
  const value = useMemo<StoreValue>(() => ({ snapshot, myTitles, isLoading, action, error, lastReveal, memberPosts, refresh, buyTitles, prepareScratch, showReveal, clearLastReveal: () => setLastReveal(null), createPost, toggleReaction }), [action, buyTitles, createPost, error, isLoading, lastReveal, memberPosts, myTitles, prepareScratch, refresh, showReveal, snapshot, toggleReaction]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useMvpStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useMvpStore must be used inside MvpStoreProvider');
  return value;
}

export { formatWldUnits as formatWld };
