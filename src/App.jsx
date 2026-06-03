import { useState, useReducer, useMemo, useContext, createContext, useEffect, useRef, useCallback } from "react";
import { isSupabaseConfigured, fetchDebates, syncAction, seedDebates } from "./lib/supabase";
import {
  ThumbsUp, ThumbsDown, Heart, Flag, Bookmark, X, Menu, Search, Moon, Sun, Shield,
  MessageCircle, Clock, Lock, Share2, Link2, Sparkles, Flame, Trophy, Award, Medal,
  Target, BarChart3, TrendingUp, Megaphone, Lightbulb, ClipboardList, Users, Ban, Globe,
  ArrowLeft, ChevronUp, ChevronDown, CornerUpLeft, CornerDownRight, Image as ImageIcon,
  Sprout, Brain, Star, Crown, Cpu, Leaf, BookOpen, HeartPulse, Landmark, Clapperboard,
  Circle, CircleDot, CheckCircle2, AlertCircle, KeyRound,
} from "lucide-react";

// 行内アイコン（テキストと縦中央揃え）。color は currentColor 継承でテーマ追従。
const Icn = ({ icon: I, size = 14, fill = "none", style, ...rest }) => (
  <I size={size} fill={fill} strokeWidth={2} style={{ flexShrink: 0, ...style }} {...rest} />
);

// ─── Topics (芸能・スポーツ追加) ──────────────────────────────────
const TOPICS = [
  { id: "t1", name: "AI・テクノロジー", Icon: Cpu, members: "128k" },
  { id: "t2", name: "環境・気候変動", Icon: Leaf, members: "94k" },
  { id: "t3", name: "教育", Icon: BookOpen, members: "73k" },
  { id: "t4", name: "経済・金融", Icon: BarChart3, members: "61k" },
  { id: "t5", name: "医療・健康", Icon: HeartPulse, members: "55k" },
  { id: "t6", name: "政治・社会", Icon: Landmark, members: "49k" },
  { id: "t7", name: "芸能・スポーツ", Icon: Clapperboard, members: "82k" },
];

// ─── Reputation badge thresholds ─────────────────────────────────
const BADGES = [
  { id: "newbie",   label: "新人",       min: 0,    color: "var(--text-4)", Icon: Sprout },
  { id: "active",   label: "アクティブ", min: 50,   color: "#10b981", Icon: Sparkles },
  { id: "thinker",  label: "論客",       min: 200,  color: "#8b5cf6", Icon: Brain },
  { id: "veteran",  label: "ベテラン",   min: 500,  color: "#f59e0b", Icon: Star },
  { id: "legend",   label: "レジェンド", min: 1500, color: "#ef4444", Icon: Crown },
];

const getBadge = (rep) => {
  return [...BADGES].reverse().find(b => rep >= b.min) || BADGES[0];
};

// 仮想ユーザーのレピュテーション
const USER_REP = {
  "economist_a": 423, "futurist_x": 156, "policy_z": 89, "academic_u": 612,
  "optimist_s": 45, "futurist_c": 287, "artist_r": 134, "dev_p": 38,
  "creative_d": 198, "realist_b": 1632, "worker_y": 67, "data_w": 712,
  "realist_t": 245, "data_v": 388, "worker_e": 102, "analyst_q": 521,
  "economist_f": 1845, "nuke_fan": 891, "engineer_g": 234, "engineer_g2": 156,
  "green_energy": 567, "safety_h": 412, "teacher_i": 178, "student_j": 89,
  "crypto_bull": 345, "economist_k": 1023, "parent_l": 267, "youth_m": 156,
  "tech_observer": 89, "energy_analyst": 567, "edu_reform": 234,
  "crypto_watcher": 123, "digital_rights": 456,
  "celeb_fan": 87, "sports_pro": 423, "balanced_t": 612, "fan_z": 134,
  "あなた": 12,
};

const repOf = (author) => USER_REP[author] ?? 0;

// ─── App context (dispatch / debates / 動的rep を配布) ────────────
const AppContext = createContext({ dispatch: () => {}, debates: [], myRep: 0 });

// ─── Likes / 人気ユーザー ─────────────────────────────────────────
const allBubbles = (debates) => {
  const out = [];
  for (const d of debates) {
    for (const list of [d.proComments, d.conComments]) {
      for (const c of list) {
        out.push(c);
        for (const r of (c.replies || [])) out.push(r);
      }
    }
  }
  return out;
};

const likesReceived = (author, debates) =>
  allBubbles(debates).filter(b => b.author === author).reduce((s, b) => s + (b.score || 0), 0);

const popularUsers = (debates, limit = 5) => {
  const map = {};
  for (const b of allBubbles(debates)) map[b.author] = (map[b.author] || 0) + (b.score || 0);
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([author, likes]) => ({ author, likes }));
};

// ─── ランク / モチベーション ──────────────────────────────────────
const myUsage = (debates) => ({
  posts: debates.filter(d => d.author === "あなた").length,
  comments: allBubbles(debates).filter(b => b.author === "あなた").length,
});

// あなたの rep は活動で動的に増える（投稿/コメント/被いいね）
const computeMyRep = (debates) => {
  const base = USER_REP["あなた"] ?? 0;
  const { posts, comments } = myUsage(debates);
  const likes = likesReceived("あなた", debates);
  return base + posts * 30 + comments * 10 + likes * 5;
};

// ランク別の月間クォータ（badge.id をキーに）
const RANK_PERKS = {
  newbie:  { debates: 2,  comments: 10 },
  active:  { debates: 5,  comments: 30 },
  thinker: { debates: 10, comments: 80 },
  veteran: { debates: 25, comments: 200 },
  legend:  { debates: 9999, comments: 9999 },
};
const perkOf = (rep) => RANK_PERKS[getBadge(rep).id];

// ─── 通報理由 ─────────────────────────────────────────────────────
const REPORT_REASONS = ["スパム・宣伝", "誹謗中傷・嫌がらせ", "虚偽・誤情報", "暴力的・不適切な内容", "その他"];

// ─── 管理者パスコード（暫定ガード） ───────────────────────────────
//  クライアント側の簡易ロック。本番では Supabase Auth + ロール(RLS) に置換すること。
const ADMIN_PASSCODE = "split-admin";

// ─── Vote history (時系列データ) ──────────────────────────────────
const genHistory = (finalPro, finalCon, hours=24) => {
  const points = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const noise = 0.1 + Math.random() * 0.05;
    const pro = Math.floor(finalPro * (t + (Math.random()-0.5)*noise));
    const con = Math.floor(finalCon * (t + (Math.random()-0.5)*noise));
    points.push({ t, pro: Math.max(0,pro), con: Math.max(0,con), hour: Math.floor(hours*t) });
  }
  return points;
};

