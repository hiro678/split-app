// プレゼンテーション層コンポーネント一式
import { useState, useContext, useMemo, useRef, useEffect } from "react";
import { Icn, ThumbsUp, ThumbsDown, Heart, Flag, Bookmark, X, Shield, MessageCircle, Clock, Lock, Share2, Link2, Sparkles, Flame, Trophy, Target, BarChart3, TrendingUp, Megaphone, Lightbulb, ClipboardList, Users, Ban, ArrowLeft, ChevronUp, ChevronDown, CornerUpLeft, CornerDownRight, Image as ImageIcon, Circle, CircleDot, CheckCircle2, AlertCircle, KeyRound, PenLine, Search, Bell } from "../ui/Icn";
import { STANCE, TOPICS, REPORT_REASONS, PRED_AWARD } from "../data/constants";
import { getBadge, repOf, allBubbles, likesReceived, popularUsers, myUsage, perkOf, fmt, ago, timeLeft, pct, getRelated, suggestStanceLabels, pickDailyDebate, isDecided, winnerSide } from "../lib/logic";
import { getDailyOverride, setDailyOverride } from "../lib/daily";
import { todayStr } from "../lib/retention";
import { type Notif, getSeen, markSeen } from "../lib/notifications";
import { AppContext } from "../context";
import { btnPrimary, btnGhost, cActBtn, labelStyle, inputStyle, replyBtn } from "../styles";
import { signUp, signIn } from "../lib/supabase";
import { validateUsername } from "../lib/moderation";
import { useTypingGuard } from "../lib/integrity";
import { AVATARS, Avatar } from "../avatars";

// ─── メンション（@username） ──────────────────────────────────────
const MENTION_RE = /@([A-Za-z0-9_]+)/g;

// メンション候補となる既知ユーザー名（投稿者・コメント者から重複排除）
function mentionableUsers(debates: any[]): string[] {
  const set = new Set<string>();
  for (const d of debates) {
    if (d.author) set.add(d.author);
    for (const b of allBubbles([d])) if (b.author) set.add(b.author);
  }
  return [...set];
}

// 本文中の @username をクリック可能なリンクとして描画
// 本文中のURLをリンク化（出典・ソース用）。新しいタブで開く。
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
function linkifyText(text: string, keyPrefix: string) {
  const nodes: any[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const url = m[0];
    nodes.push(
      <a key={`${keyPrefix}u${i++}`} href={url} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{ color: STANCE.pro.color, fontWeight: 600, wordBreak: "break-all", textDecorationThickness: 1 }}>
        {url}
      </a>
    );
    last = m.index + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderBody(text: string, dispatch: any) {
  const nodes: any[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text))) {
    if (m.index > last) nodes.push(...linkifyText(text.slice(last, m.index), `s${i}`));
    const name = m[1];
    nodes.push(
      <button key={`m${i++}`} onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_USER", author: name }); }}
        style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer",
          fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit", color: STANCE.pro.color, fontWeight: 700 }}>
        @{name}
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(...linkifyText(text.slice(last), "tail"));
  return nodes;
}

// 入力中の本文を描画（@username だけ青く）。textarea 背面のオーバーレイ用。
function highlightMentions(text: string) {
  const nodes: any[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(<span key={`h${i++}`} style={{ color: STANCE.pro.color, fontWeight: 700 }}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

// 候補サジェスト付きテキストエリア（@入力でユーザー名を補完＋入力中も @ を青表示）
export function MentionTextarea({ value, onChange, users = [], onKeyDown, style, placeholder, ...rest }: any) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);

  const matches = useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    return (users as string[]).filter(u => u && /^[A-Za-z0-9_]+$/.test(u) && u.toLowerCase().includes(q)).slice(0, 6);
  }, [open, query, users]);

  const detect = (val: string, caret: number) => {
    const before = val.slice(0, caret);
    const m = before.match(/@([A-Za-z0-9_]*)$/);
    if (m) { setOpen(true); setQuery(m[1]); setIdx(0); } else setOpen(false);
  };

  const handleChange = (e: any) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); };

  const pick = (name: string) => {
    const el = ref.current; if (!el) return;
    const caret = el.selectionStart;
    const before = value.slice(0, caret);
    const m = before.match(/@([A-Za-z0-9_]*)$/);
    if (!m) return;
    const start = before.length - m[0].length;
    const newVal = value.slice(0, start) + "@" + name + " " + value.slice(caret);
    onChange(newVal);
    setOpen(false);
    const newCaret = start + name.length + 2;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newCaret, newCaret); });
  };

  const handleKeyDown = (e: any) => {
    // ⌘/Ctrl は送信ショートカット用なので候補確定には使わない
    if (open && matches.length && !e.metaKey && !e.ctrlKey) {
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => (i + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => (i - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[idx]); return; }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    onKeyDown?.(e);
  };

  const syncScroll = () => {
    if (backRef.current && ref.current) { backRef.current.scrollTop = ref.current.scrollTop; backRef.current.scrollLeft = ref.current.scrollLeft; }
  };

  // 背面オーバーレイ（色付きテキスト）と前面 textarea（文字は透明・カーソルのみ表示）を重ねる
  const backdropStyle = { ...style, position: "absolute", inset: 0, margin: 0, lineHeight: 1.5, resize: "none",
    color: "var(--text)", background: "transparent", borderColor: "transparent",
    pointerEvents: "none", whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word", overflow: "hidden" };
  const taStyle = { ...style, position: "relative", margin: 0, lineHeight: 1.5,
    color: "transparent", caretColor: "var(--text)", background: "transparent" };

  return (
    <div style={{ position: "relative" }}>
      <div ref={backRef} aria-hidden="true" style={backdropStyle}>
        {value ? highlightMentions(value) : <span style={{ color: "var(--text-4)" }}>{placeholder}</span>}
      </div>
      <textarea ref={ref} value={value} onChange={handleChange} onKeyDown={handleKeyDown} onScroll={syncScroll}
        onBlur={() => setTimeout(() => setOpen(false), 120)} style={taStyle} {...rest} />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 60, minWidth: 180, maxWidth: "100%",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.16)", overflow: "hidden" }}>
          {matches.map((u, i) => (
            <button key={u} type="button" onMouseDown={(e) => { e.preventDefault(); pick(u); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 12px",
                background: i === idx ? "var(--surface-2)" : "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
              <span style={{ color: STANCE.pro.color, fontWeight: 700 }}>@{u}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StanceBar({ pro, con, showLabels=false, height=6 }) {
  const { proP, conP } = pct(pro, con);
  return (
    <div style={{ width:"100%" }}>
      <div style={{ display:"flex", height, borderRadius:99, overflow:"hidden", background:"var(--surface-3)" }}>
        <div style={{ width:`${proP}%`, background:STANCE.pro.bar, transition:"width .5s cubic-bezier(.4,0,.2,1)" }} />
        <div style={{ width:`${conP}%`, background:STANCE.con.bar, transition:"width .5s cubic-bezier(.4,0,.2,1)" }} />
      </div>
      {showLabels && (
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:13 }}>
          <span style={{color:STANCE.pro.color,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5}}><Icn icon={ThumbsUp} size={14}/>賛成 {proP}%</span>
          <span style={{color:STANCE.con.color,fontWeight:700,display:"inline-flex",alignItems:"center",gap:5}}><Icn icon={ThumbsDown} size={14}/>反対 {conP}%</span>
        </div>
      )}
    </div>
  );
}

export function StancePicker({ current, onChange, size="md", disabled=false, labels=null }) {
  const { isAuthed } = useContext(AppContext);
  const sm = size==="sm";
  return (
    <div style={{ display:"flex", gap:sm?6:10, opacity: disabled?0.5:1 }}>
      {["pro","con"].map(s => {
        const st=STANCE[s], active=current===s;
        return (
          <button key={s} onClick={e=>{e.stopPropagation();if(!disabled)onChange(s);}} disabled={disabled}
            title={!isAuthed ? "投票にはログインが必要です" : (labels ? `${st.label}＝${labels[s]}` : undefined)}
            style={{ display:"flex", alignItems:"center", gap:sm?4:6,
              padding:sm?"4px 12px":"8px 20px", borderRadius:99,
              border:`1.5px solid ${active?st.border:"var(--border)"}`,
              background:active?st.bg:"var(--surface)", color:active?st.color:"var(--text-4)",
              fontWeight:700, fontSize:sm?12:14, cursor:disabled?"not-allowed":"pointer", transition:"all .15s", fontFamily:"inherit" }}>
            <Icn icon={st.Icon} size={sm?13:16}/>{st.label}
            {labels && !sm && <span style={{ fontSize:11, fontWeight:600, opacity:0.85 }}>「{labels[s]}」</span>}
          </button>
        );
      })}
    </div>
  );
}

export function StanceBadge({ stance }) {
  if (!stance) return null;
  const st = STANCE[stance];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 8px",
      borderRadius:99, background:st.bg, color:st.color, fontWeight:700, fontSize:11, border:`1px solid ${st.border}` }}>
      <Icn icon={st.Icon} size={12}/> {st.label}
    </span>
  );
}

// ─── Reputation Badge ─────────────────────────────────────────────
export function UserBadge({ author, size="sm" }) {
  const ctx = useContext(AppContext);
  const rep = author === ctx.me ? (ctx.myRep ?? repOf(author)) : repOf(author);
  const b = getBadge(rep);
  const sm = size==="sm";
  return (
    <span title={`Lv.${b.tier} ${b.label}（スコア ${rep}）`}
      style={{ display:"inline-flex", alignItems:"center", gap:3,
        padding: sm?"1px 6px":"2px 8px", borderRadius:99,
        background: b.color + "15", color: b.color,
        fontWeight:700, fontSize: sm?10:11, border:`1px solid ${b.color}40` }}>
      <Icn icon={b.Icon} size={sm?11:13}/>{b.label}
    </span>
  );
}

// ─── Status Badge: active / closed ────────────────────────────────
export function StatusBadge({ status, deadline }) {
  if (status === "closed") {
    return (
      <span style={{ display:"inline-flex", alignItems:"center", gap:3, padding:"2px 9px", borderRadius:99,
        background:"var(--surface-3)", color:"var(--text-2)", fontWeight:700, fontSize:11, border:"1px solid var(--border-2)" }}>
        <Icn icon={Lock} size={11}/> 決着済み
      </span>
    );
  }
  const tl = timeLeft(deadline);
  if (!tl) return null;
  const urgent = (deadline - Date.now()) < 24*3600*1000;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, padding:"2px 9px", borderRadius:99,
      background: urgent ? "var(--amber-bg)" : "#ecfdf5", color: urgent ? "#92400e" : "#065f46",
      fontWeight:700, fontSize:11, border:`1px solid ${urgent?"#fcd34d":"#a7f3d0"}` }}>
      <Icn icon={Clock} size={11}/> {tl}
    </span>
  );
}

