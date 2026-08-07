// 汎用: configC（sim05 移行編成・ナポレオン基軸）を**台帳から**復元する共有ローダ（2026-08-05）。
//
// ── なぜ必要か（2026-08-03 に実際に起きた事故）──
//   `tools/` のハーネスは config（GEAR/サブ枠/パーティ順/敵/ATK/override）を**各自ハードコード**していた。
//   GEAR は 2026-07-31 中に2回更新された（暫定 → proper v1 → **proper v2**）が、ハーネスは**最古値のまま**動き続け、
//   `simulation/sim05/analysis/` の初版はその GEAR で計算された。結果:
//     T1 全体比 ×1.77 →（正しい GEAR で）**×1.41** ／ バースト本体 ×1.04（一致）→ **×0.77（シムが 30% 過大）**
//   ＝**`calib_burst` が転移している/していない が符号ごと反転**した。詳細＝`simulation/sim05/data/configC_gear_panel.md` 冒頭注記2。
//
// ── 原則（REPO_STANDARDS §6 E10）──
//   **config は台帳（受領キャッシュ JSON）から読む。ハーネスにハードコードしない。**
//   受領キャッシュの `_configSig` キーには GEAR / サブ枠 / パーティ順 / 敵（def・HP・barrier・abilCap）が、
//   value には `dispAtk`（per-char 表示ATK）/ `override`（静的スコア）/ `turnsKeys` / `dmg` が入っている。
//   ∴ **キャッシュ1本だけで config が完全に再現でき、しかも既知値との bit 一致で検証できる**（＝E2 が自動で通る）。
//
// 使い方:
//   import { loadConfigC, verifyE2 } from './lib/config_c.mjs';
//   const cfg = loadConfigC();            // 台帳そのままを適用
//   verifyE2(cfg);                        // ★E2: 記録ルートの強制リプレイが bit 一致するか（不一致なら exit 1）
//   loadConfigC({ enemy:'walpurgis_loki', atkScale:1.10 });   // ← 実験条件へ 1 変数だけずらす
//
// ⚠ **E2 は台帳条件でしか意味を持たない**。実験で敵/ATK/override をずらすなら、
//   「①台帳条件で load → ②verifyE2 → ③実験条件で再 load」の順に呼ぶこと（既存の exp_loki_stability 等と同じ作法）。
// ⚠ 本モジュールは **production 非改変**（`src/app.js` を import して GEAR/DMG を書き換えるだけ）。
import fs from 'node:fs';
import { buildFormation, applyEnemy, recalcGearK, recalcGearKCFromDispAtk, GEAR, DMG,
         setCurrentSubs, setStaticOverride, ENGINE_VERSION, _replayResult } from '/home/user/kamipro/src/app.js';

// configC の**正**＝ユーザー受領の結果キャッシュ（2026-08-03・engineVersion `sim05-c39-naowner`）。
// GEAR は `configC_gear_panel.md` §2.0「proper v2（現行）」と同値であることを確認済み。
export const CONFIG_C_LEDGER = '/home/user/kamipro/simulation/sim05/data/configC_cache_20260803.json';

// 台帳の敵（`_configSig` は def/HP/barrier/abilCap の**数値**は持つが敵キーは持たないため定数で保持する）。
export const CONFIG_C_ENEMY = 'ryomen_sukuna';

// 台帳の**幻獣枠**（`_configSig` は幻獣キーを持たず、畳んだ結果の GEAR しか持たないため定数で保持する）。
// ⚠ ∴ **GEAR を台帳から読んでいる限り再適用は不要**（二重計上になる）。ここに置くのは provenance のため。
// 出所＝ユーザー申告 2026-08-07 ＋ 台帳 GEAR の逆算（proper v1→v2 が 9枠一律 ×10/9＝加護 0.8→1.0、
// assault のみ +2.00＝カタスの `box:{assault:1.0}` ×2 に厳密一致）。検算は `gamedata/md/幻獣/catastrophia_light.md` §2.3。
export const CONFIG_C_SUMMONS = { main: 'catas', support: 'catas', sub: '未記録（要 configC_slot.json）' };

// 英霊武器（レス・ボナパルト）の設定。`applyGear` が UI 側で立てる値で `_configSig` には入らない
// （sig が持つのは edison_burst_extra_* のみ）＝ここで明示する。
// ⚠ `betaia_cap` は **C41 の対象そのもの**（過小の疑い）。値を動かすときは台帳（CALIBRATION_ANALYSIS C41）と同時に。
export const NAPOLEON_HERO_WEAPON = { betaia_mult: 3.5, betaia_cap: 800000, napo_burst_cd_reduce: true };

function readLedger(){
  const cache = JSON.parse(fs.readFileSync(CONFIG_C_LEDGER, 'utf8'));
  const [key, val] = cache.entries[0];
  const sig = JSON.parse(key.split('|').slice(1).join('|'));
  const [hero, kami, gear, subs, eDef, eHp, eBurstMult, eBurstCap, n, eBarrier, eAbilCap] = sig;
  return { cache, key, val, sigText: key.split('|').slice(1).join('|'),
           hero, kami, gear, subs, eDef, eHp, eBurstMult, eBurstCap, n, eBarrier, eAbilCap };
}