// ─── Initial debates ─────────────────────────────────────────────
const INIT_DEBATES = [
  {
    id: 1, topicId: "t1",
    title: "AIは人間の雇用を奪うか？",
    description: "生成AIの急速な発展により、ホワイトカラー職を中心に多くの仕事が自動化されるリスクが議論されている。AIは経済全体の生産性を高め新たな雇用を生むのか、それとも格差を拡大させるのか。",
    pro: 1842, con: 2391, status: "active", deadline: Date.now() + 3*24*3600*1000,
    commentCount: 6, createdAt: new Date(Date.now() - 2*3600*1000),
    author: "tech_observer", saved: false, userStance: null,
    tags: ["AI", "雇用", "経済"], thumbnail: null,
    history: genHistory(1842, 2391, 12),
    aiSummary: {
      pro: ["産業革命・IT革命の歴史的前例から長期的には雇用は増える", "AIは単純作業の代替で人間を創造的仕事に解放する", "プロンプトエンジニアなど新職種が既に登場"],
      con: ["過去より変化速度が桁違いに速く社会の適応が追いつかない", "知的労働まで代替されるため既存の対応策が通用しない", "IMF試算で先進国の40%の雇用が影響を受ける"],
    },
    proComments: [
      { id: 101, author: "economist_a", body: "歴史的に見ると、産業革命やIT革命も同様の懸念がありましたが、長期的には新たな雇用が創出されました。AIも同様の流れになるはずです。", score: 412, vote: 0,
        replies: [
          { id: 1011, author: "futurist_x", stance: "pro", body: "スピードが速いからこそ、移行期の支援政策も素早く打てます。技術の普及速度と政策対応速度は別の話です。", score: 187, vote: 0 },
          { id: 1012, author: "policy_z", stance: "con", body: "UBI財源はどこから？理想論では人々は救えません。実装段階で必ず政治的妥協が入り、十分な保護にならない。", score: 98, vote: 0 },
          { id: 1013, author: "academic_u", stance: "pro", body: "実際のデータを見ると、AI導入企業は採用を増やしているケースが多い。恐怖と現実は別物です。", score: 112, vote: 0 },
          { id: 1014, author: "optimist_s", stance: "con", body: "増えているのはAI関連職だけ。汎用的な事務職や中間層の仕事は減少傾向です。データの切り取り方が偏っています。", score: 88, vote: 0 },
        ]
      },
      { id: 102, author: "futurist_c", body: "AIが単純作業を代替することで、人間はより創造的な仕事に集中できます。これは進化であって、脅威ではない。", score: 198, vote: 0,
        replies: [
          { id: 1021, author: "artist_r", stance: "pro", body: "AIはツールです。最終的な判断・意図・文脈の理解は人間にしかできない。クリエイターの仕事はなくならない。", score: 119, vote: 0 },
          { id: 1022, author: "dev_p", stance: "con", body: "ツールと言いますが、自律的に判断・生成する点で過去のツールとは質的に異なります。比較が雑です。", score: 77, vote: 0 },
        ]
      },
      { id: 103, author: "creative_d", body: "プロンプトエンジニアやAIトレーナーなど、すでに新しい仕事が増えています。技術の恩恵を活かすべきです。", score: 134, vote: 0, replies: [] },
    ],
    conComments: [
      { id: 201, author: "realist_b", body: "今回は速度が桁違いです。過去の技術革命と違い、AIは知的労働まで代替できる。社会が適応する時間的余裕がない可能性が高い。", score: 287, vote: 0,
        replies: [
          { id: 2011, author: "worker_y", stance: "con", body: "政策が追いつく前に職を失った人はどうなるんですか？楽観論は恵まれた立場からしか言えない。", score: 156, vote: 0 },
          { id: 2012, author: "data_w", stance: "pro", body: "失った職に固執するより、再訓練と新分野への移行を支援する方が建設的です。歴史はそれを証明しています。", score: 76, vote: 0 },
          { id: 2013, author: "realist_t", stance: "con", body: "スマートフォンは仕事を奪いませんでした。AIは違います。比較が不適切です。", score: 201, vote: 0 },
          { id: 2014, author: "data_v", stance: "pro", body: "「影響を受ける」は「なくなる」とは別。生産性向上で雇用の質が上がる側面もIMFは指摘しています。", score: 167, vote: 0 },
        ]
      },
      { id: 202, author: "worker_e", body: "大企業はすでにAIを使った人員削減を始めています。格差拡大が心配です。", score: 241, vote: 0,
        replies: [
          { id: 2021, author: "analyst_q", stance: "con", body: "メタ・アマゾンなどは数万人規模の削減と同時にAI部門の採用を増やしています。恩恵が偏在している証拠です。", score: 134, vote: 0 },
        ]
      },
      { id: 203, author: "economist_f", body: "創造的な仕事こそAIが得意になりつつあります。画像生成・作曲・文章作成、どれもAIが人間を超えつつある。", score: 189, vote: 0, replies: [] },
    ],
  },
  {
    id: 2, topicId: "t2",
    title: "原子力発電は脱炭素の解決策になるか？",
    description: "CO₂排出量削減の観点では有効だが、廃棄物処理・安全性・コスト・建設期間などの問題がある。再生可能エネルギーとの組み合わせも含め、原子力の役割をどう評価するか。",
    pro: 3210, con: 1897, status: "active", deadline: Date.now() + 5*24*3600*1000,
    commentCount: 4, createdAt: new Date(Date.now() - 8*3600*1000),
    author: "energy_analyst", saved: true, userStance: "pro",
    tags: ["原子力", "脱炭素", "エネルギー"], thumbnail: null,
    history: genHistory(3210, 1897, 18),
    aiSummary: {
      pro: ["フランスの実例が示すCO₂削減効果", "最新SMRによる安全性向上とコスト改善", "ライフサイクルCO₂は再エネと同等以下"],
      con: ["未解決の廃棄物処理問題", "再エネのコスト急落で経済合理性が低下", "事故リスクをゼロにできない構造的問題"],
    },
    proComments: [
      { id: 301, author: "nuke_fan", body: "フランスは電力の70%以上を原子力で賄い、欧州最低レベルの電力CO₂強度を達成しています。データは明確です。", score: 621, vote: 1,
        replies: [
          { id: 3011, author: "engineer_g", stance: "con", body: "ライフサイクルCO₂が同等なら、わざわざリスクの高い原子力を選ぶ理由はないのでは？再エネ一本で十分です。", score: 167, vote: 0 },
        ]
      },
      { id: 302, author: "engineer_g2", body: "最新の小型モジュール炉（SMR）は安全性が飛躍的に向上しています。コスト問題も解決に向かっている。", score: 310, vote: 0, replies: [] },
    ],
    conComments: [
      { id: 303, author: "green_energy", body: "廃棄物問題が未解決のまま拡大するのは無責任。再エネのコストが急落している今、原子力に投資する合理性はない。", score: 489, vote: 0,
        replies: [
          { id: 3031, author: "safety_h", stance: "pro", body: "リスクゼロの技術は存在しません。化石燃料の大気汚染で年間数百万人が死亡している事実とも比較すべきです。", score: 276, vote: 0 },
        ]
      },
    ],
  },
  {
    id: 3, topicId: "t3",
    title: "大学入試に学力試験は必要か？",
    description: "一点突破の学力試験が公平な選抜方法かどうかについての議論。多様な才能や経験を評価する選抜方法への移行を求める声と、客観的指標としての試験の必要性を訴える声が対立している。",
    pro: 987, con: 2043, status: "closed", deadline: Date.now() - 2*24*3600*1000,
    commentCount: 2, createdAt: new Date(Date.now() - 30*24*3600*1000),
    author: "edu_reform", saved: false, userStance: "con",
    tags: ["教育", "入試", "公平性"], thumbnail: null,
    history: genHistory(987, 2043, 24),
    aiSummary: {
      pro: ["客観的で透明性が高く家庭環境に左右されない", "公平な選抜指標として機能", "代替手段の信頼性に疑問"],
      con: ["1日の試験で人生が決まる構造の問題", "多様な才能を評価できない", "受験産業の歪み"],
    },
    proComments: [
      { id: 401, author: "teacher_i", body: "学力試験は客観的で透明性が高い。コネや家庭環境に左右されない公平な指標として機能しています。", score: 312, vote: 0, replies: [] },
    ],
    conComments: [
      { id: 402, author: "student_j", body: "一日の試験結果で人生が決まるのはおかしい。スポーツ・芸術・ボランティアなど多様な才能を評価すべきです。", score: 445, vote: 0, replies: [] },
    ],
  },
  {
    id: 4, topicId: "t4",
    title: "仮想通貨は通貨の未来か？",
    description: "ビットコインをはじめとする仮想通貨は既存の金融システムを変革するポテンシャルがある一方、投機的性質・環境負荷・規制の不透明さが課題。",
    pro: 2156, con: 3012, status: "active", deadline: Date.now() + 1*24*3600*1000,
    commentCount: 2, createdAt: new Date(Date.now() - 3*24*3600*1000),
    author: "crypto_watcher", saved: false, userStance: null,
    tags: ["仮想通貨", "金融", "ブロックチェーン"], thumbnail: null,
    history: genHistory(2156, 3012, 72),
    aiSummary: {
      pro: ["既存金融の非効率を解消", "送金コストの劇的低下で途上国に恩恵", "中央集権からの脱却"],
      con: ["価値の裏付けがなく価格変動が激しい", "通貨の本質である安定性を欠く", "投機目的が中心で実需が乏しい"],
    },
    proComments: [
      { id: 501, author: "crypto_bull", body: "ブロックチェーンは既存金融の非効率を解消します。送金コストの劇的な低下は途上国の人々にこそ恩恵をもたらす。", score: 287, vote: 0, replies: [] },
    ],
    conComments: [
      { id: 502, author: "economist_k", body: "価値の裏付けがなく価格変動が激しすぎる。通貨の本質である「価値の安定した保存手段」を満たしていない。", score: 391, vote: 0, replies: [] },
    ],
  },
  {
    id: 5, topicId: "t1",
    title: "SNSへの年齢制限（16歳未満禁止）は妥当か？",
    description: "オーストラリアが実施した16歳未満のSNS利用禁止法に続き、他国でも議論が起きている。子どもの精神的健康を守る観点vs表現・情報アクセスの自由との兼ね合いをどう考えるか。",
    pro: 4320, con: 1654, status: "active", deadline: Date.now() + 7*24*3600*1000,
    commentCount: 2, createdAt: new Date(Date.now() - 5*3600*1000),
    author: "digital_rights", saved: false, userStance: null,
    tags: ["SNS", "規制", "子ども"], thumbnail: null,
    history: genHistory(4320, 1654, 5),
    aiSummary: {
      pro: ["10代のメンタルヘルスとSNSの相関は研究で裏付け", "子どもを保護する社会的責任", "実施したオーストラリアの先行事例"],
      con: ["表現と情報アクセスの自由の侵害", "若者が社会問題を学ぶ場の喪失", "代替手段(VPN等)で実効性に疑問"],
    },
    proComments: [
      { id: 601, author: "parent_l", body: "SNSによる10代のうつ・いじめ・摂食障害との相関は研究で示されています。子どもを守る規制は必要です。", score: 512, vote: 0, replies: [] },
    ],
    conComments: [
      { id: 602, author: "youth_m", body: "SNSは若者が社会問題を学び、声を上げる場でもある。一律禁止は表現の自由と情報アクセスを奪います。", score: 334, vote: 0, replies: [] },
    ],
  },
  {
    id: 6, topicId: "t7",
    title: "プロスポーツ選手のSNS発言は規制すべきか？",
    description: "選手のSNS発言が炎上することが増えている。所属チームや競技団体が発言内容を制限すべきという声と、個人の表現の自由を尊重すべきという声が対立。",
    pro: 1234, con: 2567, status: "active", deadline: Date.now() + 4*24*3600*1000,
    commentCount: 2, createdAt: new Date(Date.now() - 12*3600*1000),
    author: "sports_pro", saved: false, userStance: null,
    tags: ["スポーツ", "SNS", "表現の自由"], thumbnail: null,
    history: genHistory(1234, 2567, 12),
    aiSummary: {
      pro: ["所属組織のブランド毀損リスク", "若いファンへの影響力", "プロとしての社会的責任"],
      con: ["表現の自由は基本的人権", "選手も一個人として尊重されるべき", "ファンとの距離を縮める価値"],
    },
    proComments: [
      { id: 701, author: "celeb_fan", body: "プロは公人としての自覚が必要。発言一つで子どもたちに影響を与えるのだから、ある程度の制限は妥当です。", score: 187, vote: 0, replies: [] },
    ],
    conComments: [
      { id: 702, author: "balanced_t", body: "選手も人間です。プライベートと競技は分けるべき。SNSはファンとの距離を縮める貴重な手段でもあります。", score: 312, vote: 0,
        replies: [
          { id: 7021, author: "fan_z", stance: "pro", body: "それでも公的影響力を考えれば、最低限のガイドラインは必要です。完全自由は無責任に近い。", score: 89, vote: 0 },
        ]
      },
    ],
  },
];

