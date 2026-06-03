// サンプルデータ（デモ用の初期ディベート）
// genHistory: 投票推移のダミー時系列を生成
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
export const INIT_DEBATES = [
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
