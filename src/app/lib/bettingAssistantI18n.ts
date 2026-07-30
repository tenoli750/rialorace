export type ReplyLocale = "en" | "ko" | "ja" | "zh" | "es";

export function detectReplyLocale(text: string): ReplyLocale {
  const sample = text.trim();
  if (!sample) return "en";
  if (/[\uac00-\ud7a3]/.test(sample)) return "ko";
  if (/[\u3040-\u30ff]/.test(sample)) return "ja";
  if (/[\u4e00-\u9fff]/.test(sample)) return "zh";
  if (
    /[áéíóúñü¿¡]/i.test(sample) ||
    /\b(apuesta|mercado|primero|segundo|tercero|por\s+favor|gracias)\b/i.test(sample)
  ) {
    return "es";
  }
  return "en";
}

type MsgKey =
  | "help"
  | "emptyCommand"
  | "notABet"
  | "unknownToken"
  | "needPlace"
  | "stakeTooLow"
  | "parseFailed"
  | "emptyAi"
  | "tokenMissing"
  | "noMarkets"
  | "insufficientBalance"
  | "clarifyDefault"
  | "clarifyPrompt"
  | "clarifyStillAmbiguous"
  | "cancelled"
  | "modeJoint"
  | "modeIndependent"
  | "filterOnly"
  | "filterExclude"
  | "filterMarkets"
  | "demotePrefix"
  | "marketsStake"
  | "skipped"
  | "nextRace"
  | "placeFirst"
  | "placeSecond"
  | "placeThird"
  | "optionJoint"
  | "optionIndependent"
  | "placing"
  | "batchSuccess"
  | "batchFailed"
  | "balance"
  | "batchFailedGeneric"
    | "parsing"
  | "placingBets"
  | "loginRequired"
  | "balanceAnswer"
  | "balanceUnknown"
  | "pnlWinning"
  | "pnlLosing"
  | "pnlEven"
  | "pnlNoSettled"
  | "pnlLoadFailed"
  | "previewConfirmHint"
  | "previewPendingHint"
  | "welcome";