const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+"k" : String(n);
const ago = d => {
  const s = Math.floor((Date.now()-d)/1000);
  if (s<3600) return `${Math.floor(s/60)}分前`;
  if (s<86400) return `${Math.floor(s/3600)}時間前`;
  return `${Math.floor(s/86400)}日前`;
};

const timeLeft = (deadline) => {
  const ms = deadline - Date.now();
  if (ms <= 0) return null;
  const d = Math.floor(ms/(24*3600*1000));
  const h = Math.floor((ms%(24*3600*1000))/(3600*1000));
  if (d > 0) return `あと${d}日${h}時間`;
  return `あと${h}時間`;
};

const STANCE = {
  pro: { label: "賛成", color: "#1d4ed8", bg: "var(--pro-bg)", border: "#bfdbfe", bar: "#93c5fd", light: "var(--pro-light)", Icon: ThumbsUp },
  con: { label: "反対", color: "#b91c1c", bg: "var(--con-bg)", border: "#fecaca", bar: "#fca5a5", light: "var(--con-light)", Icon: ThumbsDown },
};

const pct = (pro, con) => {
  const total = pro + con || 1;
  return { proP: (pro/total*100).toFixed(1), conP: (con/total*100).toFixed(1) };
};

// ─── Related debates: 同じトピックから他のディベートを抽出 ───────
const getRelated = (current, all) => {
  return all
    .filter(d => d.id !== current.id && d.topicId === current.topicId)
    .slice(0, 3);
};