/**
 * configC を台帳から適用する。返り値は「実際に何を適用したか」の記述子（バナー出力・E2 に使う）。
 *
 * @param {object}  [o]
 * @param {string}  [o.enemy]     敵キー。既定＝台帳の敵。**変えると台帳の敵パラメータは適用しない**（registry の値になる）。
 * @param {number}  [o.abilCap]   `DMG.enemy_abil_cap` を明示上書き（null で無効化）。既定＝台帳値 or registry 値。
 * @param {object}  [o.atk]       per-char 表示ATK を明示指定。既定＝台帳の `dispAtk`。
 * @param {number}  [o.atkScale]  台帳 ATK に一律スケールを掛ける（ATK 感度実験用）。`atk` と併用不可。
 * @param {object}  [o.override]  静的スコア override。既定＝台帳の `override`。
 */
export function loadConfigC(o = {}){
  const L = readLedger();
  const enemy = o.enemy ?? CONFIG_C_ENEMY;
  const ledgerEnemy = enemy === CONFIG_C_ENEMY;

  setCurrentSubs([...L.subs]);
  buildFormation(L.hero, [...L.kami]);
  applyEnemy(enemy);

  for (const k of Object.keys(GEAR)) GEAR[k] = L.gear[k] ?? 0;

  // 敵パラメータ: 台帳の敵なら sig の値で**上書き**する（registry より台帳が正＝走行時の実条件）。
  // 別の敵なら registry の値をそのまま使う（1変数だけを動かす設計＝混ぜない）。
  if (ledgerEnemy) {
    DMG.enemy_def = L.eDef; DMG.enemy_max_hp = L.eHp; DMG.enemy_barrier = L.eBarrier;
    DMG.edison_burst_extra_mult = L.eBurstMult; DMG.edison_burst_extra_cap = L.eBurstCap;
    DMG.enemy_abil_cap = L.eAbilCap ?? null;
  }
  if ('abilCap' in o) DMG.enemy_abil_cap = o.abilCap;

  Object.assign(DMG, NAPOLEON_HERO_WEAPON);

  if (o.atk && o.atkScale != null) throw new Error('loadConfigC: atk と atkScale は併用不可');
  const atk = o.atk ? { ...o.atk }
            : o.atkScale != null ? Object.fromEntries(Object.entries(L.val.dispAtk).map(([k, v]) => [k, Math.round(v * o.atkScale)]))
            : { ...L.val.dispAtk };
  const override = o.override ?? { ...(L.val.override || {}) };

  recalcGearK();
  recalcGearKCFromDispAtk(atk);
  setStaticOverride(override);

  return { ledger: L, hero: L.hero, kami: L.kami, subs: L.subs, gear: L.gear,
           enemy, ledgerEnemy, abilCap: DMG.enemy_abil_cap, atk, atkScale: o.atkScale ?? null, override, n: L.n };
}

/**
 * ★E2（REPO_STANDARDS §6）: 台帳の記録ルートを現行エンジンで強制リプレイし、記録ダメージと **bit 一致**するか検証する。
 * 一致＝GEAR/サブ枠/パーティ順/敵/ATK/override/エンジン版がすべて走行時と同一、の証明になる。
 * ⚠ 台帳条件（`loadConfigC()` を引数なしで呼んだ直後）でのみ有効。
 * @returns {number} 一致した記録ダメージ（不一致なら process.exit(1)）
 */
export function verifyE2(cfg, { silent = false } = {}){
  const L = cfg?.ledger ?? readLedger();
  const log = s => process.stdout.write(s + '\n');
  if (L.cache.engineVersion !== ENGINE_VERSION) {
    log(`  ❌ E2: 台帳の engineVersion=${L.cache.engineVersion} が現行 ${ENGINE_VERSION} と違う`);
    log(`     ＝ダメージモデルが動いた後の台帳が無い。新しい受領キャッシュを取り直すまで、この config での数値は出せない。`);
    process.exit(1);
  }
  if (cfg && (!cfg.ledgerEnemy || cfg.atkScale != null)) {
    log(`  ❌ E2: 台帳条件ではない（enemy=${cfg.enemy} atkScale=${cfg.atkScale}）。①台帳条件で load →②verifyE2 →③実験条件で再 load の順に呼ぶこと`);
    process.exit(1);
  }
  const got = _replayResult(L.val.turnsKeys, L.val.n).dmg;
  if (got !== L.val.dmg) {
    log(`  ❌ E2 不一致: 強制リプレイ ${got} / 台帳記録 ${L.val.dmg} ＝config 再現に失敗（以降の数値は無効）`);
    process.exit(1);
  }
  if (!silent) log(`  ✅ E2 bit 一致 (${got}) — config は台帳 ${CONFIG_C_LEDGER.split('/').pop()} を完全再現`);
  return got;
}

/** 走行条件を1行で出す（出力に provenance を残す＝どの config で測った数値かが後から分かる）。 */
export function configBanner(cfg){
  const a = cfg.atkScale != null ? ` ATK×${cfg.atkScale.toFixed(2)}` : '';
  const e = cfg.ledgerEnemy ? cfg.enemy : `${cfg.enemy}（★台帳と別の敵＝敵パラメータは registry 値）`;
  return `config=${CONFIG_C_LEDGER.split('/').pop()} / ${cfg.hero}+[${cfg.kami}] / subs=[${cfg.subs}] / `
       + `幻獣=main:${CONFIG_C_SUMMONS.main}+support:${CONFIG_C_SUMMONS.support}（GEAR に畳み込み済） / `
       + `敵=${e} abilCap=${cfg.abilCap} / GEAR burst_cap=${cfg.gear.burst_cap}${a} / override=${JSON.stringify(cfg.override)}`;
}