const MESSAGES: Record<ReplyLocale, Record<MsgKey, string>> = {
  en: {
    help: 'Examples: "ETH 1st on all markets" / "DOGE 1st Nightfall Chase" / "DOGE 1st on markets without BTC"',
    emptyCommand: "Enter a betting command.",
    notABet: "That doesn't look like a betting command.",
    unknownToken: "I couldn't tell which token to bet on.",
    needPlace: "Please include a place (1st/2nd/3rd) with the token.",
    stakeTooLow: "Stake must be at least 10 points.",
    parseFailed: "Couldn't parse that command with AI.",
    emptyAi: "AI returned an empty response.",
    tokenMissing: "{symbol} is not in the {category} markets.",
    noMarkets: "No markets match those conditions. Check the tokens/filters.",
    insufficientBalance: "Not enough balance. Need {need} pts / have {have} pts.",
    clarifyDefault: '"{picks}" is ambiguous. How should I place it?',
    clarifyPrompt:
      '1) Together (recommended): only markets with all picks → {picks}\n2) Separate: apply each pick on markets that have that token\n\nReply "1"/"together" or "2"/"separate". Say "cancel" to abort.',
    clarifyStillAmbiguous: 'Still unclear. Reply "1"/"together" or "2"/"separate". Say "cancel" to abort.',
    cancelled: "Cancelled. Enter a new command when ready.",
    modeJoint: "Mode: together (markets with all picks only)",
    modeIndependent: "Mode: separate (per token markets)",
    filterOnly: "Filter: markets that also include {symbols}",
    filterExclude: "Filter: markets without {symbols}",
    filterMarkets: "Markets: {markets}",
    demotePrefix: "On overlap",
    marketsStake: "{count} markets × {stake} pts = {total} pts",
    skipped: "skipped {count} unmatched",
    nextRace: "Next race {time}",
    placeFirst: "1st",
    placeSecond: "2nd",
    placeThird: "3rd",
    optionJoint: "Together (all picks on same markets)",
    optionIndependent: "Separate (each token on its markets)",
    placing: "Placing {index}/{total}: {market} ({label})",
    batchSuccess: "Placed {count}",
    batchFailed: "Failed {count}",
    balance: "Balance {points} pts",
    batchFailedGeneric: "Batch betting failed.",
    parsing: "Thinking…",
    placingBets: "Placing bets…",
    loginRequired: "Log in to place bets. Use Login in the header.",
    balanceAnswer: "You have {points} pts.",
    balanceUnknown: "I couldn't read your balance right now. Try refreshing, or open Profile.",
    pnlWinning:
      "You're up — net {pnl} pts from settled bets (won {won}, lost {lost}; staked {staked}, paid back {payout}).{pending}",
    pnlLosing:
      "You're down — net {pnl} pts from settled bets (won {won}, lost {lost}; staked {staked}, paid back {payout}).{pending}",
    pnlEven:
      "You're about even — net 0 pts from settled bets (won {won}, lost {lost}; staked {staked}).{pending}",
    pnlNoSettled: "No settled bets yet{pending}. Place a race bet and check back after results.",
    pnlLoadFailed: "Couldn't load your betting history right now.",
    previewConfirmHint: 'Reply "confirm" to place, or "cancel" to abort.',
    previewPendingHint: 'You have a pending preview. Reply "confirm" or "cancel".',
    welcome:
      'Hi — I\'m Rialo Assistant. Ask about markets, points, lotto, or place batch bets. Example: "ETH 1st on all markets" / "DOGE 1st SOL 2nd"'
  },
  ko: {
    help: '예: "모든 시장에 ETH 1등" / "DOGE 1등 Nightfall Chase" / "BTC 없는 마켓에 DOGE 1등"',
    emptyCommand: "명령을 입력해 주세요.",
    notABet: "베팅 명령으로 인식하지 못했어요.",
    unknownToken: "어떤 토큰에 걸지 모르겠어요.",
    needPlace: "순위(1등/2등/3등)와 토큰을 같이 말해 주세요.",
    stakeTooLow: "스테이크는 10 포인트 이상이어야 해요.",
    parseFailed: "AI 명령 해석에 실패했어요.",
    emptyAi: "AI 응답이 비어 있어요.",
    tokenMissing: "{symbol}은(는) {category} 마켓에 없어요.",
    noMarkets: "조건에 맞는 시장이 없어요. 토큰/필터를 다시 확인해 주세요.",
    insufficientBalance: "잔액이 부족해요. 필요 {need} pts / 보유 {have} pts.",
    clarifyDefault: '"{picks}" 해석이 애매해요. 어떻게 걸까요?',
    clarifyPrompt:
      '1) 같이 (추천): 둘 다 있는 마켓에만 {picks}\n2) 각각: 토큰이 있는 마켓마다 따로\n\n"1"/"같이" 또는 "2"/"각각"으로 답해 주세요. 취소는 "취소".',
    clarifyStillAmbiguous: '아직 애매해요. "1"/"같이" 또는 "2"/"각각"으로 답해 주세요. 취소는 "취소".',
    cancelled: "취소했어요. 새 명령을 입력해 주세요.",
    modeJoint: "방식: 같이(둘 다 있는 마켓만)",
    modeIndependent: "방식: 각각(있는 마켓마다)",
    filterOnly: "필터: {symbols} 포함 시장만",
    filterExclude: "필터: {symbols} 없는 시장만",
    filterMarkets: "대상 마켓: {markets}",
    demotePrefix: "겹치면",
    marketsStake: "{count}개 시장 × {stake} pts = {total} pts",
    skipped: "조건 미해당 {count}개 스킵",
    nextRace: "다음 레이스 {time}",
    placeFirst: "1등",
    placeSecond: "2등",
    placeThird: "3등",
    optionJoint: "같이 (둘 다 있는 마켓만)",
    optionIndependent: "각각 (있는 마켓마다 따로)",
    placing: "베팅 중 {index}/{total}: {market} ({label})",
    batchSuccess: "성공 {count}개",
    batchFailed: "실패 {count}개",
    balance: "잔액 {points} pts",
    batchFailedGeneric: "일괄 베팅에 실패했어요.",
    parsing: "생각 중…",
    placingBets: "베팅 실행 중…",
    loginRequired: "로그인 후 베팅할 수 있어요. 상단 Login으로 이동해 주세요.",
    balanceAnswer: "지금 잔액은 {points} pts예요.",
    balanceUnknown: "지금 잔액을 읽지 못했어요. 새로고침하거나 Profile을 확인해 주세요.",
    pnlWinning:
      "이기고 있어요 — 정산 기준 순이익 {pnl} pts (승 {won} / 패 {lost}, 건 금액 {staked}, 환급 {payout}).{pending}",
    pnlLosing:
      "지고 있어요 — 정산 기준 순손익 {pnl} pts (승 {won} / 패 {lost}, 건 금액 {staked}, 환급 {payout}).{pending}",
    pnlEven:
      "거의 본전이에요 — 정산 기준 순손익 0 pts (승 {won} / 패 {lost}, 건 금액 {staked}).{pending}",
    pnlNoSettled: "아직 정산된 베팅이 없어요{pending}. 레이스 결과가 나오면 다시 물어봐 주세요.",
    pnlLoadFailed: "베팅 기록을 불러오지 못했어요.",
    previewConfirmHint: '진행하려면 "확인", 그만두려면 "취소"를 입력하세요.',
    previewPendingHint: '대기 중인 미리보기가 있어요. "확인" 또는 "취소"라고 답해 주세요.',
    welcome:
      '안녕하세요 — Rialo Assistant예요. 시장/포인트/로또 질문이나 일괄 베팅을 도와드려요. 예: "모든 시장에 ETH 1등" / "도지 1등 솔라나 2등"'
  },
  ja: {
    help: '例: "全市場でETH 1位" / "SOL 1位とDOGE 1位、重なればDOGEは2位" / "BTCがある市場でSOL 1位"',
    emptyCommand: "コマンドを入力してください。",
    notABet: "ベットコマンドとして認識できませんでした。",
    unknownToken: "どのトークンに賭けるか分かりません。",
    needPlace: "順位（1位/2位/3位）とトークンを一緒に指定してください。",
    stakeTooLow: "ステークは10ポイント以上が必要です。",
    parseFailed: "AIでのコマンド解析に失敗しました。",
    emptyAi: "AIの応答が空でした。",
    tokenMissing: "{symbol} は {category} 市場にありません。",
    noMarkets: "条件に合う市場がありません。トークン/フィルターを確認してください。",
    insufficientBalance: "残高不足です。必要 {need} pts / 保有 {have} pts。",
    clarifyDefault: '"{picks}" は曖昧です。どう賭けますか？',
    clarifyPrompt:
      '1) 一緒（推奨）: 両方ある市場だけに {picks}\n2) 別々: 各トークンがある市場ごとに適用\n\n「1」/「一緒」または「2」/「別々」と答えてください。中止は「キャンセル」。',
    clarifyStillAmbiguous: 'まだ曖昧です。「1」/「一緒」または「2」/「別々」と答えてください。',
    cancelled: "キャンセルしました。新しいコマンドを入力してください。",
    modeJoint: "方式: 一緒（全ピックがある市場のみ）",
    modeIndependent: "方式: 別々（トークンごと）",
    filterOnly: "フィルター: {symbols} も含む市場のみ",
    filterExclude: "フィルター: {symbols} なしの市場のみ",
    filterMarkets: "対象市場: {markets}",
    demotePrefix: "重なる場合",
    marketsStake: "{count}市場 × {stake} pts = {total} pts",
    skipped: "条件外 {count}件スキップ",
    nextRace: "次レース {time}",
    placeFirst: "1位",
    placeSecond: "2位",
    placeThird: "3位",
    optionJoint: "一緒（同じ市場に全ピック）",
    optionIndependent: "別々（トークンごと）",
    placing: "ベット中 {index}/{total}: {market} ({label})",
    batchSuccess: "成功 {count}",
    batchFailed: "失敗 {count}",
    balance: "残高 {points} pts",
    batchFailedGeneric: "一括ベットに失敗しました。",
    parsing: "コマンドを解析中…",
    placingBets: "ベット実行中…",
    loginRequired: "ベットするにはログインが必要です。上部の Login へ。",
    balanceAnswer: "現在の残高は {points} pts です。",
    balanceUnknown: "残高を読めませんでした。更新するか Profile を確認してください。",
    pnlWinning:
      "勝ってます — 精算ベース純益 {pnl} pts（勝 {won} / 敗 {lost}、賭け金 {staked}、払戻 {payout}）。{pending}",
    pnlLosing:
      "負けてます — 精算ベース純損益 {pnl} pts（勝 {won} / 敗 {lost}、賭け金 {staked}、払戻 {payout}）。{pending}",
    pnlEven:
      "ほぼトントンです — 精算ベース純損益 0 pts（勝 {won} / 敗 {lost}、賭け金 {staked}）。{pending}",
    pnlNoSettled: "まだ精算済みベットがありません{pending}。結果後にもう一度聞いてください。",
    pnlLoadFailed: "ベット履歴を読み込めませんでした。",
    previewConfirmHint: '実行は「確認」、中止は「キャンセル」。',
    previewPendingHint: 'プレビュー待ちです。「確認」または「キャンセル」と答えてください。',
    welcome:
      'こんにちは — Rialo Assistantです。市場・ポイント・ロットや一括ベットを手伝います。例: "DOGE 1位 SOL 2位"'
  },
  zh: {
    help: '例如: "所有市场 ETH 第1" / "SOL 第1 和 DOGE 第1，重叠则 DOGE 第2" / "有 BTC 的市场 SOL 第1"',
    emptyCommand: "请输入投注指令。",
    notABet: "这不像是投注指令。",
    unknownToken: "无法识别要投注的代币。",
    needPlace: "请同时说明名次（第1/第2/第3）和代币。",
    stakeTooLow: "投注额至少为 10 积分。",
    parseFailed: "AI 解析指令失败。",
    emptyAi: "AI 返回为空。",
    tokenMissing: "{symbol} 不在 {category} 市场中。",
    noMarkets: "没有符合条件的市场，请检查代币/筛选。",
    insufficientBalance: "余额不足。需要 {need} pts / 现有 {have} pts。",
    clarifyDefault: '"{picks}" 含义不清。要怎么下？',
    clarifyPrompt:
      '1) 一起（推荐）: 仅在同时包含全部选项的市场 → {picks}\n2) 分开: 每个代币在各自市场单独下\n\n回复 "1"/"一起" 或 "2"/"分开"。取消请说 "取消"。',
    clarifyStillAmbiguous: '仍然不清楚。请回复 "1"/"一起" 或 "2"/"分开"。',
    cancelled: "已取消。请输入新指令。",
    modeJoint: "方式: 一起（仅含全部选项的市场）",
    modeIndependent: "方式: 分开（按代币市场）",
    filterOnly: "筛选: 同时包含 {symbols} 的市场",
    filterExclude: "筛选: 不含 {symbols} 的市场",
    filterMarkets: "目标市场: {markets}",
    demotePrefix: "重叠时",
    marketsStake: "{count} 个市场 × {stake} pts = {total} pts",
    skipped: "跳过不符合 {count} 个",
    nextRace: "下一场 {time}",
    placeFirst: "第1",
    placeSecond: "第2",
    placeThird: "第3",
    optionJoint: "一起（同市场全部选项）",
    optionIndependent: "分开（各代币市场）",
    placing: "投注中 {index}/{total}: {market} ({label})",
    batchSuccess: "成功 {count}",
    batchFailed: "失败 {count}",
    balance: "余额 {points} pts",
    batchFailedGeneric: "批量投注失败。",
    parsing: "正在解析指令…",
    placingBets: "正在投注…",
    loginRequired: "请先登录再投注，点击顶部 Login。",
    balanceAnswer: "当前余额是 {points} pts。",
    balanceUnknown: "暂时读不到余额，请刷新或打开 Profile。",
    pnlWinning:
      "你在赢 — 已结算净收益 {pnl} pts（胜 {won} / 负 {lost}，投入 {staked}，返还 {payout}）。{pending}",
    pnlLosing:
      "你在亏 — 已结算净损益 {pnl} pts（胜 {won} / 负 {lost}，投入 {staked}，返还 {payout}）。{pending}",
    pnlEven:
      "基本打平 — 已结算净损益 0 pts（胜 {won} / 负 {lost}，投入 {staked}）。{pending}",
    pnlNoSettled: "还没有已结算的投注{pending}。出结果后再问我。",
    pnlLoadFailed: "无法读取投注记录。",
    previewConfirmHint: '回复 "确认" 执行，或 "取消" 中止。',
    previewPendingHint: '有待确认的预览。请回复 "确认" 或 "取消"。',
    welcome: '你好 — 我是 Rialo Assistant。可问市场/积分/彩票，或下批量注。试试: "DOGE 第1 SOL 第2"'
  },
  es: {
    help: 'Ejemplos: "ETH 1.º en todos los mercados" / "SOL 1.º y DOGE 1.º; si solapan, DOGE 2.º"',
    emptyCommand: "Escribe un comando de apuesta.",
    notABet: "No parece un comando de apuesta.",
    unknownToken: "No sé en qué token apostar.",
    needPlace: "Incluye el puesto (1.º/2.º/3.º) con el token.",
    stakeTooLow: "La apuesta debe ser de al menos 10 puntos.",
    parseFailed: "No pude interpretar el comando con IA.",
    emptyAi: "La IA devolvió una respuesta vacía.",
    tokenMissing: "{symbol} no está en los mercados {category}.",
    noMarkets: "Ningún mercado cumple las condiciones.",
    insufficientBalance: "Saldo insuficiente. Necesitas {need} pts / tienes {have} pts.",
    clarifyDefault: '"{picks}" es ambiguo. ¿Cómo lo apuesto?',
    clarifyPrompt:
      '1) Juntos (recomendado): solo mercados con todos → {picks}\n2) Separado: cada pick en mercados de ese token\n\nResponde "1"/"juntos" o "2"/"separado". "cancelar" para abortar.',
    clarifyStillAmbiguous: 'Sigue ambiguo. Responde "1"/"juntos" o "2"/"separado".',
    cancelled: "Cancelado. Escribe un nuevo comando.",
    modeJoint: "Modo: juntos (solo mercados con todos)",
    modeIndependent: "Modo: separado (por token)",
    filterOnly: "Filtro: mercados que también incluyen {symbols}",
    filterExclude: "Filtro: mercados sin {symbols}",
    filterMarkets: "Mercados: {markets}",
    demotePrefix: "Si solapan",
    marketsStake: "{count} mercados × {stake} pts = {total} pts",
    skipped: "omitidos {count} sin coincidencia",
    nextRace: "Próxima carrera {time}",
    placeFirst: "1.º",
    placeSecond: "2.º",
    placeThird: "3.º",
    optionJoint: "Juntos (todos en los mismos mercados)",
    optionIndependent: "Separado (por token)",
    placing: "Apostando {index}/{total}: {market} ({label})",
    batchSuccess: "Hechas {count}",
    batchFailed: "Fallidas {count}",
    balance: "Saldo {points} pts",
    batchFailedGeneric: "Falló la apuesta por lotes.",
    parsing: "Interpretando tu comando…",
    placingBets: "Colocando apuestas…",
    loginRequired: "Inicia sesión para apostar. Usa Login arriba.",
    balanceAnswer: "Tienes {points} pts.",
    balanceUnknown: "No pude leer tu saldo ahora. Prueba refrescar o abre Profile.",
    pnlWinning:
      "Vas ganando — neto {pnl} pts en apuestas liquidadas (ganadas {won}, perdidas {lost}; apostado {staked}, pagado {payout}).{pending}",
    pnlLosing:
      "Vas perdiendo — neto {pnl} pts en apuestas liquidadas (ganadas {won}, perdidas {lost}; apostado {staked}, pagado {payout}).{pending}",
    pnlEven:
      "Estás casi en tablas — neto 0 pts (ganadas {won}, perdidas {lost}; apostado {staked}).{pending}",
    pnlNoSettled: "Aún no hay apuestas liquidadas{pending}. Pregunta de nuevo tras el resultado.",
    pnlLoadFailed: "No pude cargar tu historial de apuestas.",
    previewConfirmHint: 'Responde "confirmar" para apostar, o "cancelar".',
    previewPendingHint: 'Hay una vista previa pendiente. Responde "confirmar" o "cancelar".',
    welcome:
      'Hola — soy Rialo Assistant. Pregunta por mercados, puntos, lotto o apuestas por lotes. Ej: "DOGE 1st SOL 2nd"'
  }
};

export function msg(
  locale: ReplyLocale,
  key: MsgKey,
  vars: Record<string, string | number> = {}
): string {
  const template = MESSAGES[locale]?.[key] ?? MESSAGES.en[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  );
}

export function helpText(locale: ReplyLocale) {
  return msg(locale, "help");
}

export function withHelp(locale: ReplyLocale, key: MsgKey, vars?: Record<string, string | number>) {
  return `${msg(locale, key, vars)} ${helpText(locale)}`;
}
