import { useState, useReducer, useMemo, useContext, createContext, useEffect, useRef, useCallback } from "react";
import { isSupabaseConfigured, fetchDebates, syncAction, seedDebates,
  signUp, signIn, signOut, getSession, onAuthChange, fetchProfile, updateAvatar } from "./lib/supabase";
import { INIT_DEBATES } from "./data/seedDebates";
import {
  ThumbsUp, ThumbsDown, Heart, Flag, Bookmark, X, Menu, Search, Moon, Sun, Shield,
  MessageCircle, MessagesSquare, Clock, Lock, Share2, Link2, Sparkles, Flame, Trophy, Award, Medal,
  Target, BarChart3, TrendingUp, Megaphone, Lightbulb, ClipboardList, Users, Ban, Globe,
  ArrowLeft, ChevronUp, ChevronDown, CornerUpLeft, CornerDownRight, Image as ImageIcon,
  Sprout, Brain, Star, Crown, Cpu, Leaf, BookOpen, HeartPulse, Landmark, Clapperboard,
  Circle, CircleDot, CheckCircle2, AlertCircle, KeyRound, Hash,
} from "lucide-react";
import { TOPICS, BADGES, USER_REP, RANK_PERKS, REPORT_REASONS, ADMIN_PASSCODE, NEEDS_AUTH, STANCE, POINTS, PRED_AWARD } from "./data/constants";
import { getBadge, repOf, allBubbles, likesReceived, popularUsers, myUsage, computeMyRep, perkOf, fmt, ago, timeLeft, pct, getRelated, reducer, pointsForAction, popularTags, pickDailyDebate, isDecided, winnerSide } from "./lib/logic";
import { getDailyOverride } from "./lib/daily";
import {
  getPredictions, setPrediction as savePrediction, resolvePending, predictionStats,
  type PredSide, type PredRow, type PredStats,
} from "./lib/predictions";
import { AppContext } from "./context";
import {
  getStreak, getDayActivity, getBonusTotal, recordActivity, claimDailyBonus,
  activityKindFor, todayStr, DAILY_MISSIONS, DAILY_BONUS, missionsCleared, missionsDoneCount,
  type Streak, type DayActivity,
} from "./lib/retention";
import { AVATARS, Avatar } from "./avatars";
import { btnPrimary, btnGhost, cActBtn, labelStyle, menuItem, inputStyle, replyBtn } from "./styles";

import { Icn } from "./ui/Icn";
import {
  StanceBar, StancePicker, StanceBadge, UserBadge, StatusBadge, VoteHistoryGraph, AISummary, Thread, BubbleRow, BubbleContent, SplitComments, RelatedDebates, UserPage, DebateDetail, DebateCard, NewDebateModal, ReportModal, AdminPage, HeroBanner, SkeletonCard, Toast, AdminGateModal, AuthModal, LevelUpModal
} from "./components";