// ─── Reducer ─────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE": return { ...state, debates: action.debates };
    case "SET_STANCE": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.id || d.status === "closed") return d;
      const prev = d.userStance, next = prev === action.stance ? null : action.stance;
      const adj = k => Math.max(0, d[k] + (next===k?1:0) + (prev===k?-1:0));
      return { ...d, userStance: next, pro: adj("pro"), con: adj("con") };
    })};
    case "SAVE": return { ...state, debates: state.debates.map(d => d.id===action.id ? {...d,saved:!d.saved} : d) };
    case "ADD_DEBATE": return { ...state, debates: [action.debate, ...state.debates] };
    case "ADD_COMMENT": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId || d.status === "closed") return d;
      const key = action.stance==="pro" ? "proComments" : "conComments";
      return { ...d, [key]: [...d[key], action.comment], commentCount: d.commentCount+1 };
    })};
    case "ADD_REPLY": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId || d.status === "closed") return d;
      const key = action.stance==="pro" ? "proComments" : "conComments";
      return { ...d,
        [key]: d[key].map(c => c.id===action.commentId ? {...c, replies:[...(c.replies||[]), action.reply]} : c),
        commentCount: d.commentCount+1 };
    })};
    case "LIKE": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId || d.status === "closed") return d;
      const key = action.stance === "pro" ? "proComments" : "conComments";
      const toggle = b => { const liked = b.vote === 1; return { ...b, vote: liked ? 0 : 1, score: Math.max(0, b.score + (liked ? -1 : 1)) }; };
      return { ...d, [key]: d[key].map(c => {
        if (c.id !== action.commentId) return c;
        if (action.replyId == null) return toggle(c);
        return { ...c, replies: (c.replies || []).map(r => r.id === action.replyId ? toggle(r) : r) };
      })};
    })};
    case "SET_SORT": return { ...state, sort: action.sort };
    case "SET_TOPIC": return { ...state, activeTopic: action.id, activeTag: null, activeDebate: null, activeUser: null, activeAdmin: false };
    case "SET_TAG": return { ...state, activeTag: action.tag, activeDebate: null, activeUser: null };
    case "SET_ACTIVE": return { ...state, activeDebate: action.debate, activeUser: null, activeAdmin: false };
    case "SET_USER": return { ...state, activeUser: action.author, activeDebate: null };
    case "TOGGLE_NEW": return { ...state, showNew: !state.showNew };
    case "SET_SEARCH": return { ...state, search: action.q };
    case "OPEN_REPORT": return { ...state, reportTarget: action.target };
    case "CLOSE_REPORT": return { ...state, reportTarget: null };
    case "REPORT": return { ...state,
      reports: [...state.reports, { id: Date.now(), target: action.target, reason: action.reason, detail: action.detail, status: "open", createdAt: Date.now() }],
      reportTarget: null };
    // ─── 管理者アクション ───
    case "SET_ADMIN": return { ...state, activeAdmin: action.on, activeDebate: null, activeUser: null };
    case "ADMIN_DELETE_DEBATE": return { ...state,
      debates: state.debates.filter(d => d.id !== action.id),
      activeDebate: state.activeDebate?.id === action.id ? null : state.activeDebate };
    case "ADMIN_DELETE_COMMENT": return { ...state, debates: state.debates.map(d => {
      if (d.id !== action.debateId) return d;
      const key = action.stance === "pro" ? "proComments" : "conComments";
      if (action.replyId == null) {
        const target = d[key].find(c => c.id === action.commentId);
        const removed = 1 + (target?.replies?.length || 0);
        return { ...d, [key]: d[key].filter(c => c.id !== action.commentId), commentCount: Math.max(0, d.commentCount - removed) };
      }
      return { ...d, [key]: d[key].map(c => c.id === action.commentId
        ? { ...c, replies: (c.replies || []).filter(r => r.id !== action.replyId) } : c),
        commentCount: Math.max(0, d.commentCount - 1) };
    })};
    case "ADMIN_BAN": return { ...state,
      bannedUsers: state.bannedUsers.includes(action.author)
        ? state.bannedUsers.filter(u => u !== action.author)
        : [...state.bannedUsers, action.author] };
    case "ADMIN_RESOLVE_REPORT": return { ...state,
      reports: state.reports.map(r => r.id === action.id ? { ...r, status: action.status } : r) };
    default: return state;
  }
}

