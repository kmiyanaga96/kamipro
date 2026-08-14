// T1 録画転記ツール — 診断コレクタ（PHASE9_PLAN.md §10.5 の出力仕様の実装）
//
// ⚠ 本モジュールは PHASE9_PLAN.md §10.5 を一次情報とする。仕様変更にはユーザー承認が要る。
// ⚠ Claude はブラウザ画面を見られない＝ここが唯一のデバッグ経路（§10.1）。
//    ∴ すべての失敗は「どのツールが・どの段階で・何に躓いたか」を構造化して出す。
//
// 依存なし（葉モジュール）。ブラウザ / Node の両方で動く（DOM も fs も参照しない）。

/** §10.5 の stage（T1）。順序どおりに進む。 */
export const T1_STAGES = ['LOAD', 'DECODE', 'ROI', 'DETECT', 'MATCH', 'PAIR', 'DEDUP', 'EMIT'];

/** severity。FATAL=処理停止 / ERROR=その行・フレームだけ無効で続行 / WARN=続行・要確認 / INFO */
export const SEV = { FATAL: 'FATAL', ERROR: 'ERROR', WARN: 'WARN', INFO: 'INFO' };

/**
 * 診断コレクタ。
 * ★§10.5「部分成功を必ず保全する」＝ FATAL でも emit() は必ず result を返す（走をやり直させない）。
 */
export class Diag {
  /**
   * @param {string} tool  ツールID（'T1' 等）
   * @param {string} version  ツール版（extract.json に刻む provenance＝§10.4）
   */
  constructor(tool, version) {
    this.tool = tool;
    this.version = version;
    this.ranAt = new Date().toISOString();
    this.input = {};
    this.config = {};
    this.items = [];
    this.progress = { stage: T1_STAGES[0], done: 0, total: 0, completed: false };
  }

  setInput(o) { this.input = { ...this.input, ...o }; return this; }
  setConfig(o) { this.config = { ...this.config, ...o }; return this; }

  /** 現在の stage を進める（done/total は分かる範囲で）。 */
  stage(name, done = 0, total = 0) {
    this.progress = { stage: name, done, total, completed: false };
    return this;
  }

  /**
   * 診断を1件積む。
   * @param {string} code  `<ツールID>-<stage>-<3桁>`（コードは再利用しない＝過去ログの意味を変えない）
   * @param {string} sev   SEV のいずれか
   * @param {object} d     { where, expected, got, hint, crop }
   */
  add(code, sev, d = {}) {
    this.items.push({ code, sev, ...d });
    return this;
  }

  /** severity 別の件数。 */
  summary() {
    const s = { FATAL: 0, ERROR: 0, WARN: 0, INFO: 0 };
    for (const it of this.items) if (s[it.sev] !== undefined) s[it.sev]++;
    return s;
  }

  /** ★§10.5-1「人が読む1行サマリを必ず併記する」。 */
  line() {
    const s = this.summary();
    const p = this.progress;
    const head = p.completed
      ? `${p.stage} まで完了`
      : `${p.stage} で停止`;
    const prog = p.total ? ` / ${p.done}/${p.total}` : '';
    return `${this.tool} v${this.version}: ${head}${prog}`
      + ` / FATAL ${s.FATAL} ERROR ${s.ERROR} WARN ${s.WARN}`;
  }

  /**
   * §10.5 の JSON を1つ出す。★部分成功でも必ず result を含める。
   * @param {*} result ここまでに抽出できたもの
   */
  emit(result, completed = false) {
    this.progress.completed = completed;
    return {
      tool: this.tool,
      version: this.version,
      ranAt: this.ranAt,
      input: this.input,
      config: this.config,
      progress: this.progress,
      diagnostics: this.items,
      summary: this.summary(),
      line: this.line(),
      result: result ?? null,
    };
  }
}