// ─── Vote History Graph (SVG) ─────────────────────────────────────
export function VoteHistoryGraph({ history, createdAt }) {
  const w = 320, h = 140, pad = { top: 10, bottom: 22, left: 8, right: 8 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  // 経過時間ラベル（具体日時ではなく相対表記）
  const spanMs = createdAt != null ? Math.max(0, Date.now() - Number(createdAt)) : 0;
  const agoShort = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}分前`;
    if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
    return `${Math.floor(s / 86400)}日前`;
  };
  const ticks = [
    { f: 0, anchor: "start" }, { f: 1 / 3, anchor: "middle" }, { f: 2 / 3, anchor: "middle" }, { f: 1, anchor: "end" },
  ].map(t => ({
    x: pad.left + t.f * innerW,
    anchor: t.anchor,
    label: spanMs > 0 ? (t.f === 1 ? "今" : agoShort((1 - t.f) * spanMs)) : (t.f === 0 ? "投稿時" : t.f === 1 ? "現在" : ""),
  }));

  const maxVal = Math.max(...history.map(p => Math.max(p.pro, p.con))) || 1;

  const proPoints = history.map((p, i) => {
    const x = pad.left + (i/(history.length-1)) * innerW;
    const y = pad.top + (1 - p.pro/maxVal) * innerH;
    return `${x},${y}`;
  }).join(" ");

  const conPoints = history.map((p, i) => {
    const x = pad.left + (i/(history.length-1)) * innerW;
    const y = pad.top + (1 - p.con/maxVal) * innerH;
    return `${x},${y}`;
  }).join(" ");

  // Fill paths
  const lastX = pad.left + innerW;
  const baseY = pad.top + innerH;
  const proFill = `${proPoints} ${lastX},${baseY} ${pad.left},${baseY}`;
  const conFill = `${conPoints} ${lastX},${baseY} ${pad.left},${baseY}`;

  return (
    <div style={{ width:"100%", overflow:"hidden" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", height:"auto", display:"block" }}>
        {/* Grid lines (横) */}
        {[0.25, 0.5, 0.75].map((r,i) => (
          <line key={i} x1={pad.left} x2={lastX} y1={pad.top + r*innerH} y2={pad.top + r*innerH}
            stroke="var(--surface-3)" strokeWidth="1" />
        ))}
        {/* Grid lines (縦・時間軸ガイド) */}
        {ticks.map((t,i) => (
          <line key={`v${i}`} x1={t.x} x2={t.x} y1={pad.top} y2={pad.top + innerH}
            stroke="var(--surface-3)" strokeWidth="1" strokeDasharray="2 3" />
        ))}

        {/* Pro area + line */}
        <polygon points={proFill} fill={STANCE.pro.bar} opacity="0.3" />
        <polyline points={proPoints} fill="none" stroke={STANCE.pro.color} strokeWidth="2" />

        {/* Con area + line */}
        <polygon points={conFill} fill={STANCE.con.bar} opacity="0.3" />
        <polyline points={conPoints} fill="none" stroke={STANCE.con.color} strokeWidth="2" />

        {/* End dots */}
        {(() => {
          const last = history[history.length-1];
          const xL = lastX;
          const yPro = pad.top + (1 - last.pro/maxVal) * innerH;
          const yCon = pad.top + (1 - last.con/maxVal) * innerH;
          return <>
            <circle cx={xL} cy={yPro} r="4" fill={STANCE.pro.color} stroke="#fff" strokeWidth="2" />
            <circle cx={xL} cy={yCon} r="4" fill={STANCE.con.color} stroke="#fff" strokeWidth="2" />
          </>;
        })()}

        {/* x-axis labels（相対時間） */}
        {ticks.map((t,i) => (
          t.label ? <text key={`t${i}`} x={t.x} y={h-6} fontSize="9" fill="var(--text-4)" textAnchor={t.anchor as any}>{t.label}</text> : null
        ))}
      </svg>
    </div>
  );
}

// ─── AI Summary Card ──────────────────────────────────────────────
export function AISummary({ summary }) {
  return (
    <div style={{ background:"linear-gradient(135deg, var(--violet-1) 0%, var(--violet-2) 100%)",
      border:"1px solid var(--violet-border)", borderRadius:14, padding:"16px 18px", marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
        <Icn icon={Sparkles} size={18} style={{ color:"#7c3aed" }}/>
        <span style={{ fontWeight:800, fontSize:14, color:"#6d28d9", letterSpacing:-0.2 }}>AIによる議論要約</span>
        <span style={{ fontSize:10, background:"#7c3aed", color:"#fff", padding:"1px 7px", borderRadius:99, fontWeight:700 }}>BETA</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {["pro","con"].map(s => {
          const st = STANCE[s];
          return (
            <div key={s} style={{ background:"var(--surface)", borderRadius:10, padding:"12px 14px", border:`1px solid ${st.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                <Icn icon={st.Icon} size={14} style={{ color:st.color }}/>
                <span style={{ fontSize:12, fontWeight:800, color:st.color }}>{st.label}の主要論点</span>
              </div>
              <ul style={{ listStyle:"none", padding:0, margin:0 }}>
                {summary[s].map((point, i) => (
                  <li key={i} style={{ display:"flex", gap:6, fontSize:12.5, color:"var(--text-2)", lineHeight:1.55, marginBottom:6 }}>
                    <span style={{ color:st.color, fontWeight:800, flexShrink:0 }}>{i+1}.</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Thread / Bubble (前回と同じ階段状) ──────────────────────────
const REPLY_LIMIT = 3;

// ─── Conversation Thread: 全体で 2列 x N行 のグリッド ─────────────
//   絶対ルール:
//     ・賛成のバブルは必ず左カラム
//     ・反対のバブルは必ず右カラム
//     ・1バブル = 1行 (前のバブルの「一段下」に来る)
//
//   ┌─────────────┬─────────────┐
//   │ Pros (col1) │ Cons (col2) │
//   ├─────────────┼─────────────┤
//   │  A1 Pros    │             │
//   │             │  B2 Cons    │ ← A1への反論
//   │  A3 Pros    │             │ ← B2への反論
//   │  A4 Pros    │             │ ← A3への補強
//   │             │  B5 Cons    │ ← A4への反論
//   └─────────────┴─────────────┘

export function Thread({ comment, debateId, dispatch, locked }) {
  const { myRep, debates, me, notify, isAuthed } = useContext(AppContext);
  const [replyingStance, setReplyingStance] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [quoteOf, setQuoteOf] = useState<any>(null); // 引用返信の対象バブル
  const overQuota = myUsage(debates, me).comments >= perkOf(myRep).comments;
  const guard = useTypingGuard(notify);
  const mentionUsers = useMemo(() => mentionableUsers(debates), [debates]);

  const replies = comment.replies || [];
  const shown = expanded ? replies : replies.slice(0, REPLY_LIMIT);
  const hidden = replies.length - REPLY_LIMIT;

  // root + 表示する返信を時系列順にフラットな配列に
  const flow = [{ ...comment, isRoot: true }, ...shown];

  // バブルの「引用返信」→ 引用チップ付きでコンポーザーを開く（既定は逆の立場＝反論）
  const startQuoteReply = (b, rowNum) => {
    setQuoteOf({ id: b.id, author: b.author, stance: b.stance,
      excerpt: (b.body || "").slice(0, 60), rowNum });
    if (!replyingStance) setReplyingStance(b.stance === "pro" ? "con" : "pro");
    if (rowNum > REPLY_LIMIT) setExpanded(true); // 折りたたみ内の引用元が見えるように
  };

  const submitReply = () => {
    if (!replyText.trim() || !replyingStance || overQuota) return;
    dispatch({ type:"ADD_REPLY", debateId, commentId:comment.id, stance:comment.stance,
      reply:{ id:Date.now(), author:me, stance:replyingStance, body:replyText.trim(), score:1, vote:1,
        quote: quoteOf || null, integrity: guard.snapshot(replyText.trim().length) }
    });
    guard.reset();
    setReplyText(""); setReplyingStance(null); setQuoteOf(null);
  };

  const rootSt = STANCE[comment.stance];

  return (
    <div style={{ marginBottom:20, background:"var(--surface)", border:`1px solid ${rootSt.border}`,
      borderRadius:12, padding:"14px 12px 12px", boxShadow:"0 1px 3px rgba(0,0,0,0.03)" }}>

      {/* 縦に積まれる行 */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {flow.map((b, i) => (
          <BubbleRow
            key={b.id}
            bubble={b}
            rowNum={i + 1}
            prevBubble={i > 0 ? flow[i-1] : null}
            isRoot={i === 0}
            debateId={debateId}
            rootCommentId={comment.id}
            rootStance={comment.stance}
            locked={locked}
            onQuote={startQuoteReply}
          />
        ))}
      </div>

      {/* 折りたたみ */}
      {replies.length > REPLY_LIMIT && (
        <div style={{ marginTop:10, textAlign:"center" }}>
          <button onClick={()=>setExpanded(!expanded)}
            style={{ background:"none", border:`1px dashed ${rootSt.border}`, cursor:"pointer",
              fontSize:12, color:rootSt.color, fontWeight:700, padding:"4px 14px",
              borderRadius:99, fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4 }}>
            {expanded ? <><Icn icon={ChevronUp} size={13}/>折りたたむ</> : <><Icn icon={ChevronDown} size={13}/>他 {hidden} 件の返信を見る</>}
          </button>
        </div>
      )}

      {/* 返信ボタン: 賛成・反対どちらでも開始可能 */}
      {!locked && (
        <div style={{ display:"flex", gap:6, marginTop:12, paddingTop:10,
          borderTop:`1px dashed ${rootSt.border}`, justifyContent:"center", flexWrap:"wrap" }}>
          {!isAuthed ? (
            <button onClick={()=>dispatch({ type:"ADD_REPLY" })}
              style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"var(--text-4)", fontFamily:"inherit", padding:"2px 8px" }}>
              返信するにはログインが必要です（クリックでログイン）
            </button>
          ) : !replyingStance ? (
            <>
              <span style={{ fontSize:11, color:"var(--text-4)", alignSelf:"center" }}>このスレッドに返信:</span>
              <button onClick={()=>setReplyingStance("pro")}
                style={{ ...replyBtn, color:STANCE.pro.color, borderColor:STANCE.pro.border, background:STANCE.pro.bg, display:"inline-flex", alignItems:"center", gap:5 }}>
                <Icn icon={ThumbsUp} size={13}/>賛成として
              </button>
              <button onClick={()=>setReplyingStance("con")}
                style={{ ...replyBtn, color:STANCE.con.color, borderColor:STANCE.con.border, background:STANCE.con.bg, display:"inline-flex", alignItems:"center", gap:5 }}>
                <Icn icon={ThumbsDown} size={13}/>反対として
              </button>
            </>
          ) : (
            <div style={{ width:"100%", background:STANCE[replyingStance].bg,
              border:`1px solid ${STANCE[replyingStance].border}`, borderRadius:10, padding:"10px 12px" }}>
              <p style={{ fontSize:11, fontWeight:700, color:STANCE[replyingStance].color, marginBottom:6, display:"flex", alignItems:"center", gap:5 }}>
                <Icn icon={STANCE[replyingStance].Icon} size={13}/> {STANCE[replyingStance].label}として返信
              </p>
              {quoteOf && (
                <div style={{ display:"flex", alignItems:"flex-start", gap:6, background:"var(--surface)",
                  borderLeft:`3px solid ${STANCE[quoteOf.stance].color}`, borderRadius:"4px 8px 8px 4px",
                  padding:"6px 8px", marginBottom:7 }}>
                  <Icn icon={CornerUpLeft} size={12} style={{ color:"var(--text-4)", marginTop:2 }}/>
                  <p style={{ flex:1, fontSize:11.5, color:"var(--text-3)", lineHeight:1.5, minWidth:0 }}>
                    <strong style={{ color:STANCE[quoteOf.stance].color }}>#{quoteOf.rowNum} @{quoteOf.author}</strong>
                    <span style={{ display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{quoteOf.excerpt}{quoteOf.excerpt.length >= 60 ? "…" : ""}</span>
                  </p>
                  <button onClick={()=>setQuoteOf(null)} title="引用を外す" aria-label="引用を外す"
                    style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-4)", padding:0, display:"inline-flex" }}>
                    <Icn icon={X} size={13}/>
                  </button>
                </div>
              )}
              <MentionTextarea value={replyText} onChange={setReplyText} users={mentionUsers} rows={2} {...guard.bind}
                onKeyDown={(e: any) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submitReply(); } }}
                placeholder="あなたの意見を書く…（@でメンション / ⌘Enterで送信）"
                style={{ width:"100%", padding:"7px 10px", border:`1px solid ${STANCE[replyingStance].border}`,
                  borderRadius:8, fontSize:13, fontFamily:"inherit", resize:"vertical", outline:"none", background:"var(--surface)", color:"var(--text)" }} />
              <div style={{ display:"flex", gap:8, marginTop:7 }}>
                <button onClick={submitReply} disabled={!replyText.trim() || overQuota}
                  style={{ background:STANCE[replyingStance].color, color:"#fff", border:"none", borderRadius:99,
                    padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  返信する
                </button>
                {overQuota && <span style={{ fontSize:11, color:STANCE.con.color, fontWeight:600, alignSelf:"center" }}>今月のコメント上限に達しました</span>}
                <button onClick={()=>{setReplyingStance(null); setReplyText(""); setQuoteOf(null);}}
                  style={{ background:"none", border:"1px solid var(--border)", borderRadius:99,
                    padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer", color:"var(--text-2)", fontFamily:"inherit" }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 1行 = 1バブル: 立場で左カラム(Pros)か右カラム(Cons)のどちらかに配置 ──
export function BubbleRow({ bubble, rowNum, prevBubble, isRoot, debateId, rootCommentId, rootStance, locked, onQuote }) {
  const st = STANCE[bubble.stance] || STANCE.pro;
  const isPro = bubble.stance === "pro";
  const isRebuttal = prevBubble && prevBubble.stance !== bubble.stance;
  const likeInfo = { debateId, commentId: rootCommentId, replyId: isRoot ? null : bubble.id, stance: rootStance };

  // 接続ヒント: 前の発言に対する反論 or 補強（引用がある場合は引用ボックスが役割を担う）
  const connector = !isRoot && !bubble.quote && (
    <div style={{
      display:"flex",
      justifyContent: isPro ? "flex-start" : "flex-end",
      paddingLeft: isPro ? 24 : 0,
      paddingRight: isPro ? 0 : 24,
      marginBottom: -4,
    }}>
      <span style={{ fontSize:10, color:"var(--text-4)", fontWeight:600,
        background:"var(--surface)", padding:"1px 8px", borderRadius:99,
        border:"1px dashed var(--border)", display:"inline-flex", alignItems:"center", gap:4 }}>
        {isRebuttal
          ? <><Icn icon={CornerUpLeft} size={11}/>#{rowNum-1}（{STANCE[prevBubble.stance].label}）への反論</>
          : <><Icn icon={CornerDownRight} size={11}/>#{rowNum-1} への補強</>}
      </span>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
      {connector}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, alignItems:"start" }}>
        {/* 左カラム (Pros) */}
        <div style={{ minWidth:0 }}>
          {isPro && <BubbleContent bubble={bubble} rowNum={rowNum} isRoot={isRoot} st={st} isPro likeInfo={likeInfo} locked={locked} onQuote={onQuote} />}
        </div>
        {/* 右カラム (Cons) */}
        <div style={{ minWidth:0 }}>
          {!isPro && <BubbleContent bubble={bubble} rowNum={rowNum} isRoot={isRoot} st={st} isPro={false} likeInfo={likeInfo} locked={locked} onQuote={onQuote} />}
        </div>
      </div>
    </div>
  );
}

export function BubbleContent({ bubble, rowNum, isRoot, st, isPro, likeInfo, locked, onQuote }) {
  const { dispatch, me, myAvatar, isAuthed } = useContext(AppContext);
  const liked = bubble.vote === 1;
  // 引用元へスクロール＋一瞬ハイライト
  const jumpToQuoted = (id) => {
    const el = document.getElementById(`bubble-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "box-shadow .3s";
    el.style.boxShadow = "0 0 0 3px var(--border-2)";
    setTimeout(() => { el.style.boxShadow = "none"; }, 1200);
  };
  return (
    <div id={`bubble-${bubble.id}`} style={{ display:"flex", flexDirection:"column", gap:4, borderRadius:12 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap",
        flexDirection: isPro ? "row" : "row-reverse" }}>
        {bubble.author === me && myAvatar ? (
          <Avatar id={myAvatar} size={20} fallback={bubble.author[0].toUpperCase()} />
        ) : (
          <div style={{ width:20, height:20, borderRadius:50, flexShrink:0,
            background:st.bg, border:`1px solid ${st.border}`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:9, fontWeight:800, color:st.color }}>
            {bubble.author[0].toUpperCase()}
          </div>
        )}
        <button onClick={()=>dispatch({type:"SET_USER",author:bubble.author})}
          style={{ background:"none", border:"none", padding:0, cursor:"pointer",
            fontWeight:700, fontSize:11, color:"var(--text)", fontFamily:"inherit" }}>@{bubble.author}</button>
        <UserBadge author={bubble.author} size="sm" />
        <div style={{ display:"flex", alignItems:"center", gap:6,
          marginLeft: isPro ? "auto" : 0, marginRight: isPro ? 0 : "auto",
          flexDirection: isPro ? "row" : "row-reverse" }}>
          <button onClick={()=>!locked && dispatch({type:"LIKE",...likeInfo})} disabled={locked}
            title={isAuthed ? "いいね" : "いいねにはログインが必要です"}
            style={{ display:"flex", alignItems:"center", gap:3, background: liked ? "var(--rose-bg)" : "none",
              border:`1px solid ${liked ? "#fecdd3" : "transparent"}`, borderRadius:99,
              padding:"1px 7px", cursor: locked ? "default" : "pointer", fontFamily:"inherit",
              color: liked ? "#e11d48" : "var(--text-4)", fontSize:10, fontWeight:700 }}>
            <Icn icon={Heart} size={12} fill={liked ? "currentColor" : "none"}/>{fmt(bubble.score)}
          </button>
          {!locked && onQuote && (
            <button onClick={()=>onQuote(bubble, rowNum)}
              title="この発言を引用して返信"
              style={{ display:"flex", alignItems:"center", gap:3, background:"none", border:"1px solid transparent",
                borderRadius:99, padding:"1px 7px", cursor:"pointer", fontFamily:"inherit",
                color:"var(--text-4)", fontSize:10, fontWeight:700 }}>
              <Icn icon={CornerUpLeft} size={12}/>返信
            </button>
          )}
          <button onClick={()=>dispatch({type:"OPEN_REPORT",target:{kind:"comment",label:`@${bubble.author} のコメント`}})}
            title={isAuthed ? "通報" : "通報にはログインが必要です"}
            style={{ background:"none", border:"none", padding:0, cursor:"pointer", display:"inline-flex",
              color:"var(--border-2)" }}><Icn icon={Flag} size={12}/></button>
        </div>
      </div>

      {/* Bubble body */}
      <div style={{
        background: st.bg,
        border:`1.5px solid ${st.border}`,
        borderRadius: isPro ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
        padding:"10px 12px",
        fontSize:13, color:"var(--text-2)", lineHeight:1.6,
        boxShadow: isRoot ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
        position:"relative",
      }}>
        {/* 行番号 */}
        <span style={{
          position:"absolute", top:-9,
          [isPro?"left":"right"]: 10,
          background:st.color, color:"#fff",
          fontSize:9, fontWeight:800,
          padding:"2px 7px", borderRadius:99, letterSpacing:0.3,
          boxShadow:"0 1px 2px rgba(0,0,0,0.1)",
        }}>
          #{rowNum}{isRoot ? " 起点" : ""}
        </span>
        {/* Teams風の引用: どの発言への返信かを明示（クリックで元へジャンプ） */}
        {bubble.quote && (
          <button onClick={()=>jumpToQuoted(bubble.quote.id)}
            title="引用元へ移動"
            style={{ display:"flex", alignItems:"flex-start", gap:5, width:"100%", textAlign:"left",
              background:"var(--surface)", border:"none", cursor:"pointer", fontFamily:"inherit",
              borderLeft:`3px solid ${(STANCE[bubble.quote.stance]||st).color}`,
              borderRadius:"3px 8px 8px 3px", padding:"5px 8px", marginBottom:7, opacity:0.9 }}>
            <Icn icon={CornerUpLeft} size={11} style={{ color:"var(--text-4)", marginTop:2, flexShrink:0 }}/>
            <span style={{ minWidth:0, fontSize:11, color:"var(--text-3)", lineHeight:1.5 }}>
              <strong style={{ color:(STANCE[bubble.quote.stance]||st).color }}>#{bubble.quote.rowNum} @{bubble.quote.author}</strong>
              <span style={{ display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {bubble.quote.excerpt}{(bubble.quote.excerpt||"").length >= 60 ? "…" : ""}
              </span>
            </span>
          </button>
        )}
        {renderBody(bubble.body, dispatch)}
      </div>
    </div>
  );
}


// ─── Comment section: 全スレッドを時系列で表示 ───────────────────
export function SplitComments({ d, dispatch }) {
  const { myRep, debates, me, isAuthed, notify } = useContext(AppContext);
  const [text, setText] = useState("");
  const [myStance, setMyStance] = useState("pro");
  const locked = d.status === "closed";
  const guard = useTypingGuard(notify);
  const mentionUsers = useMemo(() => mentionableUsers(debates), [debates]);
  const perk = perkOf(myRep);
  const usedComments = myUsage(debates, me).comments;
  const overQuota = usedComments >= perk.comments;

  // 全rootコメント (賛成・反対) を時系列で混ぜて表示
  const allThreads = [
    ...d.proComments.map(c => ({ ...c, stance:"pro" })),
    ...d.conComments.map(c => ({ ...c, stance:"con" })),
  ].sort((a, b) => a.id - b.id);

  // ディベート内検索（本文・ユーザー名でスレッドを絞り込み。返信も対象）
  const [filter, setFilter] = useState("");
  const fq = filter.trim().toLowerCase();
  const hit = (b) => (b.body || "").toLowerCase().includes(fq) || (b.author || "").toLowerCase().includes(fq);
  const shownThreads = fq ? allThreads.filter(c => hit(c) || (c.replies || []).some(hit)) : allThreads;

  const submit = () => {
    if (!text.trim() || locked || overQuota) return;
    dispatch({ type:"ADD_COMMENT", debateId:d.id, stance:myStance,
      comment:{ id:Date.now(), author:me, stance:myStance, body:text.trim(), score:1, vote:1, replies:[], integrity: guard.snapshot(text.trim().length) }
    });
    guard.reset();
    setText("");
  };

  return (
    <div>
      {!isAuthed ? (
        <div onClick={()=>dispatch({type:"ADD_COMMENT"})}
          style={{ background:"var(--surface-2)", border:"1.5px dashed var(--border)", borderRadius:14, padding:"16px 22px", marginBottom:14, textAlign:"center", cursor:"pointer" }}>
          <p style={{ fontSize:13, fontWeight:700, color:"var(--text-2)" }}>議論に参加するにはログインが必要です</p>
          <p style={{ fontSize:12, color:"var(--text-3)", marginTop:4 }}>クリックしてログイン / 新規登録</p>
        </div>
      ) : locked ? (
        <div style={{ background:"var(--surface-2)", border:"1.5px solid var(--border)", borderRadius:14, padding:"16px 22px", marginBottom:14, textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"var(--text-2)", marginBottom:4, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><Icn icon={Lock} size={15}/> このディベートは決着済みです</div>
          <p style={{ fontSize:13, color:"var(--text-3)" }}>新しい投票・コメントは投稿できません。過去の議論を閲覧してください。</p>
        </div>
      ) : (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"18px 22px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:6 }}>
            <p style={{ fontSize:13, color:"var(--text-3)" }}>@{me} として新しいスレッドを開始</p>
            <span style={{ fontSize:11, fontWeight:700, color: overQuota ? STANCE.con.color : "var(--text-4)" }}>
              今月のコメント {usedComments}/{perk.comments}
            </span>
          </div>
          {overQuota && (
            <div style={{ background:STANCE.con.bg, border:`1px solid ${STANCE.con.border}`, borderRadius:8,
              padding:"8px 12px", fontSize:12, color:STANCE.con.color, marginBottom:10, fontWeight:600 }}>
              今月のコメント上限に達しました。ランクが上がると上限が解放されます。
            </div>
          )}
          <div style={{ marginBottom:10, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"var(--text-2)" }}>立場を選択：</span>
            <StancePicker current={myStance} onChange={setMyStance} />
          </div>
          <MentionTextarea value={text} onChange={setText} users={mentionUsers} rows={3} {...guard.bind}
            onKeyDown={(e: any) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="あなたの意見・論点を書いてください…（@でメンション / ⌘Enterで送信）"
            style={{ width:"100%", padding:"10px 14px", border:"1px solid var(--border)", borderRadius:10, fontSize:14, fontFamily:"inherit", resize:"vertical", outline:"none", color:"var(--text)", background:"var(--surface)" }} />
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10 }}>
            <button onClick={submit} disabled={!text.trim() || overQuota}
              style={{ background:STANCE.pro.color, color:"#fff", border:"none", borderRadius:99, padding:"8px 22px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              投稿する
            </button>
          </div>
        </div>
      )}

      {/* 2カラムの常設ヘッダー */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        {["pro","con"].map(s => {
          const st = STANCE[s];
          const cnt = (s==="pro" ? d.proComments : d.conComments).length;
          return (
            <div key={s} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px",
              background:st.bg, border:`1px solid ${st.border}`, borderRadius:10 }}>
              <Icn icon={st.Icon} size={16} style={{ color:st.color }}/>
              <span style={{ fontWeight:700, fontSize:14, color:st.color, minWidth:0 }}>
                {st.label}側
                <span style={{ fontSize:11.5, fontWeight:600, opacity:0.85, marginLeft:5 }}>「{s==="pro" ? (d.proLabel || suggestStanceLabels(d.title).pro) : (d.conLabel || suggestStanceLabels(d.title).con)}」</span>
              </span>
              <span style={{ marginLeft:"auto", fontSize:12, fontWeight:700, background:"var(--surface)", flexShrink:0,
                color:st.color, padding:"2px 8px", borderRadius:99, border:`1px solid ${st.border}` }}>
                スレッド {cnt}件
              </span>
            </div>
          );
        })}
      </div>

      {/* ディベート内検索（コメントの絞り込み） */}
      {allThreads.length > 0 && (
        <div style={{ position:"relative", marginBottom:12 }}>
          <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"var(--text-4)", display:"inline-flex", pointerEvents:"none" }}><Icn icon={Search} size={13}/></span>
          <input value={filter} onChange={e=>setFilter(e.target.value)}
            placeholder="このディベート内のコメントを検索（本文・ユーザー名）…" aria-label="コメントを検索"
            style={{ width:"100%", padding:"7px 12px 7px 32px", border:"1px solid var(--border)", borderRadius:99, fontSize:13, fontFamily:"inherit", background:"var(--surface-2)", color:"var(--text)", outline:"none" }} />
          {fq && (
            <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:11, color:"var(--text-4)", display:"inline-flex", alignItems:"center", gap:6 }}>
              {shownThreads.length}件
              <button onClick={()=>setFilter("")} title="検索をクリア" aria-label="検索をクリア"
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-3)", display:"inline-flex", padding:0 }}><Icn icon={X} size={13}/></button>
            </span>
          )}
        </div>
      )}

      {/* 全スレッドを時系列で表示 */}
      {allThreads.length === 0 ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {["pro","con"].map(s => {
            const st = STANCE[s];
            return (
              <div key={s} style={{ textAlign:"center", padding:"28px 12px",
                fontSize:13, border:`1.5px dashed ${st.border}`, borderRadius:10, background:st.light }}>
                <p style={{ fontWeight:800, color:st.color, marginBottom:4 }}>まだ{st.label}意見がない。</p>
                <p style={{ color:"var(--text-4)", fontSize:12 }}>最初の一言は、君の番だ。</p>
              </div>
            );
          })}
        </div>
      ) : shownThreads.length === 0 ? (
        <div style={{ textAlign:"center", padding:"28px 12px", color:"var(--text-4)", fontSize:13,
          border:"1.5px dashed var(--border)", borderRadius:10, background:"var(--surface-2)" }}>
          「{filter.trim()}」に一致するコメントはありません
        </div>
      ) : (
        shownThreads.map(c => (
          <Thread key={c.id} comment={c} debateId={d.id} dispatch={dispatch} locked={locked} />
        ))
      )}
    </div>
  );
}

// ─── Related debates panel ────────────────────────────────────────
export function RelatedDebates({ current, all, dispatch }) {
  const related = useMemo(() => getRelated(current, all), [current.id, all]);
  if (related.length === 0) return null;

  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"16px 18px", marginTop:16 }}>
      <h4 style={{ fontWeight:800, fontSize:14, color:"var(--text)", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
        <Icn icon={Link2} size={15}/>関連するディベート
      </h4>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {related.map(r => {
          const { proP, conP } = pct(r.pro, r.con);
          return (
            <div key={r.id} onClick={()=>dispatch({type:"SET_ACTIVE",debate:r})}
              style={{ padding:"12px 14px", border:"1px solid var(--border)", borderRadius:10,
                cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
              onMouseLeave={e=>e.currentTarget.style.background=""}>
              <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", lineHeight:1.4, marginBottom:6 }}>{r.title}</p>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:11, color:STANCE.pro.color, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={ThumbsUp} size={12}/>{proP}%</span>
                <span style={{ fontSize:11, color:STANCE.con.color, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={ThumbsDown} size={12}/>{conP}%</span>
                <StatusBadge status={r.status} deadline={r.deadline} />
                <span style={{ fontSize:11, color:"var(--text-4)", marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={MessageCircle} size={12}/>{fmt(r.commentCount)}</span>
              </div>
              <StanceBar pro={r.pro} con={r.con} height={4} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── User Page (マイページ / プロフィール) ───────────────────────
export function UserPage({ author, dispatch }) {
  const { debates, myRep, me, myAvatar, setAvatar } = useContext(AppContext);
  const rep = author === me ? myRep : repOf(author);
  const badge = getBadge(rep);
  const perk = perkOf(rep);

  const posts = debates.filter(d => d.author === author);
  const myBubbles = [];
  debates.forEach(d => {
    [...d.proComments.map(c => ({ ...c, stance:"pro" })), ...d.conComments.map(c => ({ ...c, stance:"con" }))].forEach(c => {
      if (c.author === author) myBubbles.push({ ...c, debate:d, kind:"コメント" });
      (c.replies || []).forEach(r => { if (r.author === author) myBubbles.push({ ...r, debate:d, kind:"返信" }); });
    });
  });
  const totalLikes = likesReceived(author, debates);
  const pops = popularUsers(debates, 5).map(p => p.author);
  const isPopular = pops.includes(author);
  const isMe = author === me;

  const Stat = ({ label, value, color }: { label: any; value: any; color?: any }) => (
    <div style={{ flex:1, textAlign:"center", padding:"14px 8px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
      <div style={{ fontSize:22, fontWeight:800, color: color || "var(--text)" }}>{value}</div>
      <div style={{ fontSize:12, color:"var(--text-3)", marginTop:2 }}>{label}</div>
    </div>
  );

  return (
    <div>
      <button onClick={()=>dispatch({type:"SET_USER",author:null})}
        style={{ background:"none", border:"none", cursor:"pointer", color:STANCE.pro.color, fontWeight:700, fontSize:14, marginBottom:20, display:"flex", alignItems:"center", gap:5 }}>
        <Icn icon={ArrowLeft} size={16}/> 一覧に戻る
      </button>

      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"24px 28px", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <Avatar id={isMe ? myAvatar : null} size={64} fallback={author[0].toUpperCase()} />
          <div style={{ minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"var(--text)" }}>@{author}</h2>
              {isMe && <span style={{ fontSize:11, background:STANCE.pro.bg, color:STANCE.pro.color, padding:"1px 8px", borderRadius:99, fontWeight:700 }}>あなた</span>}
              {isPopular && <span style={{ fontSize:11, background:"var(--rose-bg)", color:"#e11d48", padding:"1px 8px", borderRadius:99, fontWeight:700, border:"1px solid #fecdd3", display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={Flame} size={12}/> 人気ユーザー</span>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"2px 10px", borderRadius:99,
                background:badge.color+"15", color:badge.color, fontWeight:700, fontSize:13, border:`1px solid ${badge.color}40` }}>
                <span style={{ fontSize:10, fontWeight:800, color:"#fff", background:badge.color, borderRadius:5, padding:"1px 5px" }}>Lv.{badge.tier}</span>
                <Icn icon={badge.Icon} size={14}/> {badge.label}
              </span>
              <span style={{ fontSize:13, color:"var(--text-4)", fontWeight:600 }}>スコア {fmt(rep)}</span>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <Stat label="投稿したディベート" value={posts.length} color={STANCE.pro.color} />
          <Stat label="コメント・返信" value={myBubbles.length} />
          <Stat label="獲得したいいね" value={fmt(totalLikes)} color="#e11d48" />
        </div>

        {isMe && (
          <div style={{ marginTop:14, padding:"12px 16px", background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:12, fontSize:12, color:"var(--text-3)" }}>
            現在のランク特典: 月間ディベート作成 <strong style={{ color:"var(--text-2)" }}>{perk.debates === 9999 ? "無制限" : perk.debates}</strong> 件 / コメント <strong style={{ color:"var(--text-2)" }}>{perk.comments === 9999 ? "無制限" : perk.comments}</strong> 件
          </div>
        )}
      </div>

      {/* アバター選択（自分のページのみ） */}
      {isMe && setAvatar && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"18px 20px", marginBottom:16 }}>
          <h3 style={{ fontWeight:800, fontSize:15, color:"var(--text)", marginBottom:4 }}>アイコンを選ぶ</h3>
          <p style={{ fontSize:12, color:"var(--text-3)", marginBottom:14 }}>ランクが上がると選べるアイコンが増えます（実績解放）。</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(84px, 1fr))", gap:10 }}>
            {(() => {
              const selected = !myAvatar;
              return (
                <button onClick={()=>setAvatar(null)} title="デフォルト（頭文字アイコン）" aria-label="デフォルトに戻す"
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"10px 6px", borderRadius:12,
                    border:`2px solid ${selected ? STANCE.pro.color : "var(--border)"}`,
                    background: selected ? STANCE.pro.bg : "var(--surface-2)", cursor:"pointer", fontFamily:"inherit" }}>
                  <div style={{ lineHeight:0 }}><Avatar id={null} size={52} fallback={author[0].toUpperCase()} /></div>
                </button>
              );
            })()}
            {AVATARS.map(a => {
              const unlocked = badge.tier >= a.unlockTier;
              const selected = myAvatar === a.id;
              return (
                <button key={a.id} disabled={!unlocked} onClick={()=> unlocked && setAvatar(a.id)}
                  title={unlocked ? undefined : `Lv.${a.unlockTier} で解放`}
                  aria-label={unlocked ? "アイコンを選ぶ" : `Lv.${a.unlockTier} で解放`}
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"10px 6px", borderRadius:12,
                    border:`2px solid ${selected ? STANCE.pro.color : "var(--border)"}`,
                    background: selected ? STANCE.pro.bg : "var(--surface-2)",
                    cursor: unlocked ? "pointer" : "not-allowed", fontFamily:"inherit", opacity: unlocked ? 1 : 0.6 }}>
                  <div style={{ position:"relative", lineHeight:0 }}>
                    <Avatar id={a.id} size={52} />
                    {!unlocked && (
                      <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Icn icon={Lock} size={18} style={{ color:"#fff" }}/>
                      </div>
                    )}
                  </div>
                  {!unlocked && <span style={{ fontSize:10, color:"var(--text-4)" }}>Lv.{a.unlockTier}で解放</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 投稿したディベート */}
      <h3 style={{ fontWeight:800, fontSize:15, color:"var(--text)", margin:"0 0 10px 2px", display:"flex", alignItems:"center", gap:6 }}><Icn icon={Megaphone} size={16}/> 投稿したディベート ({posts.length})</h3>
      {posts.length === 0 ? (
        <p style={{ fontSize:13, color:"var(--text-4)", padding:"16px", textAlign:"center", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, marginBottom:20 }}>まだ投稿がありません</p>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
          {posts.map(d => <DebateCard key={d.id} d={d} dispatch={dispatch} />)}
        </div>
      )}

      {/* コメント・返信 */}
      <h3 style={{ fontWeight:800, fontSize:15, color:"var(--text)", margin:"0 0 10px 2px", display:"flex", alignItems:"center", gap:6 }}><Icn icon={MessageCircle} size={16}/> コメント・返信 ({myBubbles.length})</h3>
      {myBubbles.length === 0 ? (
        <p style={{ fontSize:13, color:"var(--text-4)", padding:"16px", textAlign:"center", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>まだコメントがありません</p>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {myBubbles.map(b => {
            const st = STANCE[b.stance];
            return (
              <div key={b.id} onClick={()=>dispatch({type:"SET_ACTIVE",debate:b.debate})}
                style={{ background:"var(--surface)", border:`1px solid ${st.border}`, borderLeft:`4px solid ${st.bar}`,
                  borderRadius:10, padding:"12px 16px", cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:700, color:st.color, display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={st.Icon} size={12}/> {st.label}・{b.kind}</span>
                  <span style={{ fontSize:11, color:"var(--text-4)" }}>on「{b.debate.title}」</span>
                  <span style={{ fontSize:11, color:"#e11d48", fontWeight:700, marginLeft:"auto", display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={Heart} size={12} fill="currentColor"/> {fmt(b.score)}</span>
                </div>
                <p style={{ fontSize:13, color:"var(--text-2)", lineHeight:1.6 }}>{renderBody(b.body, dispatch)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Debate Detail ────────────────────────────────────────────────
export function DebateDetail({ d, allDebates, dispatch, myPred, onPredict }) {
  const { notify, isAuthed } = useContext(AppContext);
  const [justVoted, setJustVoted] = useState<any>(null); // 投票直後のゲーム的演出用
  const [showGraph, setShowGraph] = useState(false);     // 推移グラフは折りたたみ（既定は非表示）
  // 立場ラベル（未設定の古いデータはタイトルから推定）
  const stanceLbl = {
    pro: d.proLabel || suggestStanceLabels(d.title).pro,
    con: d.conLabel || suggestStanceLabels(d.title).con,
  };
  const topic = TOPICS.find(t=>t.id===d.topicId);
  const { proP, conP } = pct(d.pro, d.con);
  const total = d.pro + d.con;
  const decided = isDecided(d);          // closed もしくは締切超過
  const locked = decided;                // 決着後は投票不可
  const winner = decided ? winnerSide(d) : null;

  const onShare = async () => {
    const url = `${location.origin}${location.pathname}#d=${d.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: d.title, text: `Splitで議論中: ${d.title}`, url }); return; }
      catch (e: any) { if (e?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); notify?.("リンクをコピーしました"); }
    catch { notify?.("コピーできませんでした", "con"); }
  };

  return (
    <div>
      <button onClick={()=>dispatch({type:"SET_ACTIVE",debate:null})}
        style={{ background:"none", border:"none", cursor:"pointer", color:STANCE.pro.color, fontWeight:700, fontSize:14, marginBottom:20, display:"flex", alignItems:"center", gap:5 }}>
        <Icn icon={ArrowLeft} size={16}/> 一覧に戻る
      </button>

      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden", marginBottom:16 }}>
        <div style={{ display:"flex", height:8 }}>
          <div style={{ flex:d.pro, background:STANCE.pro.bar, transition:"flex .5s" }} />
          <div style={{ flex:d.con, background:STANCE.con.bar, transition:"flex .5s" }} />
        </div>
        {d.thumbnail && (
          <img src={d.thumbnail} alt="" style={{ width:"100%", maxHeight:260, objectFit:"cover", display:"block" }} />
        )}
        <div style={{ padding:"24px 28px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, background:"var(--surface-3)", color:"var(--text-2)", padding:"3px 10px", borderRadius:99, fontWeight:600, display:"inline-flex", alignItems:"center", gap:5 }}>{topic && <Icn icon={topic.Icon} size={13}/>} {topic?.name}</span>
            <StatusBadge status={d.status} deadline={d.deadline} />
          </div>
          {/* 作成者（ランク・肩書きはディベートに紐づけない。@名はクリックで本人ページへ） */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:14, fontSize:12, color:"var(--text-4)", flexWrap:"wrap" }}>
            <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:"var(--surface-3)", color:"var(--text-3)", padding:"2px 8px", borderRadius:99, fontWeight:700 }}><Icn icon={PenLine} size={11}/> 作成者</span>
            <button onClick={()=>dispatch({type:"SET_USER",author:d.author})}
              style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:12.5, fontWeight:700, color:"var(--text-2)", fontFamily:"inherit" }}>@{d.author}</button>
            <span>・ {ago(d.createdAt)}</span>
          </div>
          <h2 style={{ fontSize:27, fontWeight:800, color:"var(--text)", lineHeight:1.28, marginBottom:16, letterSpacing:-0.5 }}>{d.title}</h2>
          <p style={{ fontSize:15, color:"var(--text-2)", lineHeight:1.8, marginBottom:16 }}>{d.description}</p>
          {(d.tags || []).length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:24 }}>
              {d.tags.map(t => (
                <button key={t} onClick={()=>dispatch({type:"SET_TAG",tag:t})}
                  style={{ background:STANCE.pro.light, color:STANCE.pro.color, border:`1px solid ${STANCE.pro.border}`,
                    borderRadius:99, padding:"3px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  #{t}
                </button>
              ))}
            </div>
          )}

          {/* Closed verdict banner */}
          {locked && (
            <div style={{ padding:"14px 18px", borderRadius:12, marginBottom:20,
              background: STANCE[winner].bg, border:`1.5px solid ${STANCE[winner].border}`,
              display:"flex", alignItems:"center", gap:12 }}>
              <Icn icon={Trophy} size={28} style={{ color:STANCE[winner].color }}/>
              <div>
                <p style={{ fontSize:13, fontWeight:700, color:STANCE[winner].color, marginBottom:2 }}>最終結果</p>
                <p style={{ fontSize:16, fontWeight:800, color:STANCE[winner].color }}>
                  「{STANCE[winner].label}」が優勢 ({winner==="pro"?proP:conP}%)
                </p>
              </div>
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
            {["pro","con"].map(s => {
              const st=STANCE[s], count=d[s], p=s==="pro"?proP:conP, active=d.userStance===s;
              const popped = justVoted && justVoted.stance === s; // 直前に押した側だけ演出
              return (
                <div key={s} onClick={()=>{
                    if (locked) return;
                    if (d.userStance !== s) setJustVoted({ stance: s, id: Date.now() }); // 取消時は演出なし
                    dispatch({type:"SET_STANCE",id:d.id,stance:s});
                  }}
                  style={{ position:"relative", textAlign:"center", padding:"18px 12px", borderRadius:12, cursor:locked?"default":"pointer",
                    background:active?st.bg:"var(--surface-2)", border:`1.5px solid ${active?st.border:"var(--border)"}`, transition:"all .2s",
                    boxShadow: active ? `0 0 0 3px ${st.bg}` : "none",
                    animation: popped ? "split-vote-pop .45s cubic-bezier(.4,0,.2,1)" : "none",
                    opacity: locked && !active ? 0.6 : 1 }}>
                  {popped && (
                    <span key={justVoted.id} style={{ position:"absolute", top:8, right:12, fontSize:16, fontWeight:800,
                      color:st.color, pointerEvents:"none", animation:"split-plus-rise .9s ease-out forwards" }}>+1</span>
                  )}
                  <div style={{ marginBottom:6, display:"flex", justifyContent:"center" }}><Icn icon={st.Icon} size={26} style={{ color:st.color }}/></div>
                  <div style={{ fontSize:22, fontWeight:800, color:st.color, transition:"transform .2s",
                    transform: popped ? "scale(1.15)" : "scale(1)" }}>{fmt(count)}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:st.color }}>{st.label}</div>
                  <div style={{ fontSize:12.5, fontWeight:700, color:st.color, marginBottom:2 }}>「{stanceLbl[s]}」</div>
                  <div style={{ fontSize:12, color:st.color, opacity:0.8 }}>{p}%</div>
                </div>
              );
            })}
          </div>

          <StanceBar pro={d.pro} con={d.con} height={10} showLabels />
          <p style={{ fontSize:12, color:"var(--text-4)", textAlign:"center", marginTop:8 }}>計 {fmt(total)} 票</p>

          {/* 結果予想（締切時点でどちらが多数派になるか。自分の投票とは独立）*/}
          <div style={{ marginTop:20, padding:"14px 16px", background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10, flexWrap:"wrap" }}>
              <Icn icon={Trophy} size={15} style={{ color:"#b45309" }}/>
              <h4 style={{ fontWeight:700, fontSize:13, color:"var(--text-2)" }}>結果予想</h4>
              <span style={{ fontSize:11, color:"var(--text-4)" }}>締切時点で多数派になるのは？</span>
            </div>
            {decided ? (
              <div>
                <p style={{ fontSize:13, color:"var(--text-2)", marginBottom: myPred ? 9 : 0 }}>
                  結果：<strong style={{ color:STANCE[winner].color }}>「{stanceLbl[winner]}」が多数</strong>（{winner==="pro"?proP:conP}%）
                </p>
                {myPred && (
                  <div style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, fontWeight:800,
                    color: myPred.correct ? "#16a34a" : STANCE.con.color }}>
                    <Icn icon={myPred.correct ? CheckCircle2 : X} size={16}/>
                    あなたの予想「{STANCE[myPred.side].label}が多数」は{myPred.correct ? `的中！ +${PRED_AWARD}XP` : "外れ"}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ display:"flex", gap:10 }}>
                  {(["pro","con"] as const).map(s => {
                    const sel = myPred?.side === s, st = STANCE[s];
                    return (
                      <button key={s} onClick={()=>onPredict?.(d.id, s)}
                        style={{ flex:1, padding:"10px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontWeight:800, fontSize:13,
                          background: sel ? st.bg : "var(--surface)", color: sel ? st.color : "var(--text-3)",
                          border:`1.5px solid ${sel ? st.border : "var(--border)"}`, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all .15s" }}>
                        <Icn icon={st.Icon} size={15}/> {st.label}が多数
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize:11, color:"var(--text-4)", marginTop:8 }}>
                  {myPred ? "予想を記録しました。締切まで変更できます。" : "自分の投票とは別に、結果を予想して的中させよう。"}
                </p>
              </>
            )}
          </div>

          {!locked && (
            <div style={{ marginTop:18, padding:"14px 18px", borderRadius:12, border:"1.5px dashed var(--border)", textAlign:"center" }}>
              <p style={{ fontSize:14, fontWeight:700, color:"var(--text-2)", marginBottom:10 }}>
                {d.userStance ? `あなたは「${STANCE[d.userStance].label}」を選択しています` : "あなたはどちら？"}
              </p>
              <StancePicker current={d.userStance} onChange={s=>dispatch({type:"SET_STANCE",id:d.id,stance:s})} labels={stanceLbl} />
              {!isAuthed && <p style={{ fontSize:12, color:"var(--text-4)", marginTop:8 }}>投票にはログインが必要です</p>}
              {d.userStance && <p style={{ fontSize:12, color:"var(--text-4)", marginTop:8 }}>もう一度クリックで取り消し</p>}
              <p style={{ fontSize:12, color:"var(--text-4)", marginTop:8, lineHeight:1.6 }}>
                期間内なら、立場は何度でも変えられます。良い意見を取り入れて考えが変わるのは、悪いことじゃない。
              </p>
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
            <button style={{...cActBtn, display:"inline-flex", alignItems:"center", gap:5}}><Icn icon={MessageCircle} size={14}/> {fmt(d.commentCount)} コメント</button>
            <button onClick={onShare} style={{...cActBtn, display:"inline-flex", alignItems:"center", gap:5}}><Icn icon={Share2} size={14}/> シェア</button>
            <button onClick={()=>dispatch({type:"SAVE",id:d.id})}
              title={isAuthed ? undefined : "保存にはログインが必要です"}
              style={{...cActBtn, color:d.saved?STANCE.pro.color:"inherit", display:"inline-flex", alignItems:"center", gap:5}}>
              <Icn icon={Bookmark} size={14} fill={d.saved?"currentColor":"none"}/> {d.saved?"保存済み":"保存"}
            </button>
            <button onClick={()=>dispatch({type:"OPEN_REPORT",target:{kind:"debate",label:`ディベート「${d.title}」`}})}
              title={isAuthed ? undefined : "通報にはログインが必要です"}
              style={{...cActBtn, display:"inline-flex", alignItems:"center", gap:5}}><Icn icon={Flag} size={14}/> 通報</button>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {d.aiSummary && <AISummary summary={d.aiSummary} />}

      {/* スレッドの読み方ガイド */}
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:12,
        padding:"10px 14px", background:"var(--surface-2)", border:"1px dashed var(--border)", borderRadius:10,
        fontSize:12, color:"var(--text-3)" }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontWeight:700, color:STANCE.pro.color }}><Icn icon={ThumbsUp} size={13}/>左＝賛成</span>
        <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontWeight:700, color:STANCE.con.color }}><Icn icon={ThumbsDown} size={13}/>右＝反対</span>
        <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><Icn icon={CornerUpLeft} size={13}/>各行は前の発言への返信・反論です</span>
        <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><Icn icon={Heart} size={13}/>投票と、個々のコメントへの共感は別。反対派でも良い賛成意見にいいねしていい</span>
      </div>

      <SplitComments d={d} dispatch={dispatch} />

      {/* 投票推移グラフ（詳細データは下部に格納。根幹はコメント） */}
      <div style={{ marginBottom:20 }}>
        <button onClick={()=>setShowGraph(!showGraph)}
          style={{ display:"flex", alignItems:"center", gap:6, width:"100%", justifyContent:"center",
            background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10,
            padding:"10px 14px", cursor:"pointer", fontFamily:"inherit",
            fontSize:13, fontWeight:700, color:"var(--text-3)" }}>
          <Icn icon={TrendingUp} size={15}/> 投票推移を見る
          <Icn icon={showGraph ? ChevronUp : ChevronDown} size={15}/>
        </button>
        {showGraph && (
          <div style={{ marginTop:8, padding:"16px 18px", background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:12 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <h4 style={{ fontWeight:700, fontSize:13, color:"var(--text-2)", display:"flex", alignItems:"center", gap:6 }}>
                <Icn icon={TrendingUp} size={15}/> 投票推移グラフ
              </h4>
              <div style={{ display:"flex", gap:10, fontSize:11 }}>
                <span style={{ display:"flex", alignItems:"center", gap:4, color:STANCE.pro.color, fontWeight:700 }}>
                  <span style={{ width:10, height:2, background:STANCE.pro.color, display:"inline-block" }}></span> 賛成
                </span>
                <span style={{ display:"flex", alignItems:"center", gap:4, color:STANCE.con.color, fontWeight:700 }}>
                  <span style={{ width:10, height:2, background:STANCE.con.color, display:"inline-block" }}></span> 反対
                </span>
              </div>
            </div>
            <VoteHistoryGraph history={d.history} createdAt={d.createdAt} />
          </div>
        )}
      </div>

      {/* Related */}
      <RelatedDebates current={d} all={allDebates} dispatch={dispatch} />
    </div>
  );
}

// ─── Debate Card ─────────────────────────────────────────────────
export function DebateCard({ d, dispatch }) {
  const { isAuthed } = useContext(AppContext);
  const topic = TOPICS.find(t=>t.id===d.topicId);
  const { proP, conP } = pct(d.pro, d.con);
  const total = d.pro + d.con;
  const locked = d.status === "closed";
  const stanceLbl = {
    pro: d.proLabel || suggestStanceLabels(d.title).pro,
    con: d.conLabel || suggestStanceLabels(d.title).con,
  };

  return (
    <div onClick={()=>dispatch({type:"SET_ACTIVE",debate:d})}
      style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden",
        cursor:"pointer", transition:"box-shadow .15s, transform .15s", opacity: locked ? 0.85 : 1 }}
      onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 4px 24px rgba(0,0,0,0.07)"; e.currentTarget.style.transform="translateY(-2px)"; }}
      onMouseLeave={e=>{ e.currentTarget.style.boxShadow=""; e.currentTarget.style.transform=""; }}>
      <div style={{ display:"flex", height:5 }}>
        <div style={{ flex:d.pro, background:STANCE.pro.bar, transition:"flex .5s" }} />
        <div style={{ flex:d.con, background:STANCE.con.bar, transition:"flex .5s" }} />
      </div>
      {d.thumbnail && (
        <img src={d.thumbnail} alt="" style={{ width:"100%", height:160, objectFit:"cover", display:"block" }} />
      )}
      <div style={{ padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, background:"var(--surface-3)", color:"var(--text-2)", padding:"2px 8px", borderRadius:99, fontWeight:600, display:"inline-flex", alignItems:"center", gap:4 }}>{topic && <Icn icon={topic.Icon} size={12}/>} {topic?.name}</span>
          <button onClick={e=>{e.stopPropagation();dispatch({type:"SET_USER",author:d.author});}}
            style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:11, color:"var(--text-4)", fontFamily:"inherit" }}>@{d.author}</button>
          <span style={{ fontSize:11, color:"var(--text-4)" }}>• {ago(d.createdAt)}</span>
          <StatusBadge status={d.status} deadline={d.deadline} />
          {d.userStance && <StanceBadge stance={d.userStance} />}
          {d.saved && <Icn icon={Bookmark} size={12} fill="currentColor" style={{ color:STANCE.pro.color }}/>}
        </div>
        <h3 style={{ fontSize:18.5, fontWeight:800, color:"var(--text)", lineHeight:1.35, marginBottom:14, letterSpacing:-0.3 }}>{d.title}</h3>
        <div style={{ display:"flex", alignItems:"center", marginBottom:10 }}>
          <div style={{ flex:1, display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ fontSize:13, color:STANCE.pro.color, fontWeight:800, display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={ThumbsUp} size={13}/> {fmt(d.pro)}</span>
            <span style={{ fontSize:12, color:"#93c5fd", fontWeight:600 }}>{proP}%</span>
          </div>
          <div style={{ fontSize:11, color:"var(--border-2)", fontWeight:600 }}>{fmt(total)}票</div>
          <div style={{ flex:1, textAlign:"right", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4 }}>
            <span style={{ fontSize:12, color:"#fca5a5", fontWeight:600 }}>{conP}%</span>
            <span style={{ fontSize:13, color:STANCE.con.color, fontWeight:800, display:"inline-flex", alignItems:"center", gap:4 }}>{fmt(d.con)} <Icn icon={ThumbsDown} size={13}/></span>
          </div>
        </div>
        <StanceBar pro={d.pro} con={d.con} height={8} />
        {(d.tags || []).length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:12 }}>
            {d.tags.map(t => (
              <button key={t} onClick={e=>{e.stopPropagation();dispatch({type:"SET_TAG",tag:t});}}
                style={{ background:STANCE.pro.light, color:STANCE.pro.color, border:`1px solid ${STANCE.pro.border}`,
                  borderRadius:99, padding:"2px 10px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                #{t}
              </button>
            ))}
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14, flexWrap:"wrap", gap:8 }}>
          <div onClick={e=>e.stopPropagation()}>
            <StancePicker current={d.userStance} onChange={s=>dispatch({type:"SET_STANCE",id:d.id,stance:s})} size="sm" disabled={locked} labels={stanceLbl} />
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ fontSize:12, color:"var(--text-4)", display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={MessageCircle} size={13}/> {fmt(d.commentCount)}</span>
            <button title={isAuthed ? "通報" : "通報にはログインが必要です"} onClick={e=>{e.stopPropagation();dispatch({type:"OPEN_REPORT",target:{kind:"debate",label:`ディベート「${d.title}」`}});}}
              style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", color:"var(--border-2)" }}><Icn icon={Flag} size={15}/></button>
            <button title={isAuthed ? (d.saved?"保存を解除":"保存") : "保存にはログインが必要です"} onClick={e=>{e.stopPropagation();dispatch({type:"SAVE",id:d.id});}}
              style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", color:d.saved?STANCE.pro.color:"var(--border-2)" }}>
              <Icn icon={Bookmark} size={15} fill={d.saved?"currentColor":"none"}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New Debate Modal ─────────────────────────────────────────────
export function NewDebateModal({ dispatch }) {
  const { debates, myRep, me, notify } = useContext(AppContext);
  const guard = useTypingGuard(notify);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [topicId, setTopicId] = useState("t1");
  const [duration, setDuration] = useState(7); // days
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [thumbnail, setThumbnail] = useState(null);
  // 立場ラベル（空ならタイトルからの自動サジェストを採用）
  const [proLabel, setProLabel] = useState("");
  const [conLabel, setConLabel] = useState("");
  const suggested = suggestStanceLabels(title);

  const perk = perkOf(myRep);
  const usedPosts = myUsage(debates, me).posts;
  const overQuota = usedPosts >= perk.debates;

  // 過去に使われた全ハッシュタグ（候補用）
  const allTags = useMemo(() => {
    const set = new Set<string>();
    debates.forEach(d => (d.tags || []).forEach(t => set.add(t)));
    return [...set];
  }, [debates]);
  const suggestions = (tagInput.trim()
    ? allTags.filter(t => t.includes(tagInput.trim()) && !tags.includes(t))
    : allTags.filter(t => !tags.includes(t))
  ).slice(0, 8);

  const addTag = (raw) => {
    const t = raw.trim().replace(/^#/, "");
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };
  const onTagKey = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === ",") { e.preventDefault(); addTag(tagInput); }
    else if (e.key === "Backspace" && !tagInput && tags.length) setTags(tags.slice(0, -1));
  };
  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setThumbnail(reader.result);
    reader.readAsDataURL(f);
  };

  const submit = () => {
    if (!title.trim() || overQuota) return;
    dispatch({ type:"ADD_DEBATE", debate:{
      id:Date.now(), topicId, title:title.trim(), description:desc.trim(),
      pro:0, con:0, status:"active",
      deadline: Date.now() + duration*24*3600*1000,
      commentCount:0, createdAt:new Date(), author:me, saved:false, userStance:null,
      tags, thumbnail,
      proLabel: (proLabel.trim() || suggested.pro), conLabel: (conLabel.trim() || suggested.con),
      history: [{ t:0, pro:0, con:0, hour:0 }],
      aiSummary: null,
      proComments:[], conComments:[],
      integrity: guard.snapshot((title.trim() + desc.trim()).length),
    }});
    guard.reset();
    dispatch({ type:"TOGGLE_NEW" });
  };

  return (
    <div onClick={()=>dispatch({type:"TOGGLE_NEW"})}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"var(--surface)", borderRadius:16, width:"100%", maxWidth:520, padding:28, display:"flex", flexDirection:"column", gap:16, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontWeight:800, fontSize:20, color:"var(--text)" }}>ディベートを作成</h3>
          <button title="閉じる" onClick={()=>dispatch({type:"TOGGLE_NEW"})} style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", color:"var(--text-4)" }}><Icn icon={X} size={20}/></button>
        </div>
        <div>
          <label style={labelStyle}>トピック</label>
          <select value={topicId} onChange={e=>setTopicId(e.target.value)} style={inputStyle}>
            {TOPICS.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>テーマ・問い <span style={{color:STANCE.con.color}}>*</span></label>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="例：AIは社会にとって脅威か？" style={inputStyle} maxLength={120} {...guard.bind} />
          <div style={{ fontSize:12, color:"var(--text-4)", textAlign:"right", marginTop:2 }}>{title.length}/120</div>
        </div>
        <div>
          <label style={labelStyle}>立場ラベル（任意・賛成/反対が何を意味するか）</label>
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:11, color:STANCE.pro.color, fontWeight:700, marginBottom:3, display:"flex", alignItems:"center", gap:4 }}><Icn icon={ThumbsUp} size={11}/> 賛成 ＝</p>
              <input value={proLabel} onChange={e=>setProLabel(e.target.value)} placeholder={suggested.pro} maxLength={20}
                aria-label="賛成の意味" style={{ ...inputStyle, borderColor:STANCE.pro.border }} />
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:11, color:STANCE.con.color, fontWeight:700, marginBottom:3, display:"flex", alignItems:"center", gap:4 }}><Icn icon={ThumbsDown} size={11}/> 反対 ＝</p>
              <input value={conLabel} onChange={e=>setConLabel(e.target.value)} placeholder={suggested.con} maxLength={20}
                aria-label="反対の意味" style={{ ...inputStyle, borderColor:STANCE.con.border }} />
            </div>
          </div>
          <p style={{ fontSize:11, color:"var(--text-4)", marginTop:4 }}>空欄ならタイトルから自動で設定されます。</p>
        </div>
        <div>
          <label style={labelStyle}>概要・背景 (任意)</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} {...guard.bind}
            placeholder="このテーマについての背景や論点を説明してください…"
            style={{ ...inputStyle, resize:"vertical" }} />
        </div>
        <div>
          <label style={labelStyle}>ハッシュタグ (任意)</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center",
            border:"1px solid var(--border)", borderRadius:8, padding:"7px 10px", background:"var(--surface-2)" }}>
            {tags.map(t => (
              <span key={t} style={{ display:"inline-flex", alignItems:"center", gap:4,
                background:STANCE.pro.bg, color:STANCE.pro.color, border:`1px solid ${STANCE.pro.border}`,
                borderRadius:99, padding:"2px 8px", fontSize:12, fontWeight:700 }}>
                #{t}
                <button onClick={()=>setTags(tags.filter(x=>x!==t))}
                  style={{ background:"none", border:"none", cursor:"pointer", color:STANCE.pro.color, padding:0, display:"inline-flex" }}><Icn icon={X} size={13}/></button>
              </span>
            ))}
            <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={onTagKey}
              placeholder={tags.length ? "" : "例：AI　Enterで追加"}
              style={{ flex:1, minWidth:120, border:"none", outline:"none", background:"none", fontSize:14, fontFamily:"inherit", color:"var(--text)" }} />
          </div>
          {suggestions.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
              <span style={{ fontSize:11, color:"var(--text-4)", alignSelf:"center" }}>候補:</span>
              {suggestions.map(t => (
                <button key={t} onClick={()=>addTag(t)}
                  style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:99, padding:"2px 10px",
                    fontSize:12, fontWeight:600, color:"var(--text-3)", cursor:"pointer", fontFamily:"inherit" }}>
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>サムネイル画像 (任意)</label>
          {thumbnail ? (
            <div style={{ position:"relative", borderRadius:10, overflow:"hidden", border:"1px solid var(--border)" }}>
              <img src={thumbnail} alt="サムネイル" style={{ width:"100%", maxHeight:180, objectFit:"cover", display:"block" }} />
              <button onClick={()=>setThumbnail(null)} title="画像を削除"
                style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", color:"#fff",
                  border:"none", borderRadius:99, width:26, height:26, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center" }}><Icn icon={X} size={14}/></button>
            </div>
          ) : (
            <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
              padding:"20px 12px", border:"1.5px dashed var(--border-2)", borderRadius:10, cursor:"pointer",
              background:"var(--surface-2)", color:"var(--text-4)", fontSize:13, fontWeight:600 }}>
              <Icn icon={ImageIcon} size={24}/>
              クリックして画像を選択
              <input type="file" accept="image/*" onChange={onFile} style={{ display:"none" }} />
            </label>
          )}
        </div>
        <div>
          <label style={labelStyle}>投票期間</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {[1,3,7,14,30].map(days => (
              <button key={days} onClick={()=>setDuration(days)}
                style={{ padding:"6px 14px", borderRadius:99,
                  border:`1.5px solid ${duration===days?STANCE.pro.border:"var(--border)"}`,
                  background:duration===days?STANCE.pro.bg:"var(--surface)",
                  color:duration===days?STANCE.pro.color:"var(--text-3)",
                  fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                {days}日
              </button>
            ))}
          </div>
          <p style={{ fontSize:11, color:"var(--text-4)", marginTop:6 }}>期間終了後は自動で決着フェーズに移行します</p>
        </div>
        <div style={{ background:STANCE.pro.bg, border:`1px solid ${STANCE.pro.border}`, borderRadius:10, padding:"12px 14px", fontSize:13, color:STANCE.pro.color, display:"flex", gap:8, alignItems:"flex-start" }}>
          <Icn icon={Lightbulb} size={16} style={{ marginTop:1 }}/><span>良いディベートテーマは「〇〇は△△か？」のように賛否を問える形が効果的です。</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, fontWeight:700,
          color: overQuota ? STANCE.con.color : "var(--text-4)" }}>
          <span>今月の作成数 {usedPosts}/{perk.debates}（{getBadge(myRep).label}）</span>
          {overQuota && <span>上限に達しました</span>}
        </div>
        {overQuota && (
          <div style={{ background:STANCE.con.bg, border:`1px solid ${STANCE.con.border}`, borderRadius:8,
            padding:"8px 12px", fontSize:12, color:STANCE.con.color, fontWeight:600 }}>
            今月のディベート作成上限に達しました。ランクが上がると作成できる数が増えます。
          </div>
        )}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={()=>dispatch({type:"TOGGLE_NEW"})} style={btnGhost}>キャンセル</button>
          <button onClick={submit} disabled={!title.trim() || overQuota} style={btnPrimary}>作成する</button>
        </div>
      </div>
    </div>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────
export function ReportModal({ target, dispatch }) {
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState("");
  const submit = () => {
    if (!reason) return;
    dispatch({ type:"REPORT", target, reason, detail: detail.trim() });
    alert("通報を受け付けました。ご協力ありがとうございます。");
  };
  return (
    <div onClick={()=>dispatch({type:"CLOSE_REPORT"})}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"var(--surface)", borderRadius:16, width:"100%", maxWidth:460, padding:26, display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h3 style={{ fontWeight:800, fontSize:18, color:"var(--text)", display:"flex", alignItems:"center", gap:7 }}><Icn icon={Flag} size={18}/> 通報する</h3>
          <button title="閉じる" onClick={()=>dispatch({type:"CLOSE_REPORT"})} style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", color:"var(--text-4)" }}><Icn icon={X} size={18}/></button>
        </div>
        <p style={{ fontSize:13, color:"var(--text-3)" }}>対象: <strong style={{ color:"var(--text-2)" }}>{target?.label}</strong></p>
        <div>
          <label style={labelStyle}>通報理由 <span style={{color:STANCE.con.color}}>*</span></label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {REPORT_REASONS.map(r => (
              <button key={r} onClick={()=>setReason(r)}
                style={{ textAlign:"left", padding:"9px 14px", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                  border:`1.5px solid ${reason===r ? STANCE.con.border : "var(--border)"}`,
                  background: reason===r ? STANCE.con.bg : "var(--surface)",
                  color: reason===r ? STANCE.con.color : "var(--text-2)",
                  fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
                <Icn icon={reason===r ? CircleDot : Circle} size={15}/>{r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>詳細 (任意)</label>
          <textarea value={detail} onChange={e=>setDetail(e.target.value)} rows={3}
            placeholder="具体的な内容があれば記載してください…"
            style={{ ...inputStyle, resize:"vertical" }} />
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={()=>dispatch({type:"CLOSE_REPORT"})} style={btnGhost}>キャンセル</button>
          <button onClick={submit} disabled={!reason}
            style={{ ...btnPrimary, background:STANCE.con.color }}>通報する</button>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────
// ─── 通知ベル（#3+#7）──────────────────────────────────────────────
export function NotificationBell({ notifs, me, onOpen }: { notifs: Notif[]; me: string | null; onOpen: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0); // markSeen 後の再描画トリガ
  const seen = getSeen(me);
  const unread = me ? notifs.filter(n => !seen.has(n.id)).length : 0;
  const sorted = [...notifs]
    .sort((a, b) => (seen.has(a.id) ? 1 : 0) - (seen.has(b.id) ? 1 : 0) || b.ts - a.ts)
    .slice(0, 30);
  const iconFor: Record<string, any> = { reply: CornerUpLeft, like: Heart, deadline: Clock, result: Trophy };
  const colorFor: Record<string, string> = { reply: STANCE.pro.color, like: "#e11d48", deadline: "#b45309", result: "#b45309" };
  const toggle = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && me) { markSeen(me, notifs.map(n => n.id)); bump(x => x + 1); }
  };
  return (
    <div style={{ position: "relative" }}>
      <button onClick={toggle} aria-label="通知" title="通知"
        style={{ position: "relative", width: 38, height: 38, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)" }}>
        <Icn icon={Bell} size={18} />
        {unread > 0 && (
          <span style={{ position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 99, background: STANCE.con.color, color: "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", right: 0, top: 46, width: 320, maxHeight: 420, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,.16)", zIndex: 41 }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--text)" }}>通知</div>
            {sorted.length === 0 ? (
              <div style={{ padding: "28px 14px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>通知はまだありません</div>
            ) : sorted.map(n => {
              const isUnread = !seen.has(n.id);
              const when = n.ts <= Date.now() ? ago(n.ts) : "";
              return (
                <button key={n.id} onClick={() => { onOpen(n.debateId); setOpen(false); }}
                  style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", background: isUnread ? "var(--surface-2)" : "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", alignItems: "flex-start" }}>
                  <Icn icon={iconFor[n.type]} size={16} style={{ color: colorFor[n.type], marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{n.text}</p>
                    {when && <p style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{when}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 今日の論題: 管理者の手動上書き（折衷案 C）──────────────────────
function DailyTopicAdmin({ debates }) {
  const [override, setOverride] = useState<number | null>(null);
  const [sel, setSel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => { getDailyOverride().then(v => { setOverride(v); setSel(v != null ? String(v) : ""); }); }, []);
  const auto = pickDailyDebate(debates, todayStr(), null);
  const current = override != null ? debates.find(d => d.id === override) : auto;
  const card = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px" };
  const save = async (id: number | null) => {
    setBusy(true);
    const ok = await setDailyOverride(id);
    setBusy(false);
    if (ok) { setOverride(id); setSavedAt(Date.now()); }
    else alert("保存に失敗しました（管理者権限が必要です）");
  };
  return (
    <div style={{ ...card, marginBottom:18 }}>
      <p style={{ fontSize:13, fontWeight:800, color:"var(--text)", display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
        <Icn icon={Sparkles} size={15} style={{ color:"#b45309" }}/> 今日の論題
      </p>
      <p style={{ fontSize:12, color:"var(--text-4)", marginBottom:10 }}>
        未指定の日は「勢いのある論題」から自動で日替わり表示。ここで今日の1問を上書きできます。
      </p>
      <p style={{ fontSize:12, color:"var(--text-3)", marginBottom:10 }}>
        現在の今日の論題: <strong style={{ color:"var(--text)" }}>{current ? current.title : "—"}</strong>
        <span style={{ marginLeft:6, color: override != null ? "#b45309" : "var(--text-4)" }}>（{override != null ? "手動指定" : "自動"}）</span>
      </p>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <select value={sel} onChange={e=>setSel(e.target.value)} style={{ ...inputStyle, maxWidth:380, flex:1 }}>
          <option value="">（自動に任せる）</option>
          {debates.filter(d => d.status !== "closed").map(d => (
            <option key={d.id} value={String(d.id)}>{d.title}</option>
          ))}
        </select>
        <button disabled={busy} onClick={()=>save(sel ? Number(sel) : null)} style={{ ...btnPrimary, opacity:busy?0.6:1 }}>
          {busy ? "保存中…" : "この1問に設定"}
        </button>
        {override != null && (
          <button disabled={busy} onClick={()=>{ setSel(""); save(null); }} style={{ ...btnGhost, padding:"9px 16px" }}>自動に戻す</button>
        )}
        {savedAt > 0 && <span style={{ fontSize:12, color:"#16a34a", fontWeight:700 }}>✓ 保存しました</span>}
      </div>
    </div>
  );
}

export function AdminPage({ debates, reports, bannedUsers, dispatch }) {
  const [tab, setTab] = useState("debates");
  const openReports = reports.filter(r => r.status === "open").length;

  // 全ユーザーを集計
  const users = useMemo(() => {
    const map: Record<string, any> = {};
    const touch = (a) => { if (!map[a]) map[a] = { author:a, posts:0, comments:0, likes:0 }; return map[a]; };
    for (const d of debates) {
      touch(d.author).posts++;
      for (const b of allBubbles([d])) { const u = touch(b.author); u.comments++; u.likes += (b.score || 0); }
    }
    return Object.values(map).sort((a,b) => b.likes - a.likes);
  }, [debates]);

  // 手打ち計測（integrityを持つ投稿を集約。管理者のみ参照）
  const handwritten = useMemo(() => {
    const rows: any[] = [];
    for (const d of debates) {
      if (d.integrity) rows.push({ kind:"ディベート", author:d.author, body:d.title, integrity:d.integrity, debate:d.title });
      for (const c of [...d.proComments, ...d.conComments]) {
        if (c.integrity) rows.push({ kind:"コメント", author:c.author, body:c.body, integrity:c.integrity, debate:d.title });
        for (const r of (c.replies||[])) if (r.integrity) rows.push({ kind:"返信", author:r.author, body:r.body, integrity:r.integrity, debate:d.title });
      }
    }
    return rows.sort((a,b) => (a.integrity.verdict==="review"?0:1) - (b.integrity.verdict==="review"?0:1));
  }, [debates]);
  const reviewCount = handwritten.filter(r => r.integrity?.verdict === "review").length;

  const tabBtn = (id, icon, label, badge) => (
    <button onClick={()=>setTab(id)}
      style={{ padding:"8px 16px", borderRadius:99, border:"none", cursor:"pointer", fontFamily:"inherit",
        background: tab===id ? "var(--btn-active)" : "var(--surface)", color: tab===id ? "#fff" : "var(--text-2)",
        fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6, boxShadow:"0 1px 2px rgba(0,0,0,.04)" }}>
      <Icn icon={icon} size={14}/>{label}{badge>0 && <span style={{ background:STANCE.con.color, color:"#fff", fontSize:10, borderRadius:99, padding:"1px 6px" }}>{badge}</span>}
    </button>
  );
  const card = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"14px 16px" };
  const delBtn = { background:STANCE.con.bg, color:STANCE.con.color, border:`1px solid ${STANCE.con.border}`, borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
        <Icn icon={Shield} size={22}/>
        <h2 style={{ fontSize:22, fontWeight:800, color:"var(--text)" }}>管理者ダッシュボード</h2>
        <button onClick={()=>dispatch({type:"SET_ADMIN",on:false})} style={{ ...btnGhost, marginLeft:"auto", padding:"7px 16px", display:"inline-flex", alignItems:"center", gap:5 }}><Icn icon={ArrowLeft} size={15}/> 戻る</button>
      </div>

      {/* 概要 */}
      <div style={{ display:"flex", gap:12, marginBottom:18, flexWrap:"wrap" }}>
        {[["ディベート", debates.length, "#2563eb"],["通報 (未対応)", openReports, STANCE.con.color],["ユーザー", users.length, "#7c3aed"],["制限中", bannedUsers.length, "#b45309"]].map(([l,v,c])=>(
          <div key={l} style={{ ...card, flex:1, minWidth:120 }}>
            <p style={{ fontSize:12, color:"var(--text-3)", fontWeight:600 }}>{l}</p>
            <p style={{ fontSize:26, fontWeight:800, color:c }}>{v}</p>
          </div>
        ))}
      </div>

      <DailyTopicAdmin debates={debates} />

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {tabBtn("debates",ClipboardList,"投稿管理",0)}
        {tabBtn("reports",Flag,"通報管理",openReports)}
        {tabBtn("users",Users,"ユーザー管理",0)}
        {tabBtn("integrity",PenLine,"手打ち",reviewCount)}
      </div>

      {tab==="debates" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {debates.map(d => (
            <div key={d.id} style={{ ...card, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.title}</p>
                <p style={{ fontSize:12, color:"var(--text-4)", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>@{d.author} ・ <span style={{display:"inline-flex",alignItems:"center",gap:3}}><Icn icon={MessageCircle} size={12}/>{d.commentCount}</span> ・ <span style={{display:"inline-flex",alignItems:"center",gap:3}}><Icn icon={ThumbsUp} size={12}/>{d.pro}</span> <span style={{display:"inline-flex",alignItems:"center",gap:3}}><Icn icon={ThumbsDown} size={12}/>{d.con}</span></p>
              </div>
              <button onClick={()=>{ if(confirm(`「${d.title}」を削除しますか？`)) dispatch({type:"ADMIN_DELETE_DEBATE",id:d.id}); }} style={delBtn}>削除</button>
            </div>
          ))}
        </div>
      )}

      {tab==="reports" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {reports.length===0 && <div style={{ ...card, textAlign:"center", color:"var(--text-4)" }}>通報はありません</div>}
          {[...reports].reverse().map(r => (
            <div key={r.id} style={{ ...card, borderLeft:`3px solid ${r.status==="open"?STANCE.con.color:"var(--border-2)"}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:700, color:STANCE.con.color, background:STANCE.con.bg, padding:"2px 8px", borderRadius:99 }}>{r.reason}</span>
                <span style={{ fontSize:12, color:"var(--text-3)" }}>{r.target?.label}</span>
                <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, color: r.status==="open"?"#b45309":"#16a34a" }}>
                  {r.status==="open"?"未対応":r.status==="dismissed"?"却下":"対応済"}
                </span>
              </div>
              {r.detail && <p style={{ fontSize:13, color:"var(--text-2)", marginBottom:8 }}>{r.detail}</p>}
              {r.status==="open" && (
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={()=>dispatch({type:"ADMIN_RESOLVE_REPORT",id:r.id,status:"resolved"})} style={{ ...delBtn, background:"var(--green-bg)", color:"#16a34a", borderColor:"#bbf7d0" }}>対応済みにする</button>
                  <button onClick={()=>dispatch({type:"ADMIN_RESOLVE_REPORT",id:r.id,status:"dismissed"})} style={{ ...delBtn, background:"var(--surface-3)", color:"var(--text-3)", borderColor:"var(--border)" }}>却下</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="users" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {users.map(u => {
            const banned = bannedUsers.includes(u.author);
            const b = getBadge(repOf(u.author));
            return (
              <div key={u.author} style={{ ...card, display:"flex", alignItems:"center", gap:12, opacity: banned?0.6:1 }}>
                <Icn icon={b.Icon} size={16} style={{ color:b.color }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}>@{u.author} {banned && <span style={{ fontSize:11, color:"#b45309", fontWeight:700, display:"inline-flex", alignItems:"center", gap:3 }}><Icn icon={Ban} size={12}/> 制限中</span>}</p>
                  <p style={{ fontSize:12, color:"var(--text-4)", display:"flex", alignItems:"center", gap:5 }}>投稿 {u.posts} ・ コメント {u.comments} ・ <span style={{display:"inline-flex",alignItems:"center",gap:3}}><Icn icon={Heart} size={12} fill="currentColor"/> {u.likes}</span></p>
                </div>
                <button onClick={()=>dispatch({type:"ADMIN_BAN",author:u.author})}
                  style={banned
                    ? { ...delBtn, background:"var(--green-bg)", color:"#16a34a", borderColor:"#bbf7d0" }
                    : { ...delBtn, background:"var(--amber-bg)", color:"#b45309", borderColor:"#fde68a" }}>
                  {banned ? "制限解除" : "利用制限"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab==="integrity" && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <p style={{ fontSize:12, color:"var(--text-3)", lineHeight:1.6 }}>
            投稿の手打ち計測（管理者のみ表示）。<strong style={{color:STANCE.con.color}}>⚠️要確認</strong>＝貼り付け試行や不自然な速度を検出。完全な判定ではなく参考値です。
          </p>
          {handwritten.length===0 && <div style={{ ...card, textAlign:"center", color:"var(--text-4)" }}>計測データのある投稿はまだありません（新しい投稿から記録されます）</div>}
          {handwritten.map((r,i) => {
            const ng = r.integrity.verdict==="review";
            return (
              <div key={i} style={{ ...card, borderLeft:`3px solid ${ng?STANCE.con.color:"#16a34a"}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, fontWeight:700, color: ng?STANCE.con.color:"#16a34a", background: ng?STANCE.con.bg:"var(--green-bg)", padding:"2px 8px", borderRadius:99 }}>{ng?"⚠️ 要確認":"✅ 手打ち"}</span>
                  <span style={{ fontSize:11, color:"var(--text-4)" }}>{r.kind}・@{r.author}・on「{String(r.debate).slice(0,18)}」</span>
                </div>
                <p style={{ fontSize:13, color:"var(--text-2)", marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.body}</p>
                <div style={{ display:"flex", gap:12, fontSize:11, color:"var(--text-4)", flexWrap:"wrap" }}>
                  <span>{Math.round(r.integrity.ms/1000)}秒</span>
                  <span>{r.integrity.cps} 文字/秒</span>
                  <span>打鍵 {r.integrity.keys}</span>
                  <span>文字 {r.integrity.len}</span>
                  <span style={{ color: r.integrity.pastes>0?STANCE.con.color:"var(--text-4)", fontWeight: r.integrity.pastes>0?700:400 }}>貼付試行 {r.integrity.pastes}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared styles は src/styles.js に分離 ─────────────────────────

// ─── Hero（初見向け説明バナー） ───────────────────────────────────
export function HeroBanner({ onDismiss, onStart }) {
  const steps = [
    { Icon: Target, t: "テーマを選ぶ", d: "賛否を問える話題を探す" },
    { Icon: ThumbsUp, t: "立場を表明", d: "賛成 / 反対を選ぶ" },
    { Icon: MessageCircle, t: "根拠を語る", d: "理由をコメントで" },
    { Icon: BarChart3, t: "分布を見る", d: "賛否がリアルタイムで動く" },
    { Icon: Trophy, t: "決着を見る", d: "期間終了で勝敗が確定" },
  ];
  return (
    <div style={{ position:"relative", marginBottom:16, padding:"24px 24px 20px", borderRadius:16,
      background:"linear-gradient(135deg, var(--pro-bg), var(--con-bg))", border:"1px solid var(--border)" }}>
      <button onClick={onDismiss} title="閉じる" aria-label="説明を閉じる"
        style={{ position:"absolute", top:12, right:12, background:"none", border:"none", cursor:"pointer", color:"var(--text-3)", display:"inline-flex" }}>
        <Icn icon={X} size={18}/>
      </button>
      <h2 style={{ fontSize:30, fontWeight:800, color:"var(--text)", letterSpacing:-0.6, lineHeight:1.25, marginBottom:8 }}>
        君の思いを、世界にぶつけよう。
      </h2>
      <p style={{ fontSize:14, color:"var(--text-2)", lineHeight:1.7, marginBottom:14, maxWidth:560 }}>
        賛成か、反対か。Splitは、あらゆるテーマの賛否がぶつかり合う討論の広場。
        観るだけでも面白い。参加すれば、もっと面白い。
      </p>
      {onStart && (
        <button onClick={onStart} style={{ ...btnPrimary, marginBottom:16, padding:"10px 26px", fontSize:14.5 }}>
          言いたいことがある
        </button>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:10 }}>
        {steps.map((s, i) => (
          <div key={s.t} style={{ display:"flex", alignItems:"flex-start", gap:8, background:"var(--surface)",
            border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", minWidth:0 }}>
            <span style={{ fontSize:11, fontWeight:800, color:"var(--text-4)", flexShrink:0, marginTop:1 }}>{i+1}</span>
            <Icn icon={s.Icon} size={16} style={{ color:"var(--text-3)", marginTop:1 }}/>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:12.5, fontWeight:700, color:"var(--text)" }}>{s.t}</p>
              <p style={{ fontSize:11, color:"var(--text-3)", lineHeight:1.4 }}>{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize:11, color:"var(--text-4)", marginTop:12, display:"flex", alignItems:"center", gap:5 }}>
        <Icn icon={Sparkles} size={12}/> 現在表示中の数値・ユーザーはデモ用のサンプルデータです。
      </p>
    </div>
  );
}

// ─── Skeleton（読み込み中プレースホルダ） ─────────────────────────
export function SkeletonCard() {
  const bar = (w, h = 12, mb = 10) => (
    <div style={{ width:w, height:h, borderRadius:6, marginBottom:mb, background:"var(--surface-3)", animation:"split-pulse 1.2s ease-in-out infinite" }} />
  );
  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden" }} aria-hidden="true">
      <div style={{ height:5, background:"var(--surface-3)" }} />
      <div style={{ padding:"16px 20px" }}>
        {bar("38%", 14)}
        {bar("80%", 18, 16)}
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>{bar("20%")}{bar("20%", 12, 0)}</div>
        {bar("100%", 8, 14)}
        <div style={{ display:"flex", gap:8 }}>{bar("64px", 24, 0)}{bar("64px", 24, 0)}</div>
      </div>
    </div>
  );
}

// ─── Toast（フィードバック通知） ──────────────────────────────────
export function Toast({ toast }) {
  const palette = {
    pro:  { fg:"#1d4ed8", icon: ThumbsUp },
    con:  { fg:"#b91c1c", icon: ThumbsDown },
    info: { fg:"var(--text)", icon: CheckCircle2 },
  }[toast.kind] || { fg:"var(--text)", icon: CheckCircle2 };
  return (
    <div role="status" aria-live="polite" key={toast.id}
      style={{ position:"fixed", left:"50%", bottom:28, zIndex:400, transform:"translateX(-50%)",
        display:"flex", alignItems:"center", gap:8, background:"var(--surface)",
        border:"1px solid var(--border)", boxShadow:"0 8px 28px rgba(0,0,0,.18)",
        borderRadius:99, padding:"10px 18px", fontSize:13.5, fontWeight:700, color:"var(--text)",
        animation:"split-toast-in .22s ease", maxWidth:"90vw" }}>
      <Icn icon={palette.icon} size={16} style={{ color:palette.fg }}/>
      <span>{toast.msg}</span>
    </div>
  );
}

// ─── レベルアップのお祝いモーダル（Duolingo風） ───────────────────
export function LevelUpModal({ badge, onClose }) {
  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:420, padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"var(--surface)", borderRadius:20, width:"100%", maxWidth:340, padding:"32px 26px", textAlign:"center",
          display:"flex", flexDirection:"column", alignItems:"center", gap:6, animation:"split-pop-in .3s ease",
          border:`2px solid ${badge.color}`, boxShadow:`0 18px 50px ${badge.color}55` }}>
        <p style={{ fontSize:13, fontWeight:800, letterSpacing:2, color:badge.color, textTransform:"uppercase" }}>Level Up!</p>
        <div style={{ position:"relative", margin:"6px 0" }}>
          <div style={{ width:96, height:96, borderRadius:"50%", background:badge.color+"1f",
            display:"flex", alignItems:"center", justifyContent:"center", animation:"split-badge-spin .6s ease" }}>
            <Icn icon={badge.Icon} size={52} style={{ color:badge.color }}/>
          </div>
          <Icn icon={Sparkles} size={20} style={{ position:"absolute", top:-2, right:-2, color:"#f59e0b" }}/>
          <Icn icon={Sparkles} size={14} style={{ position:"absolute", bottom:4, left:-4, color:"#f59e0b" }}/>
        </div>
        <p style={{ fontSize:13, color:"var(--text-3)", fontWeight:700 }}>Lv.{badge.tier} にレベルアップ！</p>
        <p style={{ fontSize:24, fontWeight:900, color:badge.color, letterSpacing:-0.5 }}>{badge.label}</p>
        <button onClick={onClose} style={{ ...btnPrimary, background:badge.color, width:"100%", padding:"12px", marginTop:14 }}>
          つづける
        </button>
      </div>
    </div>
  );
}

// ─── 管理者パスコード入力モーダル ─────────────────────────────────
export function AdminGateModal({ onSubmit, onClose }) {
  const [code, setCode] = useState("");
  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:350, padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"var(--surface)", borderRadius:16, width:"100%", maxWidth:380, padding:26, display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <Icn icon={KeyRound} size={20}/>
          <h3 style={{ fontWeight:800, fontSize:17, color:"var(--text)" }}>管理者モード</h3>
          <button onClick={onClose} title="閉じる" aria-label="閉じる" style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"var(--text-4)", display:"inline-flex" }}><Icn icon={X} size={18}/></button>
        </div>
        <p style={{ fontSize:13, color:"var(--text-3)", lineHeight:1.6 }}>管理者パスコードを入力してください。</p>
        <input type="password" autoFocus value={code} onChange={e=>setCode(e.target.value)}
          onKeyDown={e=>{ if (e.key === "Enter") onSubmit(code); }}
          placeholder="パスコード" aria-label="管理者パスコード"
          style={{ ...inputStyle }} />
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={btnGhost}>キャンセル</button>
          <button onClick={()=>onSubmit(code)} disabled={!code} style={btnPrimary}>解錠</button>
        </div>
      </div>
    </div>
  );
}

// ─── ログイン / 新規登録モーダル ──────────────────────────────────
export function AuthModal({ onClose, notify }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "verify"
  const [email, setEmail] = useState("");
  const [email2, setEmail2] = useState(""); // 確認用（打ち間違い防止・コピペ可）
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isSignup = mode === "signup";
  // ユーザー名のリアルタイム検証（入力中にその場でエラーを表示）
  const unameErr = isSignup && username.trim() ? validateUsername(username) : null;
  // メール不一致のリアルタイム検証（両方入力済みのときだけ）
  const emailMismatch = isSignup && email.trim() && email2.trim() && email.trim() !== email2.trim();

  // よくある英語エラーを日本語化
  const jpError = (msg = "") => {
    const m = msg.toLowerCase();
    if (m.includes("invalid login")) return "メールアドレスまたはパスワードが正しくありません";
    if (m.includes("email not confirmed")) return "メール確認が完了していません";
    if (m.includes("already registered") || m.includes("already been registered")) return "このメールアドレスは登録済みです。ログインしてください";
    if (m.includes("at least 6")) return "パスワードは6文字以上にしてください";
    if (m.includes("unable to validate email") || m.includes("invalid email")) return "メールアドレスの形式が正しくありません";
    if (m.includes("database error")) return "サーバー側エラー（profilesテーブル/トリガー未設定の可能性）";
    return msg || "エラーが発生しました";
  };

  const submit = async () => {
    setErr("");
    if (!email.trim() || !password) { setErr("メールとパスワードを入力してください"); return; }
    if (isSignup && !username.trim()) { setErr("ユーザー名を入力してください"); return; }
    if (isSignup) { const ue = validateUsername(username); if (ue) { setErr(ue); return; } }
    if (isSignup && !email2.trim()) { setErr("確認用メールアドレスを入力してください"); return; }
    if (isSignup && email.trim() !== email2.trim()) { setErr("メールアドレスが一致しません"); return; }
    setBusy(true);
    try {
      if (isSignup) {
        const { data, error }: any = await signUp(email.trim(), password, username.trim());
        if (error) { console.error("[auth] signUp", error); setErr(jpError(error.message)); return; }
        // メール確認ON時、登録済みメールには identities が空のダミーuserが返る（情報漏えい防止仕様）
        if (data?.user && !data.session && data.user.identities?.length === 0) {
          setErr("このメールアドレスは既に登録されています。ログインしてください"); return;
        }
        if (data?.session) { notify("アカウントを作成しました"); onClose(); }
        else { setMode("verify"); } // 確認メール送信済み → 専用画面へ
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) { console.error("[auth] signIn", error); setErr(jpError(error.message)); return; }
        notify("ログインしました"); onClose();
      }
    } catch (e) {
      console.error("[auth] submit", e);
      setErr(jpError(e?.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:350, padding:16 }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"var(--surface)", borderRadius:16, width:"100%", maxWidth:400, padding:28, display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:30, height:30, borderRadius:8, overflow:"hidden", display:"flex", flexShrink:0 }}>
            <div style={{ flex:1, background:STANCE.pro.bar }} /><div style={{ flex:1, background:STANCE.con.bar }} />
          </div>
          <h3 style={{ fontWeight:800, fontSize:18, color:"var(--text)" }}>{mode === "verify" ? "メールを確認してください" : isSignup ? "新規登録" : "ログイン"}</h3>
          <button onClick={onClose} title="閉じる" aria-label="閉じる" style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"var(--text-4)", display:"inline-flex" }}><Icn icon={X} size={18}/></button>
        </div>
        {mode === "verify" ? (
          <div style={{ textAlign:"center", padding:"8px 4px 4px" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>📮</div>
            <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", marginBottom:8 }}>確認メールを送信しました</p>
            <p style={{ fontSize:13, color:"var(--text-2)", lineHeight:1.7, marginBottom:6 }}>
              <strong style={{ wordBreak:"break-all" }}>{email.trim()}</strong> 宛のメールに記載された
              リンクをクリックすると登録が完了し、そのままログインされます。
            </p>
            <p style={{ fontSize:11.5, color:"var(--text-4)", lineHeight:1.7, marginBottom:14 }}>
              届かない場合は迷惑メールフォルダを確認してください。
            </p>
            <button onClick={()=>{ setMode("login"); setErr(""); }} style={{ ...btnPrimary, width:"100%", padding:"11px" }}>
              ログイン画面へ
            </button>
          </div>
        ) : (<>
        {isSignup && (
          <div>
            <label style={labelStyle}>ユーザー名</label>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="例: hiro" autoComplete="username"
              aria-label="ユーザー名" maxLength={20}
              style={{ ...inputStyle, ...(unameErr ? { border:`1.5px solid ${STANCE.con.color}` } : {}) }} />
            {unameErr ? (
              <p style={{ fontSize:11, color:STANCE.con.color, fontWeight:700, marginTop:4, display:"flex", alignItems:"center", gap:4 }}>
                <Icn icon={AlertCircle} size={12}/> {unameErr}
              </p>
            ) : (
              <p style={{ fontSize:11, color:"var(--text-4)", marginTop:4 }}>半角英数字と _ で3〜20文字（日本語は使えません）。@ハンドルとして表示されます。</p>
            )}
          </div>
        )}
        <div>
          <label style={labelStyle}>メールアドレス</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
            autoComplete="email" aria-label="メールアドレス" style={inputStyle} />
        </div>
        {isSignup && (
          <div>
            <label style={labelStyle}>メールアドレス（確認用）</label>
            <input type="email" value={email2} onChange={e=>setEmail2(e.target.value)} placeholder="もう一度入力（貼り付け可）"
              autoComplete="email" aria-label="メールアドレス（確認用）"
              style={{ ...inputStyle, ...(emailMismatch ? { border:`1.5px solid ${STANCE.con.color}` } : {}) }} />
            {emailMismatch && (
              <p style={{ fontSize:11, color:STANCE.con.color, fontWeight:700, marginTop:4, display:"flex", alignItems:"center", gap:4 }}>
                <Icn icon={AlertCircle} size={12}/> メールアドレスが一致しません
              </p>
            )}
          </div>
        )}
        <div>
          <label style={labelStyle}>パスワード</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>{ if (e.key === "Enter") submit(); }}
            placeholder="6文字以上" autoComplete={isSignup ? "new-password" : "current-password"} aria-label="パスワード" style={inputStyle} />
        </div>
        {err && (
          <div role="alert" style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:12.5, color:STANCE.con.color,
            fontWeight:600, background:STANCE.con.bg, border:`1px solid ${STANCE.con.border}`, borderRadius:10, padding:"10px 12px" }}>
            <Icn icon={AlertCircle} size={15} style={{ marginTop:1 }}/><span>{err}</span>
          </div>
        )}
        <button onClick={submit} disabled={busy || !!unameErr || !!emailMismatch} style={{ ...btnPrimary, width:"100%", padding:"11px" }}>
          {busy ? "処理中…" : isSignup ? "登録する" : "ログイン"}
        </button>
        <p style={{ fontSize:12.5, color:"var(--text-3)", textAlign:"center" }}>
          {isSignup ? "すでにアカウントをお持ちですか？ " : "アカウントが未登録の方は "}
          <button onClick={()=>{ setMode(isSignup ? "login" : "signup"); setErr(""); }}
            style={{ background:"none", border:"none", cursor:"pointer", color:STANCE.pro.color, fontWeight:700, fontSize:12.5, fontFamily:"inherit", padding:0 }}>
            {isSignup ? "ログイン" : "新規登録"}
          </button>
        </p>
        </>)}
      </div>
    </div>
  );
}