// ─── UI: StanceBar / Picker / Badge ───────────────────────────────
function StanceBar({ pro, con, showLabels=false, height=6 }) {
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

function StancePicker({ current, onChange, size="md", disabled=false }) {
  const sm = size==="sm";
  return (
    <div style={{ display:"flex", gap:sm?6:10, opacity: disabled?0.5:1 }}>
      {["pro","con"].map(s => {
        const st=STANCE[s], active=current===s;
        return (
          <button key={s} onClick={e=>{e.stopPropagation();if(!disabled)onChange(s);}} disabled={disabled}
            style={{ display:"flex", alignItems:"center", gap:sm?4:6,
              padding:sm?"4px 12px":"8px 20px", borderRadius:99,
              border:`1.5px solid ${active?st.border:"var(--border)"}`,
              background:active?st.bg:"var(--surface)", color:active?st.color:"var(--text-4)",
              fontWeight:700, fontSize:sm?12:14, cursor:disabled?"not-allowed":"pointer", transition:"all .15s", fontFamily:"inherit" }}>
            <Icn icon={st.Icon} size={sm?13:16}/>{st.label}
          </button>
        );
      })}
    </div>
  );
}

function StanceBadge({ stance }) {
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
function UserBadge({ author, size="sm" }) {
  const ctx = useContext(AppContext);
  const rep = author === "あなた" ? (ctx.myRep ?? repOf(author)) : repOf(author);
  const b = getBadge(rep);
  const sm = size==="sm";
  return (
    <span title={`${b.label} (Rep: ${rep})`}
      style={{ display:"inline-flex", alignItems:"center", gap:3,
        padding: sm?"1px 6px":"2px 8px", borderRadius:99,
        background: b.color + "15", color: b.color,
        fontWeight:700, fontSize: sm?10:11, border:`1px solid ${b.color}40` }}>
      <Icn icon={b.Icon} size={sm?11:13}/>{b.label}
    </span>
  );
}

// ─── Status Badge: active / closed ────────────────────────────────
function StatusBadge({ status, deadline }) {
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
function VoteHistoryGraph({ history }) {
  const w = 320, h = 140, pad = { top: 10, bottom: 20, left: 8, right: 8 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

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
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((r,i) => (
          <line key={i} x1={pad.left} x2={lastX} y1={pad.top + r*innerH} y2={pad.top + r*innerH}
            stroke="var(--surface-3)" strokeWidth="1" />
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

        {/* x-axis labels */}
        <text x={pad.left} y={h-5} fontSize="9" fill="var(--text-4)">投稿時</text>
        <text x={lastX-22} y={h-5} fontSize="9" fill="var(--text-4)">現在</text>
      </svg>
    </div>
  );
}

// ─── AI Summary Card ──────────────────────────────────────────────
function AISummary({ summary }) {
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

function Thread({ comment, debateId, dispatch, locked }) {
  const { myRep, debates } = useContext(AppContext);
  const [replyingStance, setReplyingStance] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const overQuota = myUsage(debates).comments >= perkOf(myRep).comments;

  const replies = comment.replies || [];
  const shown = expanded ? replies : replies.slice(0, REPLY_LIMIT);
  const hidden = replies.length - REPLY_LIMIT;

  // root + 表示する返信を時系列順にフラットな配列に
  const flow = [{ ...comment, isRoot: true }, ...shown];

  const submitReply = () => {
    if (!replyText.trim() || !replyingStance || overQuota) return;
    dispatch({ type:"ADD_REPLY", debateId, commentId:comment.id, stance:comment.stance,
      reply:{ id:Date.now(), author:"あなた", stance:replyingStance, body:replyText.trim(), score:1, vote:1 }
    });
    setReplyText(""); setReplyingStance(null);
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
          {!replyingStance ? (
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
              <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} rows={2}
                placeholder="あなたの意見を書く…"
                style={{ width:"100%", padding:"7px 10px", border:`1px solid ${STANCE[replyingStance].border}`,
                  borderRadius:8, fontSize:13, fontFamily:"inherit", resize:"vertical", outline:"none", background:"var(--surface)" }} />
              <div style={{ display:"flex", gap:8, marginTop:7 }}>
                <button onClick={submitReply} disabled={!replyText.trim() || overQuota}
                  style={{ background:STANCE[replyingStance].color, color:"#fff", border:"none", borderRadius:99,
                    padding:"5px 14px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  返信する
                </button>
                {overQuota && <span style={{ fontSize:11, color:STANCE.con.color, fontWeight:600, alignSelf:"center" }}>今月のコメント上限に達しました</span>}
                <button onClick={()=>{setReplyingStance(null); setReplyText("");}}
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
function BubbleRow({ bubble, rowNum, prevBubble, isRoot, debateId, rootCommentId, rootStance, locked }) {
  const st = STANCE[bubble.stance] || STANCE.pro;
  const isPro = bubble.stance === "pro";
  const isRebuttal = prevBubble && prevBubble.stance !== bubble.stance;
  const likeInfo = { debateId, commentId: rootCommentId, replyId: isRoot ? null : bubble.id, stance: rootStance };

  // 接続ヒント: 前の発言に対する反論 or 補強
  const connector = !isRoot && (
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
          {isPro && <BubbleContent bubble={bubble} rowNum={rowNum} isRoot={isRoot} st={st} isPro likeInfo={likeInfo} locked={locked} />}
        </div>
        {/* 右カラム (Cons) */}
        <div style={{ minWidth:0 }}>
          {!isPro && <BubbleContent bubble={bubble} rowNum={rowNum} isRoot={isRoot} st={st} isPro={false} likeInfo={likeInfo} locked={locked} />}
        </div>
      </div>
    </div>
  );
}

function BubbleContent({ bubble, rowNum, isRoot, st, isPro, likeInfo, locked }) {
  const { dispatch } = useContext(AppContext);
  const liked = bubble.vote === 1;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap",
        flexDirection: isPro ? "row" : "row-reverse" }}>
        <div style={{ width:20, height:20, borderRadius:50, flexShrink:0,
          background:st.bg, border:`1px solid ${st.border}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:9, fontWeight:800, color:st.color }}>
          {bubble.author[0].toUpperCase()}
        </div>
        <button onClick={()=>dispatch({type:"SET_USER",author:bubble.author})}
          style={{ background:"none", border:"none", padding:0, cursor:"pointer",
            fontWeight:700, fontSize:11, color:"var(--text)", fontFamily:"inherit" }}>u/{bubble.author}</button>
        <UserBadge author={bubble.author} size="sm" />
        <div style={{ display:"flex", alignItems:"center", gap:6,
          marginLeft: isPro ? "auto" : 0, marginRight: isPro ? 0 : "auto",
          flexDirection: isPro ? "row" : "row-reverse" }}>
          <button onClick={()=>!locked && dispatch({type:"LIKE",...likeInfo})} disabled={locked}
            title="いいね"
            style={{ display:"flex", alignItems:"center", gap:3, background: liked ? "var(--rose-bg)" : "none",
              border:`1px solid ${liked ? "#fecdd3" : "transparent"}`, borderRadius:99,
              padding:"1px 7px", cursor: locked ? "default" : "pointer", fontFamily:"inherit",
              color: liked ? "#e11d48" : "var(--text-4)", fontSize:10, fontWeight:700 }}>
            <Icn icon={Heart} size={12} fill={liked ? "currentColor" : "none"}/>{fmt(bubble.score)}
          </button>
          <button onClick={()=>dispatch({type:"OPEN_REPORT",target:{kind:"comment",label:`u/${bubble.author} のコメント`}})}
            title="通報" style={{ background:"none", border:"none", padding:0, cursor:"pointer", display:"inline-flex",
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
        {bubble.body}
      </div>
    </div>
  );
}

const replyBtn = {
  background:"var(--surface)", border:"1.5px solid", borderRadius:99,
  padding:"4px 12px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
};

// ─── Comment section: 全スレッドを時系列で表示 ───────────────────
function SplitComments({ d, dispatch }) {
  const { myRep, debates } = useContext(AppContext);
  const [text, setText] = useState("");
  const [myStance, setMyStance] = useState("pro");
  const locked = d.status === "closed";
  const perk = perkOf(myRep);
  const usedComments = myUsage(debates).comments;
  const overQuota = usedComments >= perk.comments;

  // 全rootコメント (賛成・反対) を時系列で混ぜて表示
  const allThreads = [
    ...d.proComments.map(c => ({ ...c, stance:"pro" })),
    ...d.conComments.map(c => ({ ...c, stance:"con" })),
  ].sort((a, b) => a.id - b.id);

  const submit = () => {
    if (!text.trim() || locked || overQuota) return;
    dispatch({ type:"ADD_COMMENT", debateId:d.id, stance:myStance,
      comment:{ id:Date.now(), author:"あなた", stance:myStance, body:text.trim(), score:1, vote:1, replies:[] }
    });
    setText("");
  };

  return (
    <div>
      {locked ? (
        <div style={{ background:"var(--surface-2)", border:"1.5px solid var(--border)", borderRadius:14, padding:"16px 22px", marginBottom:14, textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"var(--text-2)", marginBottom:4, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}><Icn icon={Lock} size={15}/> このディベートは決着済みです</div>
          <p style={{ fontSize:13, color:"var(--text-3)" }}>新しい投票・コメントは投稿できません。過去の議論を閲覧してください。</p>
        </div>
      ) : (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"18px 22px", marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap", gap:6 }}>
            <p style={{ fontSize:13, color:"var(--text-3)" }}>u/あなた として新しいスレッドを開始</p>
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
          <textarea value={text} onChange={e=>setText(e.target.value)} rows={3}
            placeholder="あなたの意見・論点を書いてください…"
            style={{ width:"100%", padding:"10px 14px", border:"1px solid var(--border)", borderRadius:10, fontSize:14, fontFamily:"inherit", resize:"vertical", outline:"none", color:"var(--text)" }} />
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
              <span style={{ fontWeight:700, fontSize:14, color:st.color }}>{st.label}カラム</span>
              <span style={{ marginLeft:"auto", fontSize:12, fontWeight:700, background:"var(--surface)",
                color:st.color, padding:"2px 8px", borderRadius:99, border:`1px solid ${st.border}` }}>
                スレッド {cnt}件
              </span>
            </div>
          );
        })}
      </div>

      {/* 全スレッドを時系列で表示 */}
      {allThreads.length === 0 ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {["pro","con"].map(s => {
            const st = STANCE[s];
            return (
              <div key={s} style={{ textAlign:"center", padding:"28px 12px", color:"var(--text-4)",
                fontSize:13, border:`1.5px dashed ${st.border}`, borderRadius:10, background:st.light }}>
                まだ{st.label}意見がありません
              </div>
            );
          })}
        </div>
      ) : (
        allThreads.map(c => (
          <Thread key={c.id} comment={c} debateId={d.id} dispatch={dispatch} locked={locked} />
        ))
      )}
    </div>
  );
}

// ─── Related debates panel ────────────────────────────────────────
function RelatedDebates({ current, all, dispatch }) {
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
function UserPage({ author, dispatch }) {
  const { debates, myRep } = useContext(AppContext);
  const rep = author === "あなた" ? myRep : repOf(author);
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
  const isMe = author === "あなた";

  const Stat = ({ label, value, color }) => (
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
          <div style={{ width:64, height:64, borderRadius:50, flexShrink:0,
            background:`linear-gradient(135deg,${STANCE.pro.bg},${STANCE.con.bg})`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:800, color:"var(--text-2)" }}>
            {author[0].toUpperCase()}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"var(--text)" }}>u/{author}</h2>
              {isMe && <span style={{ fontSize:11, background:STANCE.pro.bg, color:STANCE.pro.color, padding:"1px 8px", borderRadius:99, fontWeight:700 }}>あなた</span>}
              {isPopular && <span style={{ fontSize:11, background:"var(--rose-bg)", color:"#e11d48", padding:"1px 8px", borderRadius:99, fontWeight:700, border:"1px solid #fecdd3", display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={Flame} size={12}/> 人気ユーザー</span>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"2px 10px", borderRadius:99,
                background:badge.color+"15", color:badge.color, fontWeight:700, fontSize:13, border:`1px solid ${badge.color}40` }}>
                <Icn icon={badge.Icon} size={14}/> {badge.label}
              </span>
              <span style={{ fontSize:13, color:"var(--text-4)", fontWeight:600 }}>Rep: {rep}</span>
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
                <p style={{ fontSize:13, color:"var(--text-2)", lineHeight:1.6 }}>{b.body}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Debate Detail ────────────────────────────────────────────────
function DebateDetail({ d, allDebates, dispatch }) {
  const topic = TOPICS.find(t=>t.id===d.topicId);
  const { proP, conP } = pct(d.pro, d.con);
  const total = d.pro + d.con;
  const locked = d.status === "closed";
  const winner = locked ? (d.pro >= d.con ? "pro" : "con") : null;

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
            <button onClick={()=>dispatch({type:"SET_USER",author:d.author})}
              style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:12, color:"var(--text-4)", fontFamily:"inherit" }}>u/{d.author}</button>
            <span style={{ fontSize:12, color:"var(--text-4)" }}>• {ago(d.createdAt)}</span>
            <UserBadge author={d.author} />
            <StatusBadge status={d.status} deadline={d.deadline} />
          </div>
          <h2 style={{ fontSize:24, fontWeight:800, color:"var(--text)", lineHeight:1.3, marginBottom:16, letterSpacing:-0.5 }}>{d.title}</h2>
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
              return (
                <div key={s} onClick={()=>!locked && dispatch({type:"SET_STANCE",id:d.id,stance:s})}
                  style={{ textAlign:"center", padding:"18px 12px", borderRadius:12, cursor:locked?"default":"pointer",
                    background:active?st.bg:"var(--surface-2)", border:`1.5px solid ${active?st.border:"var(--border)"}`, transition:"all .2s",
                    opacity: locked && !active ? 0.6 : 1 }}>
                  <div style={{ marginBottom:6, display:"flex", justifyContent:"center" }}><Icn icon={st.Icon} size={26} style={{ color:st.color }}/></div>
                  <div style={{ fontSize:22, fontWeight:800, color:st.color }}>{fmt(count)}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:st.color, marginBottom:2 }}>{st.label}</div>
                  <div style={{ fontSize:12, color:st.color, opacity:0.8 }}>{p}%</div>
                </div>
              );
            })}
          </div>

          <StanceBar pro={d.pro} con={d.con} height={10} showLabels />
          <p style={{ fontSize:12, color:"var(--text-4)", textAlign:"center", marginTop:8 }}>計 {fmt(total)} 票</p>

          {/* Vote history graph */}
          <div style={{ marginTop:20, padding:"16px 18px", background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:12 }}>
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
            <VoteHistoryGraph history={d.history} />
          </div>

          {!locked && (
            <div style={{ marginTop:18, padding:"14px 18px", borderRadius:12, border:"1.5px dashed var(--border)", textAlign:"center" }}>
              <p style={{ fontSize:14, fontWeight:700, color:"var(--text-2)", marginBottom:10 }}>
                {d.userStance ? `あなたは「${STANCE[d.userStance].label}」を選択しています` : "あなたはどちら？"}
              </p>
              <StancePicker current={d.userStance} onChange={s=>dispatch({type:"SET_STANCE",id:d.id,stance:s})} />
              {d.userStance && <p style={{ fontSize:12, color:"var(--text-4)", marginTop:8 }}>もう一度クリックで取り消し</p>}
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginTop:14, flexWrap:"wrap" }}>
            <button style={{...cActBtn, display:"inline-flex", alignItems:"center", gap:5}}><Icn icon={MessageCircle} size={14}/> {fmt(d.commentCount)} コメント</button>
            <button style={{...cActBtn, display:"inline-flex", alignItems:"center", gap:5}}><Icn icon={Share2} size={14}/> シェア</button>
            <button onClick={()=>dispatch({type:"SAVE",id:d.id})}
              style={{...cActBtn, color:d.saved?STANCE.pro.color:"inherit", display:"inline-flex", alignItems:"center", gap:5}}>
              <Icn icon={Bookmark} size={14} fill={d.saved?"currentColor":"none"}/> {d.saved?"保存済み":"保存"}
            </button>
            <button onClick={()=>dispatch({type:"OPEN_REPORT",target:{kind:"debate",label:`ディベート「${d.title}」`}})}
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
      </div>

      <SplitComments d={d} dispatch={dispatch} />

      {/* Related */}
      <RelatedDebates current={d} all={allDebates} dispatch={dispatch} />
    </div>
  );
}

// ─── Debate Card ─────────────────────────────────────────────────
function DebateCard({ d, dispatch }) {
  const topic = TOPICS.find(t=>t.id===d.topicId);
  const { proP, conP } = pct(d.pro, d.con);
  const total = d.pro + d.con;
  const locked = d.status === "closed";

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
            style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:11, color:"var(--text-4)", fontFamily:"inherit" }}>u/{d.author}</button>
          <span style={{ fontSize:11, color:"var(--text-4)" }}>• {ago(d.createdAt)}</span>
          <StatusBadge status={d.status} deadline={d.deadline} />
          {d.userStance && <StanceBadge stance={d.userStance} />}
          {d.saved && <Icn icon={Bookmark} size={12} fill="currentColor" style={{ color:STANCE.pro.color }}/>}
        </div>
        <h3 style={{ fontSize:17, fontWeight:700, color:"var(--text)", lineHeight:1.4, marginBottom:14, letterSpacing:-0.3 }}>{d.title}</h3>
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
            <StancePicker current={d.userStance} onChange={s=>dispatch({type:"SET_STANCE",id:d.id,stance:s})} size="sm" disabled={locked} />
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ fontSize:12, color:"var(--text-4)", display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={MessageCircle} size={13}/> {fmt(d.commentCount)}</span>
            <button title="通報" onClick={e=>{e.stopPropagation();dispatch({type:"OPEN_REPORT",target:{kind:"debate",label:`ディベート「${d.title}」`}});}}
              style={{ background:"none", border:"none", cursor:"pointer", display:"inline-flex", color:"var(--border-2)" }}><Icn icon={Flag} size={15}/></button>
            <button title={d.saved?"保存を解除":"保存"} onClick={e=>{e.stopPropagation();dispatch({type:"SAVE",id:d.id});}}
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
function NewDebateModal({ dispatch }) {
  const { debates, myRep } = useContext(AppContext);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [topicId, setTopicId] = useState("t1");
  const [duration, setDuration] = useState(7); // days
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [thumbnail, setThumbnail] = useState(null);

  const perk = perkOf(myRep);
  const usedPosts = myUsage(debates).posts;
  const overQuota = usedPosts >= perk.debates;

  // 過去に使われた全ハッシュタグ（候補用）
  const allTags = useMemo(() => {
    const set = new Set();
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
      commentCount:0, createdAt:new Date(), author:"あなた", saved:false, userStance:null,
      tags, thumbnail,
      history: [{ t:0, pro:0, con:0, hour:0 }],
      aiSummary: null,
      proComments:[], conComments:[]
    }});
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
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="例：AIは社会にとって脅威か？" style={inputStyle} maxLength={120} />
          <div style={{ fontSize:12, color:"var(--text-4)", textAlign:"right", marginTop:2 }}>{title.length}/120</div>
        </div>
        <div>
          <label style={labelStyle}>概要・背景 (オプション)</label>
          <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4}
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
function ReportModal({ target, dispatch }) {
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
function AdminPage({ debates, reports, bannedUsers, dispatch }) {
  const [tab, setTab] = useState("debates");
  const openReports = reports.filter(r => r.status === "open").length;

  // 全ユーザーを集計
  const users = useMemo(() => {
    const map = {};
    const touch = (a) => { if (!map[a]) map[a] = { author:a, posts:0, comments:0, likes:0 }; return map[a]; };
    for (const d of debates) {
      touch(d.author).posts++;
      for (const b of allBubbles([d])) { const u = touch(b.author); u.comments++; u.likes += (b.score || 0); }
    }
    return Object.values(map).sort((a,b) => b.likes - a.likes);
  }, [debates]);

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

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {tabBtn("debates",ClipboardList,"投稿管理",0)}
        {tabBtn("reports",Flag,"通報管理",openReports)}
        {tabBtn("users",Users,"ユーザー管理",0)}
      </div>

      {tab==="debates" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {debates.map(d => (
            <div key={d.id} style={{ ...card, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.title}</p>
                <p style={{ fontSize:12, color:"var(--text-4)", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>u/{d.author} ・ <span style={{display:"inline-flex",alignItems:"center",gap:3}}><Icn icon={MessageCircle} size={12}/>{d.commentCount}</span> ・ <span style={{display:"inline-flex",alignItems:"center",gap:3}}><Icn icon={ThumbsUp} size={12}/>{d.pro}</span> <span style={{display:"inline-flex",alignItems:"center",gap:3}}><Icn icon={ThumbsDown} size={12}/>{d.con}</span></p>
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
                  <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}>u/{u.author} {banned && <span style={{ fontSize:11, color:"#b45309", fontWeight:700, display:"inline-flex", alignItems:"center", gap:3 }}><Icn icon={Ban} size={12}/> 制限中</span>}</p>
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
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────
const btnPrimary = { background:STANCE.pro.color, color:"#fff", border:"none", borderRadius:99, padding:"9px 22px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" };
const btnGhost = { background:"none", border:"1.5px solid var(--border)", borderRadius:99, padding:"9px 22px", fontSize:14, fontWeight:700, cursor:"pointer", color:"var(--text-2)", fontFamily:"inherit" };
const cActBtn = { background:"none", border:"none", cursor:"pointer", fontSize:12, color:"var(--text-4)", fontWeight:600, padding:"3px 7px", borderRadius:6, fontFamily:"inherit" };
const labelStyle = { display:"block", fontSize:13, fontWeight:600, color:"var(--text-2)", marginBottom:6 };
const inputStyle = { width:"100%", padding:"9px 12px", border:"1px solid var(--border)", borderRadius:8, fontSize:14, fontFamily:"inherit", outline:"none", background:"var(--surface-2)", color:"var(--text)" };

// ─── Hero（初見向け説明バナー） ───────────────────────────────────
function HeroBanner({ onDismiss }) {
  const steps = [
    { Icon: ThumbsUp, t: "立場を表明", d: "賛成 / 反対を選ぶ" },
    { Icon: MessageCircle, t: "根拠を語る", d: "理由をコメントで" },
    { Icon: BarChart3, t: "分布を見る", d: "賛否がリアルタイムで動く" },
    { Icon: Trophy, t: "決着を見る", d: "期間終了で勝敗が確定" },
  ];
  return (
    <div style={{ position:"relative", marginBottom:16, padding:"20px 22px", borderRadius:16,
      background:"linear-gradient(135deg, var(--pro-bg), var(--con-bg))", border:"1px solid var(--border)" }}>
      <button onClick={onDismiss} title="閉じる" aria-label="説明を閉じる"
        style={{ position:"absolute", top:12, right:12, background:"none", border:"none", cursor:"pointer", color:"var(--text-3)", display:"inline-flex" }}>
        <Icn icon={X} size={18}/>
      </button>
      <h2 style={{ fontSize:20, fontWeight:800, color:"var(--text)", letterSpacing:-0.4, marginBottom:6 }}>
        賛成と反対を「構造化」するディベート広場
      </h2>
      <p style={{ fontSize:13.5, color:"var(--text-2)", lineHeight:1.7, marginBottom:14, maxWidth:560 }}>
        Split は、あらゆるテーマについて賛成・反対の意見と根拠を左右に並べて可視化するプラットフォームです。
        投票で賛否の分布が一目でわかり、コメントで議論の流れを追えます。
      </p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
        {steps.map((s, i) => (
          <div key={s.t} style={{ display:"flex", alignItems:"center", gap:8, background:"var(--surface)",
            border:"1px solid var(--border)", borderRadius:10, padding:"8px 12px", flex:"1 1 160px", minWidth:0 }}>
            <span style={{ fontSize:11, fontWeight:800, color:"var(--text-4)", flexShrink:0 }}>{i+1}</span>
            <Icn icon={s.Icon} size={16} style={{ color:"var(--text-3)" }}/>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:12.5, fontWeight:700, color:"var(--text)" }}>{s.t}</p>
              <p style={{ fontSize:11, color:"var(--text-3)", whiteSpace:"nowrap" }}>{s.d}</p>
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
function SkeletonCard() {
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
function Toast({ toast }) {
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

// ─── 管理者パスコード入力モーダル ─────────────────────────────────
function AdminGateModal({ onSubmit, onClose }) {
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

  // ── トースト通知 ────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();
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
    feedbackFor(action);
    rawDispatch(action);
  }, [feedbackFor]);

  // 起動時: Supabase 設定済みなら DB から読み込み。空ならサンプルを投入。
  const [dbStatus, setDbStatus] = useState(isSupabaseConfigured ? "loading" : "local");
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      try {
        let rows = await fetchDebates();
        if (rows === null) { if (alive) setDbStatus("error"); return; }
        if (rows.length === 0) {
          // DB が空 → アプリ内サンプルを初回シード
          const ok = await seedDebates(INIT_DEBATES);
          if (ok) rows = await fetchDebates();
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
  const myRep = useMemo(() => computeMyRep(debates), [debates]);
  // activeDebate はスナップショット参照なので、常に最新の debates から引き直す
  const liveDebate = activeDebate ? (debates.find(d => d.id === activeDebate.id) || activeDebate) : null;

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
  const myBadge = getBadge(myRep);
  const nextBadge = BADGES.find(b => b.min > myRep);

  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  return (
    <AppContext.Provider value={{ dispatch, debates, myRep }}>
    <div style={{ fontFamily:"'DM Sans', sans-serif", minHeight:"100vh", background:"var(--bg)", color:"var(--text)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        :root {
          --bg: #f8fafc; --surface: #ffffff; --surface-2: #f9fafb; --surface-3: #f3f4f6;
          --border: #e5e7eb; --border-2: #d1d5db;
          --text: #111827; --text-2: #374151; --text-3: #6b7280; --text-4: #9ca3af;
          --btn-active: #111827;
          --pro-bg: #eff6ff; --pro-light: #f0f7ff; --con-bg: #fff5f5; --con-light: #fff8f8;
          --rose-bg: #fff1f2; --green-bg: #dcfce7; --amber-bg: #fef3c7;
          --violet-1: #f5f3ff; --violet-2: #fdf4ff; --violet-border: #e9d5ff;
        }
        :root[data-theme="dark"] {
          --bg: #0b1120; --surface: #1a2233; --surface-2: #141c2b; --surface-3: #232c3d;
          --border: #2c3648; --border-2: #3a4658;
          --text: #f1f5f9; --text-2: #cbd5e1; --text-3: #94a3b8; --text-4: #748196;
          --btn-active: #3b82f6;
          --pro-bg: rgba(59,130,246,.20); --pro-light: rgba(59,130,246,.12);
          --con-bg: rgba(244,63,94,.18); --con-light: rgba(244,63,94,.10);
          --rose-bg: rgba(244,63,94,.20); --green-bg: rgba(34,197,94,.20); --amber-bg: rgba(245,158,11,.20);
          --violet-1: rgba(124,58,237,.18); --violet-2: rgba(168,85,247,.12); --violet-border: rgba(139,92,246,.38);
        }
        html { color-scheme: light dark; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); transition: background .25s; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        textarea:focus, input:focus, select:focus { border-color: #bfdbfe !important; box-shadow: 0 0 0 3px var(--pro-bg); outline: none; }
        @keyframes split-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        @keyframes split-toast-in { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
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
            <span style={{ fontWeight:800, fontSize:20, letterSpacing:-0.8, color:"var(--text)" }}>Split</span>
            {!isMobile && <span style={{ fontSize:10, background:STANCE.pro.bg, color:STANCE.pro.color, padding:"1px 7px", borderRadius:99, fontWeight:700 }}>β</span>}
            {(() => {
              const m = { local:["ローカル","var(--text-3)","var(--surface-3)"], loading:["接続中","#b45309","var(--amber-bg)"], connected:["DB接続","#16a34a","var(--green-bg)"], error:["接続失敗","#dc2626","#fee2e2"] }[dbStatus];
              return <span title="データベース接続状態" style={{ fontSize:10, background:m[2], color:m[1], padding:"1px 7px", borderRadius:99, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><Icn icon={Circle} size={7} fill="currentColor"/>{m[0]}</span>;
            })()}
          </div>
          <div style={{ position:"relative", ...(isMobile ? { order:5, flexBasis:"100%" } : { flex:1, maxWidth:520 }) }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text-4)", display:"inline-flex", pointerEvents:"none" }}><Icn icon={Search} size={15}/></span>
            <input value={search} onChange={e=>dispatch({type:"SET_SEARCH",q:e.target.value})}
              placeholder="ディベートを検索…" aria-label="ディベートを検索"
              style={{ width:"100%", padding:"8px 12px 8px 36px", border:"1px solid var(--border)", borderRadius:99, fontSize:14, fontFamily:"inherit", background:"var(--surface-2)", color:"var(--text)" }} />
          </div>
          <div style={{ display:"flex", gap: isMobile ? 8 : 10, flexShrink:0, alignItems:"center", marginLeft: isMobile ? "auto" : 0 }}>
            <button onClick={toggleTheme}
              title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
              style={{ background:"none", color:"var(--text-2)",
                border:"1.5px solid var(--border)", borderRadius:99, width:38, height:38, cursor:"pointer", fontFamily:"inherit", flexShrink:0, display:"inline-flex", alignItems:"center", justifyContent:"center" }}><Icn icon={theme === "dark" ? Sun : Moon} size={18}/></button>
            {adminUnlocked && (
              <button onClick={()=>dispatch({type:"SET_ADMIN",on:!activeAdmin})}
                title="管理者ダッシュボード" aria-label="管理者ダッシュボード"
                style={{ background: activeAdmin ? "var(--btn-active)" : "none", color: activeAdmin ? "#fff" : "var(--text-2)",
                  border:"1.5px solid var(--border)", borderRadius:99, width:38, height:38, cursor:"pointer", fontFamily:"inherit", flexShrink:0, display:"inline-flex", alignItems:"center", justifyContent:"center" }}><Icn icon={Shield} size={18}/></button>
            )}
            <button onClick={()=>dispatch({type:"TOGGLE_NEW"})}
              style={ isMobile ? { ...btnPrimary, padding:"9px 14px", flexShrink:0 } : btnPrimary }>{isMobile ? "＋作成" : "+ ディベート作成"}</button>
            {!isMobile && <div style={{ width:34, height:34, borderRadius:50, background:`linear-gradient(135deg,${STANCE.pro.bg},${STANCE.con.bg})`, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:14, cursor:"pointer", color:"var(--text-2)" }}>あ</div>}
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
          <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>トピック</p>
          {[{id:null,name:"すべて",Icon:Globe}, ...TOPICS].map(t=>(
            <button key={t.id??"all"} onClick={()=>dispatch({type:"SET_TOPIC",id:t.id})}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 10px", borderRadius:8, border:"none",
                background:activeTopic===t.id?STANCE.pro.bg:"none", color:activeTopic===t.id?STANCE.pro.color:"var(--text-2)",
                fontWeight:activeTopic===t.id?700:400, fontSize:14, cursor:"pointer", textAlign:"left", fontFamily:"inherit", marginBottom:2, transition:"background .1s" }}>
              <Icn icon={t.Icon} size={16}/><span style={{flex:1}}>{t.name}</span>
              {t.members && <span style={{ fontSize:11, color:"var(--text-4)" }}>{t.members}</span>}
            </button>
          ))}

          {/* User reputation card */}
          <div style={{ marginTop:20, padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:"var(--text-4)", marginBottom:10, letterSpacing:0.5, textTransform:"uppercase" }}>あなたのレピュテーション</p>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <Icn icon={myBadge.Icon} size={20} style={{ color:myBadge.color }}/>
              <div>
                <p style={{ fontSize:13, fontWeight:800, color:myBadge.color }}>{myBadge.label}</p>
                <p style={{ fontSize:11, color:"var(--text-4)" }}>Rep: {myRep}</p>
              </div>
            </div>
            {nextBadge && (
              <>
                <div style={{ width:"100%", height:5, background:"var(--surface-3)", borderRadius:99, overflow:"hidden", marginBottom:4 }}>
                  <div style={{ width:`${(myRep/nextBadge.min)*100}%`, height:"100%", background:myBadge.color, transition:"width .5s" }} />
                </div>
                <p style={{ fontSize:10, color:"var(--text-4)" }}>
                  あと <strong style={{ color:nextBadge.color }}>{nextBadge.min - myRep}</strong> で「{nextBadge.label}」
                </p>
              </>
            )}
            <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid var(--surface-3)", fontSize:10, color:"var(--text-4)", lineHeight:1.7 }}>
              <div>今月の作成: <strong style={{ color:"var(--text-2)" }}>{myUsage(debates).posts}/{perkOf(myRep).debates === 9999 ? "∞" : perkOf(myRep).debates}</strong></div>
              <div>今月のコメント: <strong style={{ color:"var(--text-2)" }}>{myUsage(debates).comments}/{perkOf(myRep).comments === 9999 ? "∞" : perkOf(myRep).comments}</strong></div>
            </div>
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
          {activeAdmin && adminUnlocked ? (
            <AdminPage debates={debates} reports={reports} bannedUsers={bannedUsers} dispatch={dispatch} />
          ) : activeUser ? (
            <UserPage author={activeUser} dispatch={dispatch} />
          ) : liveDebate ? (
            <DebateDetail d={liveDebate} allDebates={debates} dispatch={dispatch} />
          ) : (
            <>
              {!heroDismissed && !activeTag && !search && (
                <HeroBanner onDismiss={dismissHero} />
              )}
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
                  {[["hot",Flame,"人気"],["new",Sparkles,"新着"],["closing",Clock,"締切間近"],["discussion",MessageCircle,"議論中"]].map(([s,icon,l])=>(
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
                    <span style={{ fontSize:13, fontWeight:700, color:"var(--text)", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>u/{p.author}</span>
                    <Icn icon={b.Icon} size={13} style={{ color:b.color }}/>
                    <span style={{ fontSize:11, color:"#e11d48", fontWeight:700, flexShrink:0, display:"inline-flex", alignItems:"center", gap:3 }}><Icn icon={Heart} size={12} fill="currentColor"/> {fmt(p.likes)}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
              <h4 style={{ fontWeight:700, fontSize:14, marginBottom:12, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}><Icn icon={Sparkles} size={16}/> Splitとは</h4>
              {[[Target,"テーマを選ぶ","賛否を問えるトピックを探す"],[ThumbsUp,"立場を表明","賛成か反対かを明確にする"],[MessageCircle,"根拠を語る","なぜそう思うかをコメントで"],[BarChart3,"分布を見る","リアルタイムで賛否が動く"],[Trophy,"決着を見る","期間終了で勝敗が確定"]].map(([icon,t,desc])=>(
                <div key={t} style={{ display:"flex", gap:10, marginBottom:10, alignItems:"flex-start" }}>
                  <Icn icon={icon} size={16} style={{ marginTop:2, color:"var(--text-3)" }}/>
                  <div><p style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{t}</p><p style={{ fontSize:12, color:"var(--text-3)" }}>{desc}</p></div>
                </div>
              ))}
            </div>

            {/* Badge guide */}
            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:16 }}>
              <h4 style={{ fontWeight:700, fontSize:14, marginBottom:10, color:"var(--text)", display:"flex", alignItems:"center", gap:6 }}><Icn icon={Award} size={16}/> バッジ一覧</h4>
              {BADGES.map(b => (
                <div key={b.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0" }}>
                  <Icn icon={b.Icon} size={14} style={{ color:b.color }}/>
                  <span style={{ fontSize:12, fontWeight:700, color:b.color }}>{b.label}</span>
                  <span style={{ fontSize:11, color:"var(--text-4)", marginLeft:"auto" }}>{b.min}+ Rep</span>
                </div>
              ))}
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
      {toast && <Toast toast={toast} />}
    </div>
    </AppContext.Provider>
  );
}