// ─── App ──────────────────────────────────────────────────────────
// 画面幅でモバイル判定するフック
function useIsMobile(breakpoint = 820) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = e => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function App() {
  const [state, rawDispatch] = useReducer(reducer, {
    debates: INIT_DEBATES, sort:"hot", activeTopic:null, activeDebate:null, showNew:false, search:"",
    activeUser:null, activeTag:null, reportTarget:null, reports:[], bannedUsers:[], activeAdmin:false
  });
  const { debates, sort, activeTopic, activeDebate, showNew, search, activeUser, activeTag, reportTarget, reports, bannedUsers, activeAdmin } = state;

  // 常に最新の state を参照できるよう ref に保持 (LIKE の +/- 判定などに使用)
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── 認証状態（メール＋パスワード / DBモードのみ） ──────────────
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // ローカルモード(DB未接続)では常にゲスト「あなた」として操作可能
  const isAuthed = isSupabaseConfigured ? !!session : true;
  const me = isSupabaseConfigured ? (profile?.username ?? null) : "あなた";
  const isAdminUser = isSupabaseConfigured ? !!profile?.is_admin : false;
  const authRef = useRef<{ isAuthed: boolean; open: () => void }>({ isAuthed: false, open: () => {} });
  authRef.current = { isAuthed, open: () => setAuthOpen(true) };
  const sessionRef = useRef<any>(null);
  sessionRef.current = session;

  // ── リテンション: ストリーク / デイリーミッション / ボーナスXP ──
  //  me/isAuthed を ref に保持し dispatch（useCallback）から最新値を参照
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0, lastActive: null, freezes: 1 });
  const [todayAct, setTodayAct] = useState<DayActivity>({ votes: 0, comments: 0, replies: 0, debates: 0, bonus: 0 });
  const [missionBonus, setMissionBonus] = useState(0); // ミッション累計ボーナス
  const [predStats, setPredStats] = useState<PredStats>({ predicted: 0, resolved: 0, correct: 0, rate: 0, streak: 0 });
  const [myPreds, setMyPreds] = useState<Record<number, PredRow>>({}); // 自分の予想（debateId→行）
  const bonusTotal = missionBonus + predStats.correct * PRED_AWARD; // ランクに加算する累計ボーナス
  const meRef = useRef<{ me: string | null; isAuthed: boolean }>({ me, isAuthed });
  meRef.current = { me, isAuthed };
  useEffect(() => {
    getStreak(me, isAuthed).then(setStreak);
    getDayActivity(me, isAuthed).then(setTodayAct);
    getBonusTotal(me, isAuthed).then(setMissionBonus);
    getPredictions(me, isAuthed).then(rows => {
      setMyPreds(Object.fromEntries(rows.map(r => [r.debateId, r])));
      setPredStats(predictionStats(rows));
    });
  }, [me, isAuthed]);

  // ── アバター（DBは profiles.avatar / ローカルは localStorage） ──
  const [localAvatar, setLocalAvatar] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("split-avatar") : null);
  const myAvatar = isSupabaseConfigured ? ((profile as any)?.avatar ?? null) : localAvatar;
  const setAvatar = useCallback((id: string | null) => {
    if (isSupabaseConfigured) {
      setProfile((p: any) => p ? { ...p, avatar: id } : p);
      const uid = sessionRef.current?.user?.id;
      if (uid) updateAvatar(uid, id);
    } else {
      setLocalAvatar(id);
      if (id) localStorage.setItem("split-avatar", id);
      else localStorage.removeItem("split-avatar");
    }
  }, []);

  // ── トースト通知 ────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastTimer = useRef<any>();
  const notify = useCallback((msg, kind = "info") => {
    setToast({ msg, kind, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  // アクションに応じたフィードバック文言（rawDispatch 前の state で判定）
  const feedbackFor = useCallback((action) => {
    const s = stateRef.current;
    if (action.type === "SET_STANCE") {
      const d = s.debates.find(x => x.id === action.id);
      if (!d || d.status === "closed") return;
      const next = d.userStance === action.stance ? null : action.stance;
      notify(next ? `「${STANCE[next].label}」に投票しました` : "投票を取り消しました", next ? next : "info");
    } else if (action.type === "ADD_COMMENT") notify("コメントを投稿しました", "pro");
    else if (action.type === "ADD_REPLY") notify("返信を投稿しました", "pro");
    else if (action.type === "ADD_DEBATE") notify("ディベートを作成しました", "pro");
    else if (action.type === "SAVE") {
      const d = s.debates.find(x => x.id === action.id);
      notify(d?.saved ? "保存を解除しました" : "保存しました");
    }
  }, [notify]);

  // DB 書き込みをミラーリングする dispatch ラッパー
  const dispatch = useCallback((action) => {
    // 投稿系アクションはログイン必須（未ログインなら認証モーダルを開く）
    if (NEEDS_AUTH.has(action.type) && !authRef.current.isAuthed) {
      authRef.current.open();
      notify("ログインが必要です", "con");
      return;
    }
    if (isSupabaseConfigured) {
      let toSync = action;
      if (action.type === "LIKE") {
        // トグル前の vote から delta を確定させる
        const d = stateRef.current.debates.find(x => x.id === action.debateId);
        const list = action.stance === "pro" ? d?.proComments : d?.conComments;
        const c = list?.find(x => x.id === action.commentId);
        const node = action.replyId != null ? c?.replies?.find(r => r.id === action.replyId) : c;
        toSync = { ...action, delta: node?.vote === 1 ? -1 : 1 };
      }
      syncAction(toSync);
    }
    // スコア獲得アクションは +Nポップを予約（ログイン/読込時の誤発火を防ぐ）
    const earned = pointsForAction(action.type);
    if (earned > 0) pendingXpRef.current = earned;
    // 毎日の活動を記録 → ストリーク更新（継続したらお祝い）
    const kind = activityKindFor(action.type);
    if (kind) {
      const { me: m, isAuthed: a } = meRef.current;
      recordActivity(m, a, kind).then(res => {
        setStreak(res.streak);
        setTodayAct(res.today);
        if (res.incremented && res.streak.current >= 2) notify(`🔥 ${res.streak.current}日連続！`, "pro");
      });
    }
    feedbackFor(action);
    rawDispatch(action);
  }, [feedbackFor, notify]);

  // 起動時: Supabase 設定済みなら DB から読み込み。空ならサンプルを投入。
  const [dbStatus, setDbStatus] = useState(isSupabaseConfigured ? "loading" : "local");
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    // DBが遅い/一時停止中でも「接続中」のまま固まらないよう、10秒でフォールバック。
    // タイムアウト時は state の初期サンプル(INIT_DEBATES)のまま閲覧可能にする。
    const timeout = new Promise<"__timeout__">(res => setTimeout(() => res("__timeout__"), 10000));
    (async () => {
      try {
        let rows: any = await Promise.race([fetchDebates(), timeout]);
        if (rows === "__timeout__") {
          if (alive) { setDbStatus("error"); console.warn("[db] fetchDebates timed out — showing sample data"); }
          return;
        }
        if (rows === null) { if (alive) setDbStatus("error"); return; }
        if (rows.length === 0) {
          // DB が空 → アプリ内サンプルを初回シード
          const ok = await Promise.race([seedDebates(INIT_DEBATES), timeout]);
          if (ok && ok !== "__timeout__") rows = await fetchDebates();
        }
        if (!alive) return;
        if (rows && rows.length) rawDispatch({ type:"HYDRATE", debates: rows });
        setDbStatus("connected");
      } catch {
        if (alive) setDbStatus("error");
      }
    })();
    return () => { alive = false; };
  }, []);

  // 認証セッションの監視（DBモードのみ）
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    const loadProfile = async (s) => {
      const p = s?.user ? await fetchProfile(s.user.id) : null;
      if (alive) setProfile(p);
    };
    // 初期セッション
    getSession().then(s => { if (!alive) return; setSession(s); loadProfile(s); });
    // セッション変化を監視
    //  ⚠️ onAuthStateChange のコールバック内で直接 await supabase 呼び出しをすると
    //     内部ロックでデッドロックする（プロフィール取得やDB読込が固まる）。
    //     そのため profile 取得は setTimeout でコールバックの外へ逃がす。
    const unsub = onAuthChange((s) => {
      if (!alive) return;
      setSession(s);
      setTimeout(() => { if (alive) loadProfile(s); }, 0);
    });
    return () => { alive = false; unsub(); };
  }, []);

  // 投稿/コメント/被いいねの内容スコア ＋ ミッション等のボーナスXP
  const contentRep = useMemo(() => computeMyRep(debates, me), [debates, me]);
  const myRep = contentRep + bonusTotal;
  // 自分が参加中（作成 or コメント/返信した）ディベート ＝ Slackのスレッド的な一覧
  const myDebates = useMemo(() => {
    if (!me) return [];
    const inIt = (c: any) => c.author === me || (c.replies || []).some((r: any) => r.author === me);
    return debates.filter(d => d.author === me || d.proComments.some(inIt) || d.conComments.some(inIt));
  }, [debates, me]);
  // activeDebate はスナップショット参照なので、常に最新の debates から引き直す
  const liveDebate = activeDebate ? (debates.find(d => d.id === activeDebate.id) || activeDebate) : null;

  // 共有リンク（#d=ID）で該当ディベートを開く（DB読込後に一度だけ）
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current) return;
    const m = window.location.hash.match(/^#d=(\d+)/);
    if (!m) { deepLinkDone.current = true; return; }
    const target = debates.find(x => String(x.id) === m[1]);
    if (target) {
      rawDispatch({ type:"SET_ACTIVE", debate: target });
      history.replaceState(null, "", window.location.pathname);
      deepLinkDone.current = true;
    }
  }, [debates]);

  const visible = debates
    .filter(d => !activeTopic || d.topicId===activeTopic)
    .filter(d => !activeTag || (d.tags||[]).includes(activeTag))
    .filter(d => { const q=search.toLowerCase(); return !q||d.title.toLowerCase().includes(q)||d.description.toLowerCase().includes(q)||(d.tags||[]).some(t=>t.toLowerCase().includes(q)); })
    .sort((a,b) => {
      // active が先、closed が後
      if (a.status !== b.status) return a.status === "closed" ? 1 : -1;
      if (sort==="hot") return (b.pro+b.con)-(a.pro+a.con);
      if (sort==="new") return b.createdAt-a.createdAt;
      if (sort==="closing") return a.deadline - b.deadline;
      return b.commentCount-a.commentCount;
    });

  const totalPro = debates.reduce((s,d)=>s+d.pro,0);
  const totalCon = debates.reduce((s,d)=>s+d.con,0);
  const { proP:gProP, conP:gConP } = pct(totalPro, totalCon);
  const pops = popularUsers(debates, 5);
  const popTags = useMemo(() => popularTags(debates, 12), [debates]);
  // 今日の論題（管理者指定を優先、無ければ勢いのある論題から日替わり自動選出）
  const [dailyOverride, setDailyOverride] = useState<number | null>(null);
  useEffect(() => { getDailyOverride().then(setDailyOverride); }, []);
  const dailyDebate = useMemo(() => pickDailyDebate(debates, todayStr(), dailyOverride), [debates, dailyOverride]);
  const myBadge = getBadge(myRep);
  const nextBadge = BADGES.find(b => b.min > myRep);

  // ── ゲーミフィケーション: +Nスコアのポップ & レベルアップ祝い ──
  const [xpPop, setXpPop] = useState<{ amount: number; id: number } | null>(null);
  const [levelUp, setLevelUp] = useState<any>(null);
  const pendingXpRef = useRef(0);
  const prevRepRef = useRef<number | null>(null);
  const prevTierRef = useRef<number>(0);
  const xpTimer = useRef<any>();
  useEffect(() => {
    const prev = prevRepRef.current;
    if (prev == null) { prevRepRef.current = myRep; prevTierRef.current = myBadge.tier; return; }
    if (myRep > prev && pendingXpRef.current > 0) {
      setXpPop({ amount: pendingXpRef.current, id: Date.now() });
      clearTimeout(xpTimer.current);
      xpTimer.current = setTimeout(() => setXpPop(null), 2600);
      if (myBadge.tier > prevTierRef.current) setLevelUp(myBadge);
    }
    pendingXpRef.current = 0;
    prevRepRef.current = myRep;
    prevTierRef.current = myBadge.tier;
  }, [myRep, myBadge.tier]);

  // ── デイリーミッション全達成 → 当日ボーナスを一度だけ付与 ──
  //  ボーナスは pendingXpRef 経由でランクに加算し、上のエフェクトが +XP ポップ/昇格を発火
  useEffect(() => {
    if (!me || todayAct.bonus > 0 || !missionsCleared(todayAct)) return;
    claimDailyBonus(me, isAuthed, DAILY_BONUS).then(res => {
      if (!res.claimed) return;
      setTodayAct(t => ({ ...t, bonus: res.amount }));
      pendingXpRef.current = res.amount;
      setMissionBonus(b => b + res.amount);
      notify(`🎯 本日のミッション達成！ +${res.amount} XP`, "pro");
    });
  }, [todayAct, me, isAuthed, notify]);

  // ── 予想バトル: 締切を過ぎた予想を判定して確定（結果を見に戻る引力）──
  const resolveAttemptRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!me || !debates.length) return;
    const byId = new Map(debates.map(d => [d.id, d]));
    const ready = Object.values(myPreds).filter(p =>
      !p.resolved && !resolveAttemptRef.current.has(p.debateId) && (() => { const d = byId.get(p.debateId); return d && isDecided(d); })());
    if (!ready.length) return;
    ready.forEach(p => resolveAttemptRef.current.add(p.debateId));
    resolvePending(me, isAuthed, debates).then(results => {
      if (!results.length) return;
      getPredictions(me, isAuthed).then(rows => {
        setMyPreds(Object.fromEntries(rows.map(r => [r.debateId, r])));
        const hits = results.filter(r => r.correct).length;
        if (hits > 0) pendingXpRef.current += hits * PRED_AWARD;
        setPredStats(predictionStats(rows)); // 的中数↑→bonusTotal↑→ +XPポップ発火
      });
      for (const r of results) {
        notify(r.correct ? `🎯 予想的中！「${r.title}」` : `予想は外れ…「${r.title}」`, r.correct ? "pro" : "con");
      }
    });
  }, [me, isAuthed, debates, myPreds, notify]);

  // 予想する/変更する（決着前のみ。楽観更新＋保存）
  const predict = useCallback((debateId: number, side: PredSide) => {
    const { me: m, isAuthed: a } = meRef.current;
    if (!m) { authRef.current.open(); notify("予想にはログインが必要です", "con"); return; }
    setMyPreds(prev => {
      const next = { ...prev, [debateId]: { debateId, side, resolved: false, correct: null, resolvedAt: null } };
      setPredStats(predictionStats(Object.values(next)));
      return next;
    });
    savePrediction(m, a, debateId, side).then(ok => { if (!ok) notify("予想を保存できませんでした", "con"); });
    notify(`予想を記録：${side === "pro" ? "賛成が多数" : "反対が多数"}`, side);
  }, [notify]);

  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAllMine, setShowAllMine] = useState(false); // 参加中の「もっと見る」
  // ナビゲーション時はドロワーを閉じる
  useEffect(() => { setDrawerOpen(false); }, [activeDebate, activeUser, activeAdmin, activeTopic]);

  // ── テーマ (ライト / ダーク) ──────────────────────────────
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem("split-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("split-theme", theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(t => (t === "dark" ? "light" : "dark")), []);

  // ── 管理者ロック（暫定）: URL に #admin でパスコード入力 → 解錠 ──
  //   ※ クライアント側の簡易ガード。実運用では Supabase Auth + ロール(RLS)へ置換。
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPrompt, setAdminPrompt] = useState(false);
  useEffect(() => {
    const check = () => { if (window.location.hash === "#admin") setAdminPrompt(true); };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  const submitAdminCode = (code) => {
    if (code === ADMIN_PASSCODE) {
      setAdminUnlocked(true); setAdminPrompt(false);
      if (window.location.hash === "#admin") history.replaceState(null, "", window.location.pathname);
      dispatch({ type:"SET_ADMIN", on:true });
      notify("管理者モードを解除しました");
    } else {
      notify("パスコードが違います", "con");
    }
  };

  // ── ヒーロー（初見向け説明）の表示状態 ──
  const [heroDismissed, setHeroDismissed] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("split-hero") === "closed");
  const dismissHero = () => { setHeroDismissed(true); localStorage.setItem("split-hero", "closed"); };

  const isLoading = dbStatus === "loading";
  const isHome = !activeAdmin && !activeUser && !liveDebate;
  // 管理者の可否: DBモードは profiles.is_admin、ローカルはパスコード解錠
  const adminAllowed = isSupabaseConfigured ? isAdminUser : adminUnlocked;

  return (
    <AppContext.Provider value={{ dispatch, debates, myRep, me, isAuthed, myAvatar, setAvatar, notify }}>
    <div style={{ fontFamily:"var(--font-body)", minHeight:"100vh", background:"var(--bg)", color:"var(--text)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap');
        /* 個性派グロテスク見出し ＋ モダン日本語ゴシック本文（目新しさ＋可読性） */
        :root {
          --font-head: "Bricolage Grotesque", "Zen Kaku Gothic New", system-ui, sans-serif;
          --font-body: "Zen Kaku Gothic New", system-ui, -apple-system, sans-serif;
          --bg: #f4f0e7; --surface: #fcfaf4; --surface-2: #efeadf; --surface-3: #e7e0d1;
          --border: #ddd6c6; --border-2: #c8c0ac;
          --text: #1c1917; --text-2: #44403a; --text-3: #6c655a; --text-4: #9b9384;
          --btn-active: #1c1917;
          --pro-bg: #e7edf6; --pro-light: #eef2f9; --con-bg: #f6e9e7; --con-light: #faf1ef;
          --rose-bg: #f6e9e8; --green-bg: #e5ecd9; --amber-bg: #f2ead0;
          --violet-1: #f1ead7; --violet-2: #f7f1e1; --violet-border: #ddd1b5;
        }
        :root[data-theme="dark"] {
          --bg: #17140e; --surface: #211d15; --surface-2: #15120c; --surface-3: #2c271d;
          --border: #393326; --border-2: #4d4634;
          --text: #efe9da; --text-2: #cabfa6; --text-3: #978d78; --text-4: #6f6857;
          --btn-active: #7c6a42;
          --pro-bg: rgba(96,138,214,.20); --pro-light: rgba(96,138,214,.12);
          --con-bg: rgba(205,92,82,.20); --con-light: rgba(205,92,82,.12);
          --rose-bg: rgba(205,92,82,.20); --green-bg: rgba(120,160,80,.20); --amber-bg: rgba(196,150,70,.20);
          --violet-1: rgba(180,150,90,.16); --violet-2: rgba(180,150,90,.10); --violet-border: rgba(160,135,80,.40);
        }
        html { color-scheme: light dark; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); font-family: var(--font-body); transition: background .25s; }
        /* 見出しは個性派グロテスク（太め・引き締め）で力強く */
        h1, h2, h3, h4, h5, h6, .wordmark { font-family: var(--font-head); letter-spacing: -0.02em; }
        h2 { letter-spacing: -0.03em; }
        ::-webkit-scrollbar { width: 7px; }
        ::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        textarea:focus, input:focus, select:focus { border-color: var(--text-3) !important; box-shadow: 0 0 0 2px var(--surface-3); outline: none; }
        @keyframes split-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        @keyframes split-toast-in { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes split-xp-pop { 0% { opacity: 0; transform: translate(-50%, 14px) scale(.7); } 12% { opacity: 1; transform: translate(-50%, 0) scale(1.12); } 22% { transform: translate(-50%, 0) scale(1); } 82% { opacity: 1; transform: translate(-50%, -8px); } 100% { opacity: 0; transform: translate(-50%, -34px); } }
        @keyframes split-pop-in { 0% { opacity: 0; transform: scale(.8); } 60% { transform: scale(1.04); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes split-badge-spin { 0% { transform: rotate(-12deg) scale(.6); opacity: 0; } 60% { transform: rotate(6deg) scale(1.15); opacity: 1; } 100% { transform: rotate(0) scale(1); opacity: 1; } }
      `}</style>

      <header style={{ position:"sticky", top:0, zIndex:100, background:"var(--surface)", borderBottom:"1px solid var(--border)" }}>
        <div style={{ maxWidth:1160, margin:"0 auto", height: isMobile ? "auto" : 56,
          display:"flex", alignItems:"center", padding: isMobile ? "10px 14px" : "0 24px",
          gap: isMobile ? 10 : 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          {isMobile && (
            <button onClick={()=>setDrawerOpen(true)} title="メニュー" aria-label="メニューを開く"
              style={{ background:"none", border:"1.5px solid var(--border)", borderRadius:10, width:38, height:38,
                cursor:"pointer", fontFamily:"inherit", flexShrink:0, color:"var(--text-2)", display:"inline-flex", alignItems:"center", justifyContent:"center" }}><Icn icon={Menu} size={20}/></button>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, cursor:"pointer" }}
            onClick={()=>dispatch({type:"SET_ACTIVE",debate:null})}>
            <div style={{ width:32, height:32, borderRadius:9, overflow:"hidden", display:"flex", flexShrink:0 }}>
              <div style={{ flex:1, background:STANCE.pro.bar, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ color:"#fff", fontWeight:900, fontSize:13 }}>S</span>
              </div>
              <div style={{ flex:1, background:STANCE.con.bar, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ color:"#fff", fontWeight:900, fontSize:13 }}>p</span>
              </div>
            </div>
            <span className="wordmark" style={{ fontWeight:700, fontSize:22, letterSpacing:-0.5, color:"var(--text)" }}>Split</span>
            {!isMobile && <span style={{ fontSize:10, background:STANCE.pro.bg, color:STANCE.pro.color, padding:"1px 7px", borderRadius:99, fontWeight:700 }}>β</span>}
            {(() => {
              const m = { local:["ローカル","var(--text-3)","var(--surface-3)"], loading:["接続中","#b45309","var(--amber-bg)"], connected:["接続済み","#16a34a","var(--green-bg)"], error:["接続エラー","#dc2626","#fee2e2"] }[dbStatus];
              return <span title="データベース接続状態" style={{ fontSize:10, background:m[2], color:m[1], padding:"1px 7px", borderRadius:99, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={Circle} size={7} fill="currentColor"/>{m[0]}</span>;
            })()}
          </div>
          {/* 検索窓は一覧（ホーム）でのみ表示。詳細等ではフィルタ先が見えず混乱するため */}
          {isHome ? (
            <div style={{ position:"relative", ...(isMobile ? { order:5, flexBasis:"100%" } : { flex:1, maxWidth:520 }) }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-4)", display:"inline-flex", pointerEvents:"none" }}><Icn icon={Search} size={15}/></span>
              <input value={search} onChange={e=>dispatch({type:"SET_SEARCH",q:e.target.value})}
                placeholder="ディベートを検索…" aria-label="ディベートを検索"
                style={{ width:"100%", padding:"8px 12px 8px 36px", border:"1px solid var(--border)", borderRadius:99, fontSize:14, fontFamily:"inherit", background:"var(--surface-2)", color:"var(--text)" }} />
            </div>
          ) : (
            !isMobile && <div style={{ flex:1 }} />
          )}
          <div style={{ display:"flex", gap: isMobile ? 8 : 10, flexShrink:0, alignItems:"center", marginLeft: isMobile ? "auto" : 0 }}>
            <button onClick={toggleTheme}
              title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              style={{ background:"none", color:"var(--text-2)",
                border:"1.5px solid var(--border)", borderRadius:99, width:38, height:38, cursor:"pointer", fontFamily:"inherit", flexShrink:0, display:"inline-flex", alignItems:"center", justifyContent:"center" }}><Icn icon={theme === "dark" ? Sun : Moon} size={18}/></button>
            {adminAllowed && (
              <button onClick={()=>dispatch({type:"SET_ADMIN",on:!activeAdmin})}
                title="管理者ダッシュボード" aria-label="管理者ダッシュボード"
                style={{ background: activeAdmin ? "var(--btn-active)" : "none", color: activeAdmin ? "#fff" : "var(--text-2)",
                  border:"1.5px solid var(--border)", borderRadius:99, width:38, height:38, cursor:"pointer", fontFamily:"inherit", flexShrink:0, display:"inline-flex", alignItems:"center", justifyContent:"center" }}><Icn icon={Shield} size={18}/></button>
            )}
            <button onClick={()=> isAuthed ? dispatch({type:"TOGGLE_NEW"}) : (setAuthOpen(true), notify("ログインが必要です","con"))}
              title={isAuthed ? undefined : "ディベート作成にはログインが必要です"}
              style={ isMobile ? { ...btnPrimary, padding:"9px 14px", flexShrink:0 } : btnPrimary }>{isMobile ? "＋作成" : "+ ディベート作成"}</button>
            {isAuthed ? (
              <div style={{ position:"relative", flexShrink:0 }}>
                <button onClick={()=>setUserMenuOpen(o=>!o)} title="アカウント" aria-label="アカウントメニュー"
                  style={{ width:34, height:34, borderRadius:50, border:"none", cursor:"pointer", padding:0, display:"flex", background:"none" }}>
                  <Avatar id={myAvatar} size={34} fallback={me ? me[0].toUpperCase() : "?"} />
                </button>
                {userMenuOpen && (
                  <>
                    <div onClick={()=>setUserMenuOpen(false)} style={{ position:"fixed", inset:0, zIndex:120 }} />
                    <div style={{ position:"absolute", right:0, top:42, zIndex:121, minWidth:180, background:"var(--surface)",
                      border:"1px solid var(--border)", borderRadius:12, boxShadow:"0 8px 28px rgba(0,0,0,.16)", padding:6 }}>
                      <div style={{ padding:"8px 12px", borderBottom:"1px solid var(--border)", marginBottom:4 }}>
                        <p style={{ fontSize:12, color:"var(--text-4)" }}>ログイン中</p>
                        <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis" }}>@{me}</p>
                      </div>
                      <button onClick={()=>{ setUserMenuOpen(false); dispatch({type:"SET_USER",author:me}); }}
                        style={menuItem}><Icn icon={Sprout} size={15}/> マイページ</button>
                      {isSupabaseConfigured && (
                        <button onClick={async()=>{ setUserMenuOpen(false); await signOut(); notify("ログアウトしました"); }}
                          style={{ ...menuItem, color:STANCE.con.color }}><Icn icon={X} size={15}/> ログアウト</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button onClick={()=>setAuthOpen(true)}
                style={{ ...btnGhost, padding: isMobile ? "8px 14px" : "9px 18px", flexShrink:0 }}>ログイン</button>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth:1160, margin:"0 auto", padding: isMobile ? "16px 14px 40px" : "28px 24px",
        display:"flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 24 }}>
        {/* Left sidebar: PCはサイドバー / スマホはハンバーガーで開くドロワー */}
        {(!isMobile || drawerOpen) && (<>
          {isMobile && <div onClick={()=>setDrawerOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:150 }} />}
          <aside style={ isMobile
            ? { position:"fixed", top:0, left:0, bottom:0, width:280, maxWidth:"82vw", background:"var(--bg)", zIndex:151, padding:"16px 16px 40px", overflowY:"auto", boxShadow:"2px 0 24px rgba(0,0,0,.12)" }
            : { width:210, flexShrink:0, position:"sticky", top:76, alignSelf:"flex-start" } }>
          {isMobile && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontWeight:800, fontSize:16, color:"var(--text)" }}>メニュー</span>
              <button title="閉じる" onClick={()=>setDrawerOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-3)", display:"inline-flex" }}><Icn icon={X} size={20}/></button>
            </div>
          )}
          {/* 参加中のディベート（ログイン時のみ） */}
          {me && (
            <div style={{ marginBottom:18 }}>
              <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", letterSpacing:1, textTransform:"uppercase", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                <Icn icon={MessagesSquare} size={13}/> 参加中
              </p>
              {myDebates.length === 0 ? (
                <p style={{ fontSize:12, color:"var(--text-4)", padding:"0 4px 4px", lineHeight:1.6 }}>まだありません。コメントすると、ここにスレッドが並びます。</p>
              ) : (() => {
                const limit = isMobile ? 3 : 5;
                const shown = showAllMine ? myDebates : myDebates.slice(0, limit);
                const extra = myDebates.length - limit;
                return (<>
                  {shown.map(d => {
                    const isActive = liveDebate?.id === d.id;
                    return (
                      <button key={d.id} onClick={()=>dispatch({type:"SET_ACTIVE",debate:d})}
                        title={d.title}
                        style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"7px 10px", borderRadius:8, border:"none",
                          background: isActive ? STANCE.pro.bg : "none", color: isActive ? STANCE.pro.color : "var(--text-2)",
                          cursor:"pointer", textAlign:"left", fontFamily:"inherit", marginBottom:2, transition:"background .1s" }}>
                        <Icn icon={MessageCircle} size={14} style={{ flexShrink:0, color: isActive ? STANCE.pro.color : "var(--text-4)" }}/>
                        <span style={{ flex:1, minWidth:0, fontSize:12.5, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.title}</span>
                      </button>
                    );
                  })}
                  {extra > 0 && (
                    <button onClick={()=>setShowAllMine(v=>!v)}
                      style={{ display:"flex", alignItems:"center", gap:5, width:"100%", padding:"6px 10px", borderRadius:8, border:"none",
                        background:"none", color:STANCE.pro.color, fontSize:12, fontWeight:700, cursor:"pointer", textAlign:"left", fontFamily:"inherit", marginTop:2 }}>
                      <Icn icon={showAllMine ? ChevronUp : ChevronDown} size={14}/>
                      {showAllMine ? "閉じる" : `もっと見る（+${extra}）`}
                    </button>
                  )}
                </>);
              })()}
            </div>
          )}

          <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>トピック</p>
          {[{id:null,name:"すべて",Icon:Globe,members:""}, ...TOPICS].map((t: any)=>(
            <button key={t.id??"all"} onClick={()=>dispatch({type:"SET_TOPIC",id:t.id})}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 10px", borderRadius:8, border:"none",
                background:activeTopic===t.id?STANCE.pro.bg:"none", color:activeTopic===t.id?STANCE.pro.color:"var(--text-2)",
                fontWeight:activeTopic===t.id?700:400, fontSize:14, cursor:"pointer", textAlign:"left", fontFamily:"inherit", marginBottom:2, transition:"background .1s" }}>
              <Icn icon={t.Icon} size={16}/><span style={{flex:1}}>{t.name}</span>
              {t.members && <span style={{ fontSize:11, color:"var(--text-4)" }}>{t.members}</span>}
            </button>
          ))}

          {/* ストリーク（連続記録）— 毎日開く習慣づけ */}
          <div style={{ marginTop:20, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", marginBottom:10, letterSpacing:0.5, textTransform:"uppercase" }}>連続記録</p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <Icn icon={Flame} size={30} fill={streak.current>0?"#f97316":"none"} style={{ color: streak.current>0 ? "#f97316" : "var(--text-4)" }} />
              <div>
                <p style={{ fontSize:26, fontWeight:800, color:"var(--text)", lineHeight:1 }}>
                  {streak.current}<span style={{ fontSize:13, fontWeight:700, color:"var(--text-3)", marginLeft:2 }}>日</span>
                </p>
                <p style={{ fontSize:10, color:"var(--text-4)", marginTop:3 }}>最長 {streak.longest}日{streak.freezes>0 && me ? ` ・ 防御 ${streak.freezes}` : ""}</p>
              </div>
            </div>
            {!me ? (
              <p style={{ fontSize:10, color:"var(--text-4)", marginTop:10 }}>ログインで連続記録が貯まります</p>
            ) : streak.lastActive === todayStr() ? (
              <p style={{ fontSize:10, color:"#16a34a", marginTop:10, fontWeight:700 }}>✓ 今日は記録済み</p>
            ) : (
              <p style={{ fontSize:10, color:"#f97316", marginTop:10, fontWeight:700 }}>今日はまだ。1アクションで継続！</p>
            )}
          </div>

          {/* 今日のミッション — 毎朝開く理由 */}
          <div style={{ marginTop:14, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", letterSpacing:0.5, textTransform:"uppercase" }}>今日のミッション</p>
              <span style={{ fontSize:11, fontWeight:800, color: missionsCleared(todayAct) ? "#16a34a" : "var(--text-3)" }}>{missionsDoneCount(todayAct)}/{DAILY_MISSIONS.length}</span>
            </div>
            {!me ? (
              <p style={{ fontSize:10, color:"var(--text-4)" }}>ログインで今日のミッションに挑戦</p>
            ) : (
              <>
                {DAILY_MISSIONS.map(m => {
                  const done = m.done(todayAct);
                  return (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, marginBottom:7, color: done ? "var(--text-4)" : "var(--text-2)" }}>
                      <Icn icon={done ? CheckCircle2 : Circle} size={15} style={{ color: done ? "#16a34a" : "var(--text-4)" }} />
                      <span style={{ flex:1, textDecoration: done ? "line-through" : "none" }}>{m.label}</span>
                    </div>
                  );
                })}
                <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid var(--surface-3)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:11, color:"var(--text-3)" }}>全達成ボーナス</span>
                  {todayAct.bonus > 0
                    ? <span style={{ fontSize:11, fontWeight:800, color:"#16a34a" }}>✓ +{DAILY_BONUS} 獲得</span>
                    : <span style={{ fontSize:11, fontWeight:800, color:"#f59e0b" }}>+{DAILY_BONUS} XP</span>}
                </div>
              </>
            )}
          </div>

          {/* User reputation card */}
          <div style={{ marginTop:14, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", marginBottom:10, letterSpacing:0.5, textTransform:"uppercase" }}>あなたのランク</p>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <Icn icon={myBadge.Icon} size={22} style={{ color:myBadge.color }}/>
              <div>
                <p style={{ fontSize:13, fontWeight:800, color:myBadge.color, display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:10, fontWeight:800, color:"#fff", background:myBadge.color, borderRadius:6, padding:"1px 6px" }}>Lv.{myBadge.tier}</span>
                  {myBadge.label}
                </p>
                <p style={{ fontSize:11, color:"var(--text-4)" }}>スコア {fmt(myRep)}</p>
              </div>
            </div>
            {nextBadge && (
              <>
                <div style={{ width:"100%", height:6, background:"var(--surface-3)", borderRadius:99, overflow:"hidden", marginBottom:4 }}>
                  <div style={{ width:`${Math.min(100, Math.max(0, ((myRep - myBadge.min) / (nextBadge.min - myBadge.min)) * 100))}%`, height:"100%", background:myBadge.color, transition:"width .5s" }} />
                </div>
                <p style={{ fontSize:10, color:"var(--text-4)" }}>
                  あと <strong style={{ color:nextBadge.color }}>{nextBadge.min - myRep}</strong> で Lv.{nextBadge.tier}「{nextBadge.label}」
                </p>
              </>
            )}
            <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--surface-3)" }}>
              <p style={{ fontSize:10, fontWeight:700, color:"var(--text-4)", marginBottom:6 }}>スコアの貯め方</p>
              {[[ThumbsUp,"ディベート投稿",POINTS.debate,STANCE.pro.color],[MessageCircle,"コメント・返信",POINTS.comment,"var(--text-2)"],[Heart,"いいねされる",POINTS.like,"#e11d48"]].map(([ic,label,pt,col]:any)=>(
                <div key={label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"var(--text-3)", marginBottom:4 }}>
                  <Icn icon={ic} size={12} style={{ color:col, flexShrink:0 }}/>
                  <span style={{ flex:1 }}>{label}</span>
                  <span style={{ fontWeight:800, color:"#f59e0b" }}>+{pt}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid var(--surface-3)", fontSize:10, color:"var(--text-4)", lineHeight:1.7 }}>
              <div>今月の作成: <strong style={{ color:"var(--text-2)" }}>{myUsage(debates, me).posts}/{perkOf(myRep).debates === 9999 ? "∞" : perkOf(myRep).debates}</strong></div>
              <div>今月のコメント: <strong style={{ color:"var(--text-2)" }}>{myUsage(debates, me).comments}/{perkOf(myRep).comments === 9999 ? "∞" : perkOf(myRep).comments}</strong></div>
            </div>
          </div>

          {/* 成績: 予想的中率 ＋ 良い議論（被いいね）の2軸 */}
          <div style={{ marginTop:14, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", marginBottom:10, letterSpacing:0.5, textTransform:"uppercase" }}>成績</p>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1, textAlign:"center", padding:"8px 4px", background:"var(--surface-2)", borderRadius:10 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4, fontSize:20, fontWeight:800, color:"#b45309" }}>
                  <Icn icon={Trophy} size={15}/> {predStats.resolved ? Math.round(predStats.rate * 100) : "—"}{predStats.resolved ? "%" : ""}
                </div>
                <p style={{ fontSize:10, color:"var(--text-4)", marginTop:3 }}>予想的中率{predStats.resolved ? `（${predStats.correct}/${predStats.resolved}）` : ""}</p>
              </div>
              <div style={{ flex:1, textAlign:"center", padding:"8px 4px", background:"var(--surface-2)", borderRadius:10 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4, fontSize:20, fontWeight:800, color:"#e11d48" }}>
                  <Icn icon={Heart} size={15}/> {fmt(likesReceived(me, debates))}
                </div>
                <p style={{ fontSize:10, color:"var(--text-4)", marginTop:3 }}>良い議論（被いいね）</p>
              </div>
            </div>
            {predStats.streak >= 2 && (
              <p style={{ fontSize:11, color:"#16a34a", fontWeight:700, marginTop:9, display:"flex", alignItems:"center", gap:5 }}>
                <Icn icon={Flame} size={13}/> 予想{predStats.streak}連勝中
              </p>
            )}
          </div>

          <div style={{ marginTop:14, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", marginBottom:10, letterSpacing:0.5, textTransform:"uppercase" }}>凡例</p>
            {["pro","con"].map(s=>(
              <div key={s} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:s==="pro"?8:0 }}>
                <div style={{ width:28, height:6, borderRadius:99, background:STANCE[s].bar }} />
                <span style={{ fontSize:13, color:STANCE[s].color, fontWeight:700, display:"inline-flex", alignItems:"center", gap:5 }}><Icn icon={STANCE[s].Icon} size={13}/> {STANCE[s].label}</span>
              </div>
            ))}
          </div>
        </aside>
        </>)}

        <main style={{ flex:1, minWidth:0 }}>
          {activeAdmin && adminAllowed ? (
            <AdminPage debates={debates} reports={reports} bannedUsers={bannedUsers} dispatch={dispatch} />
          ) : activeUser ? (
            <UserPage author={activeUser} dispatch={dispatch} />
          ) : liveDebate ? (
            <DebateDetail d={liveDebate} allDebates={debates} dispatch={dispatch} myPred={myPreds[liveDebate.id]} onPredict={predict} />
          ) : (
            <>
              {!heroDismissed && !activeTag && !search && (
                <HeroBanner onDismiss={dismissHero} />
              )}
              {!activeTag && !search && dailyDebate && (() => {
                const { proP, conP } = pct(dailyDebate.pro, dailyDebate.con);
                const dateLabel = new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
                return (
                  <button onClick={()=>dispatch({type:"SET_ACTIVE",debate:dailyDebate})}
                    style={{ display:"block", width:"100%", textAlign:"left", cursor:"pointer", fontFamily:"inherit",
                      background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:0, marginBottom:16, overflow:"hidden" }}>
                    <div style={{ height:4, display:"flex" }}>
                      <div style={{ width:`${proP}%`, background:STANCE.pro.bar }} />
                      <div style={{ flex:1, background:STANCE.con.bar }} />
                    </div>
                    <div style={{ padding:"14px 18px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9 }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:800, letterSpacing:0.5,
                          color:"#b45309", background:"var(--amber-bg)", borderRadius:99, padding:"3px 10px" }}>
                          <Icn icon={Sparkles} size={12}/> 今日の論題
                        </span>
                        <span style={{ fontSize:12, color:"var(--text-4)" }}>{dateLabel}</span>
                      </div>
                      <h3 style={{ fontSize:21, fontWeight:800, color:"var(--text)", lineHeight:1.35, marginBottom:11, letterSpacing:-0.3 }}>{dailyDebate.title}</h3>
                      <div style={{ display:"flex", alignItems:"center", gap:14, fontSize:12.5, color:"var(--text-3)" }}>
                        <span style={{ color:STANCE.pro.color, fontWeight:700 }}>賛成 {proP}%</span>
                        <span style={{ color:STANCE.con.color, fontWeight:700 }}>反対 {conP}%</span>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={MessageCircle} size={13}/> {fmt(dailyDebate.commentCount)}</span>
                        <span style={{ marginLeft:"auto", color:STANCE.pro.color, fontWeight:700 }}>意見を見る →</span>
                      </div>
                    </div>
                  </button>
                );
              })()}
              {activeTag && (
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <span style={{ fontSize:13, color:"var(--text-3)" }}>タグで絞り込み中:</span>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:STANCE.pro.bg,
                    color:STANCE.pro.color, border:`1px solid ${STANCE.pro.border}`, borderRadius:99,
                    padding:"3px 12px", fontSize:13, fontWeight:700 }}>
                    #{activeTag}
                    <button title="絞り込み解除" onClick={()=>dispatch({type:"SET_TAG",tag:null})}
                      style={{ background:"none", border:"none", cursor:"pointer", color:STANCE.pro.color, padding:0, display:"inline-flex" }}><Icn icon={X} size={14}/></button>
                  </span>
                </div>
              )}
              <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 14px",
                display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {([["hot",Flame,"人気"],["new",Sparkles,"新着"],["closing",Clock,"締切間近"],["discussion",MessageCircle,"議論中"]] as [string, any, string][]).map(([s,icon,l])=>(
                    <button key={s} onClick={()=>dispatch({type:"SET_SORT",sort:s})}
                      style={{ padding:"6px 12px", borderRadius:99, border:"none",
                        background:sort===s?STANCE.pro.bg:"none", color:sort===s?STANCE.pro.color:"var(--text-3)",
                        fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit", transition:"all .1s", display:"inline-flex", alignItems:"center", gap:5 }}><Icn icon={icon} size={14}/>{l}</button>
                  ))}
                </div>
                <span style={{ fontSize:13, color:"var(--text-4)" }}>{visible.length} 件のディベート</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {isLoading ? (
                  [0,1,2].map(i => <SkeletonCard key={i} />)
                ) : (
                  <>
                    {visible.length===0 && <div style={{ textAlign:"center", padding:"48px", color:"var(--text-4)", fontSize:15 }}>ディベートが見つかりません</div>}
                    {visible.map(d=><DebateCard key={d.id} d={d} dispatch={dispatch}/>)}
                  </>
                )}
              </div>
            </>
          )}
        </main>

        {!activeDebate && !activeUser && !activeAdmin && (
          <aside style={ isMobile
            ? { width:"100%", display:"flex", flexDirection:"column", gap:16 }
            : { width:270, flexShrink:0, position:"sticky", top:76, alignSelf:"flex-start", display:"flex", flexDirection:"column", gap:16 } }>
            {/* 人気ユーザー */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
              <h4 style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}><Icn icon={Flame} size={16}/> 人気ユーザー</h4>
              {pops.map((p, i) => {
                const medalColor = ["#f59e0b","#9ca3af","#b45309"][i];
                const b = getBadge(repOf(p.author));
                return (
                  <button key={p.author} onClick={()=>dispatch({type:"SET_USER",author:p.author})}
                    style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"6px 4px",
                      background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                    <span style={{ width:20, textAlign:"center", flexShrink:0, display:"inline-flex", justifyContent:"center" }}>
                      {medalColor ? <Icn icon={Medal} size={16} style={{ color:medalColor }}/> : <span style={{ fontSize:12, color:"var(--text-4)", fontWeight:700 }}>{i+1}</span>}
                    </span>
                    <span style={{ fontSize:13, fontWeight:700, color:"var(--text)", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>@{p.author}</span>
                    <Icn icon={b.Icon} size={13} style={{ color:b.color }}/>
                    <span style={{ fontSize:11, color:"#e11d48", fontWeight:700, flexShrink:0, display:"inline-flex", alignItems:"center", gap:3 }}><Icn icon={Heart} size={12} fill="currentColor"/> {fmt(p.likes)}</span>
                  </button>
                );
              })}
            </div>

            {/* 人気のタグ（ボトムアップの分類） */}
            {popTags.length > 0 && (
              <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
                <h4 style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}><Icn icon={Hash} size={16}/> 人気のタグ</h4>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {popTags.map(({tag,count}) => {
                    const on = activeTag === tag;
                    return (
                      <button key={tag} onClick={()=>dispatch({type:"SET_TAG",tag: on ? null : tag})}
                        title={`${count}件のディベート`}
                        style={{ display:"inline-flex", alignItems:"center", gap:4, borderRadius:99, padding:"3px 10px",
                          fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                          border:`1px solid ${on ? STANCE.pro.border : "var(--border)"}`,
                          background: on ? STANCE.pro.bg : "var(--surface-2)", color: on ? STANCE.pro.color : "var(--text-3)" }}>
                        #{tag}<span style={{ fontSize:10, opacity:0.7, fontWeight:600 }}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
              <h4 style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}><Icn icon={Sparkles} size={16}/> Splitとは</h4>
              {([[Target,"テーマを選ぶ","賛否を問えるトピックを探す"],[ThumbsUp,"立場を表明","賛成か反対かを明確にする"],[MessageCircle,"根拠を語る","なぜそう思うかをコメントで"],[BarChart3,"分布を見る","リアルタイムで賛否が動く"],[Trophy,"決着を見る","期間終了で勝敗が確定"]] as [any, string, string][]).map(([icon,t,desc])=>(
                <div key={t} style={{ display:"flex", gap:10, marginBottom:10, alignItems:"flex-start" }}>
                  <Icn icon={icon} size={16} style={{ marginTop:2, color:"var(--text-3)" }}/>
                  <div><p style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{t}</p><p style={{ fontSize:12, color:"var(--text-3)" }}>{desc}</p></div>
                </div>
              ))}
            </div>

            {/* Badge guide */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
              <h4 style={{ fontWeight:700, fontSize:14, marginBottom:10, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}><Icn icon={Award} size={16}/> ランク一覧</h4>
              {BADGES.map(b => {
                const reached = myRep >= b.min;
                const current = myBadge.id === b.id;
                return (
                  <div key={b.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 6px", borderRadius:8,
                    background: current ? b.color + "1a" : "none", opacity: reached ? 1 : 0.5 }}>
                    <span style={{ fontSize:10, fontWeight:800, color:"#fff", background:b.color, borderRadius:5, padding:"1px 5px", flexShrink:0 }}>Lv.{b.tier}</span>
                    <Icn icon={b.Icon} size={14} style={{ color:b.color }}/>
                    <span style={{ fontSize:12, fontWeight:700, color:b.color }}>{b.label}</span>
                    <span style={{ fontSize:11, color:"var(--text-4)", marginLeft:"auto" }}>{b.min}+</span>
                  </div>
                );
              })}
            </div>

            <div style={{ border:"1px solid var(--border)", borderRadius:12, overflow:"hidden" }}>
              <div style={{ display:"flex", height:6 }}>
                <div style={{ flex:totalPro, background:STANCE.pro.bar }} />
                <div style={{ flex:totalCon, background:STANCE.con.bar }} />
              </div>
              <div style={{ padding:16 }}>
                <h4 style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}><Icn icon={BarChart3} size={16}/> 全体の傾向</h4>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:10 }}>
                  <span style={{ color:STANCE.pro.color, fontWeight:700, display:"inline-flex", alignItems:"center", gap:5 }}><Icn icon={ThumbsUp} size={13}/> 賛成 {gProP}%</span>
                  <span style={{ color:STANCE.con.color, fontWeight:700, display:"inline-flex", alignItems:"center", gap:5 }}><Icn icon={ThumbsDown} size={13}/> 反対 {gConP}%</span>
                </div>
                <StanceBar pro={totalPro} con={totalCon} height={10} />
                <p style={{ fontSize:12, color:"var(--text-4)", marginTop:8 }}>全 {debates.length} ディベートの合計</p>
              </div>
            </div>
          </aside>
        )}
      </div>
      {showNew && <NewDebateModal dispatch={dispatch} />}
      {reportTarget && <ReportModal target={reportTarget} dispatch={dispatch} />}
      {adminPrompt && <AdminGateModal onSubmit={submitAdminCode} onClose={()=>{ setAdminPrompt(false); if (window.location.hash === "#admin") history.replaceState(null,"",window.location.pathname); }} />}
      {authOpen && <AuthModal onClose={()=>setAuthOpen(false)} notify={notify} />}
      {toast && <Toast toast={toast} />}
      {xpPop && (
        <div key={xpPop.id} aria-hidden="true"
          style={{ position:"fixed", left:"50%", bottom:96, zIndex:401, transform:"translateX(-50%)",
            display:"flex", alignItems:"center", gap:6, background:"linear-gradient(135deg,#f59e0b,#f97316)",
            color:"#fff", fontWeight:900, fontSize:18, padding:"8px 18px", borderRadius:99,
            boxShadow:"0 8px 28px rgba(245,158,11,.45)", animation:"split-xp-pop 2.6s ease forwards", pointerEvents:"none" }}>
          <Icn icon={Sparkles} size={18}/> +{xpPop.amount} スコア
        </div>
      )}
      {levelUp && <LevelUpModal badge={levelUp} onClose={()=>setLevelUp(null)} />}
    </div>
    </AppContext.Provider>
  );
}
