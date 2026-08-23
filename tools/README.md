# tools/ — 較正・探索ハーネス（現役）

> **種別**: 規定（置き場所の説明・生きた台帳）
> **ゴール**: 較正/探索の計測ハーネスを1か所に集約し、**台帳に載った数値がすべて再現可能**な状態を保つ。
> **完了条件**: なし（生きた台帳）
> 作成 2026-07-28（`archive/tools/` から**ルートへ昇格**＝現役ツールが歴史台帳配下にあり見つけにくかったため。ユーザー承認済み・REPO_STANDARDS §2 の体系変更）

---

## 使い方の原則

- **すべて production 非改変**（`src/*` を import するだけ）。実行しても golden に影響しない。
- 実験を回す前に **REPO_STANDARDS §6「実験・計測を回すときの作法」E1〜E10** を通すこと。とくに **E2（config 再現は既知値との bit 一致を先に確認）**・**E8（1条件=1プロセス）**・**★E10（config は台帳から読む＝§0.5）**。
- **実測コストは CLAUDE.md「実測コスト」表が正**（napoleon 1ルート ~130s 等）。コード内の古い性能記述を前提にしないこと（E1）。
- **長時間ジョブは §0 の並列実行を検討する**（逐次だとコアを1つしか使わない）。

## 0. 並列実行（2026-08-02）

**node は単一スレッド＝逐次だとコアを1つしか使わない。** 独立タスク（prefix 間・ルート間・fixture 間）は
`tools/lib/parallel_map.mjs` で**自分自身を子プロセスとして fork** して分散する。

- **なぜ子プロセスか**: ①ハーネスは冒頭でモジュールトップレベルに config を構築するので、子が同じスクリプトを
  頭から実行すれば **config セットアップがそのまま再現される**（E2 の前提が壊れない） ②**E8「1条件=1プロセス」**と整合。
- **⚠結果不変**: 各タスクは決定的な純関数で、親が**宣言順に整列し直してから** sort する＝**tie-break まで逐次時と一致**。
- 並列度は既定でコア数。`PMAP_LIMIT` で上限を変えられる（他ジョブと同居させる時＝**E5**）。
- 受入検査済み: 順序保存 / payload 往復 / 実効 3.62x（4コア） / 子の異常終了が親へ伝播。

| 適用済み | 効果 |
|---|---|
| `test/golden.mjs`（fixture 間） | **4分07秒 → 2分07秒（×1.94）**・値は 3/3 完全一致 |
| `extract_order_loki.mjs`（①prefix 間・②ルート間） | ①8 prefix が **約19分 → 実時間 6.5分（×2.9）**。TOPN=1 の全体は **542秒**（②は1本＝並列の余地なし・152秒） |

## 0.5 ★ config は台帳から読む（`lib/config_c.mjs`・2026-08-05・REPO_STANDARDS §6 **E10**）

**何が起きたか**: ハーネスが configC の GEAR を**各自ハードコード**していた。configC の GEAR は 2026-07-31 中に
2回更新された（暫定 → proper v1 → **proper v2**）が、ハーネスは**最古値のまま**動き続け、
`simulation/sim05/analysis/` の初版はその GEAR で計算された。結果 **バースト本体 ×1.04（一致）→ ×0.77（30%過大）**
と**結論が符号ごと反転**した（詳細＝`simulation/sim05/data/configC_gear_panel.md` 冒頭注記2）。

**対策**: configC は `lib/config_c.mjs` 経由で**受領キャッシュ JSON から復元する**。
`_configSig` に GEAR/サブ枠/パーティ順/敵が、value に `dispAtk`/`override`/`turnsKeys`/`dmg` が入っているので、
**キャッシュ1本で config が完全再現でき、記録ルートの強制リプレイ bit 一致で E2 が自動的に通る**。

```js
import { loadConfigC, verifyE2, configBanner } from './lib/config_c.mjs';
const cfg = loadConfigC();               // 台帳そのまま
console.log(configBanner(cfg));          // ★出力に走行 config を残す（provenance）
verifyE2(cfg);                           // ★E2: bit 一致しなければ exit 1
loadConfigC({ enemy:'walpurgis_loki', atkScale:1.10, abilCap:null });  // 実験条件へ 1 変数だけずらす
```

⚠ **E2 は台帳条件でしか意味を持たない**＝「①台帳条件で load → ②`verifyE2` → ③実験条件で再 load」の順に呼ぶ。
⚠ **台帳の `engineVersion` が現行と違えば `verifyE2` は落ちる**（＝ダメージモデルが動いた後の台帳が無い状態。
新しい受領キャッシュを取り直すまで、その config での数値は出せない）。これは仕様＝黙って古い条件で走らせない。

**移行済み（15本・2026-08-05）**: `exp_t1_abilcap_sweep` / `exp_atk_sensitivity_napoleon` / `exp_beam_width_sweep` /
`exp_abilcap_isolation` / `exp_loki_stability` / `exp_prefix_sweep` / `exp_order_compare` / `exp_c27_vs_localsearch` /
`exp_horizon_sensitivity` / `exp_local_search{,_control,_multistart}` / `exp_prefix_route_identity` /
`exp_ls_incremental_verify`(configC 節) / `extract_order_loki`。
**⚠ これらが過去に出した数値はすべて旧 config のもの＝再取得が必要**（C37 の BW 掃引結論を含む）。

**configB（エジソン）は対象外**: `exp_atk_sensitivity_edison` / `exp_c27_vs_localsearch_edison` /
`exp_ls_incremental_verify`(edison 節) はハードコードのままだが、**値が `simulation/sim04/data/config.json` の
`_configSig` と一致することを確認済**（configB は sim04 較正編成＝**凍結**で、configC と違い一度も動いていない）。

## 1. 較正・探索ハーネス（従来から現役）

| スクリプト | 用途 |
|---|---|
| **`calib_replay_compare.mjs`** | **★実機の押し順をそのまま強制リプレイし、ターン別・成分別に実機と突合する**（sim05 の較正方式そのもの）。trial md の §1 をパースして実機側を集計し、シム側は `sim.dmg` の setter で**加算点のソース行**から成分に帰属させる（production 非改変）。**約3秒**。<br>**★2026-08-06 に trial 汎用化**（M2 受領に伴う）: **`--src <trial の md ファイル>`**（既定＝pre-trial・`simulation/sim05/data/` 相対でよい）／**列レイアウトはヘッダ行から解決**＝pre-trial の11列様式と `record_skeleton` 更新後の12列様式（`契晶(押下後)` 追加）を両方読む／**敵キーと表示ATK は trial md ヘッダから取る**／**config は `lib/config_c.mjs` 経由の台帳駆動＋E2 自動検証**（E10）。<br>**★ミッドターン撃破に対応**: 実機 md に `(攻撃フェイズ)` 行が無いターンは**シム側も `_attackPhase`/`_endBookkeep` を呼ばない**（押下フェイズのみ突合）。これが無いと実機に存在しない5人バースト＋ターン終了時ダメージがシムにだけ乗る。分解実行が `greedyTakeTurn` と**ビット一致**することは **`--selftest`** が検証する。<br>**オプション**: `--per-press`（**★押下ごとに実機/シムを並べ「追加ダメ ÷ 本体」を出す**＝C40/C44 の主データ）／`--cap-probe`（**★`_decay` の raw / 実効cap / 出力を成分別に採取**＝「cap が過小」か「式が違う」かの切り分け）／`--def <n>`（敵防御の感度・**def は placeholder**。⚠`enemy_def` は `_gearKScale` で GEAR_K に**畳み込まれる**ため**代入後に `recalcGearK`/`recalcGearKCFromDispAtk` を回し直す**必要がある＝初版はこれを忘れて **no-op** だった・2026-08-06 修正）／**`--lever`**（**★どちらのレバーで届くかを成分別に解く**＝「同じ差を埋めるのに必要な raw 倍率 / cap 倍率」。cap 拘束下では `out = cap+(raw−cap)×slope` で **raw の効きが slope 倍に潰れる**ので両者は桁が違う。**cap 到達不能＝raw（式）が主因**の決定的な印。⚠`_decay` の後段係数（judg ph0 の `judg_calib`＋royAbi・burst の `calib_burst`＋フラット）は**decay 空間へ割り戻してから**解く。⚠`_decay` のミラーを内蔵しており、記録 out を再現できなければその行を落として警告する＝二重定義の drift 検出つき）／`誤差の大きさ` 行（**gross / net / 相殺率**＝符号相殺で「一致して見える」状態を検出する）／`--abilcap <n|null>`・`--cap19`／`--wipe`（T1末バフ全消去仮説）。<br>**★2026-08-07 に記録の検証を追加**（データ精度・記入様式の改善と同時）: ①**§1 の表の範囲をヘッダから連続する `|` 行に限定**し、**表内で列数が違う行はエラーで落とす**（旧実装は列数不一致を `continue` で捨てており、**パイプを1本打ち間違えた行が黙って消えていた**）。②**成分列・ヒット数列を値の並びと照合**する（`LAYOUT`／FB 行は `FB_GROUPS=[1,2,2,11,2,1]`）。**成分列は書かれているのに一度も読まれていなかった**＝holy を1ヒット落とすと追撃が holy の8番目として黙って吸われる状態だった。⚠ **検証専用で帰属ロジックは不変**＝pre-trial / trial01 とも**出力はビット一致**（回帰確認済）。様式の正は `record_skeleton.md` §1 の「key 別 値の並び」表。<br>出した数値＝`simulation/sim05/analysis/per_trial/pre-trial_quant.md`（C40〜C44）・**`trial01_quant.md`（C40/C42/C44/C47/C48）**。⚠**成分の対応表 `SITE` / `DECAY_SITE` は characters.js / sim.js の行番号依存**＝両ファイルを編集したら更新すること（未知の行は行番号のまま出るので気付ける）。⚠**汎用化後も pre-trial の全数値はビット一致で再現する**ことを確認済（回帰の基準＝T1 シム 380,681,217） |
| **`calib_burst_formula.mjs`** | **★バースト本体の式を実機から推定する**（C44 の分解）。`calib_replay_compare` と同じ config で強制リプレイし、`burst()` の内部量（naB / raw / 実効cap / core）と**加算点 sim.js:204 の増分のみ**を採取して実機と突合。①同一 FB 内のキャラ間比（交絡ゼロ）②どの内部量に実機比が安定するか ③キャラ別残差 ④減衰外フラット項の割合 ⑤係数の推定、を出す。`--fix` で推定値を当てて検証。**約3秒**。⚠ **T1 のみ有効**（T2 以降はバフ消去で汚染）。⚠ 素朴に `this.dmg` 前後差を取ると `onBurst` の追加ダメージが混入する |
| **`calib_m1_sim03.mjs`** | **★M1＝過去 sim の強制リプレイ**（実機走ゼロ）。`simulation/sim03/data/trial01〜05`（D走・固定押し順・**configA**）を現行エンジンで再生し、①**環境妥当性検査**（押下が通るか＋**全成分の突合**）②**バースト式の構造パラメータ**を出す。**configA は GEAR `burst_cap` 1.98 で configC v3 の 2.34 と別水準**＝pre-trial 単独では共線性で分離できなかった **slope と `calib_burst`** を切り分けられる唯一の在庫。`--components`（**★全成分の実機/シム比**・未パース 0 を確認すること）／`--streak`（**★縮退を破る検証**＝ストリークは `calib_burst` を通らないので slope 単独を測れる）／`--verify <slope> <calib>`／`--fix`。**10〜60秒**。出した数値＝`simulation/sim05/analysis/m1_history_replay.md`。<br>⚠ **`--slope`/`--fine` は棄却された指標**（バースト本体の比だけでは `calib_burst` と slope が**縮退**する＝どちらも本体しか見ていない。再現性のため残置・**新規の結論に使わない**）。<br>⚠ **`TURNS = [1, 2]`＝T3 は除外**（実機が T3 途中で撃破し記録が打ち切られている＝実機バースト15発 vs シム65発。**外すと系統的に誤る**）。⚠ sim03 は**6列様式**（sim04/sim05 の11列とは別物）。⚠ sim04 trial01〜03（無アビ素走）は**シムがゲージ上昇を持たずバーストが出ない**ので burst 式には使えない |
| `search_calibrate.mjs` | 静的スコア自動較正の再fit（**ダメージモデルを変えたら必ず実行**） |
| `search_calibrate_e2e.mjs` | 較正phase→本探索phase の2段配線を単一プロセスで検証 |
| `search_probe.mjs` | N ターン探索の総ダメージ・時間・per-turn 使用回数 |
| `search_validate.mjs` | 探索 order を独立replay で再生し `探索dmg==replay dmg` & `skip=0` を検証 |
| `search_autocal.mjs` | 静的 s の掃引（C15 案(c) の原型） |
| `search_lever_scan.mjs` / `search_lever_verify.mjs` | 較正レバー候補の proxy 掃引 → full 検証（C17） |
| `search_gear_probe.mjs` | ギア別の較正適応を確認（C15 §6.10） |
| `c27_refine_probe.mjs` | C27 定石リファインの上限測定・冪等/後出し検証・キャッシュ復元。⚠**C27 は 2026-07-30 に production 非経路化**（`_refineRoute` は再現性のため残置）＝本ハーネスは歴史的数値の再現用 |
| `exp_puvoir_lever.mjs` | **M3 の設計支援**（見積り専用・production も trial も読まない）。`puvoir` 1 stack が cap 拘束成分の出力を何% 動かすかを成分別に出し、**`cap_puvoir` と `elem_puvoir` を分離するための設計行列**を示す。⚠`puvoir` は **cap +6%/stack と raw(光属性攻撃) +15%/stack の両方**を持つ＝純粋な cap レバーではない。⚠ 入力は **trial01 の `--cap-probe` 実測値をハードコード**＝**config が変わったら取り直す**（E10 の例外＝見積り専用のため許容・冒頭に明記） |
| `ml_fit_static{,_v2}.mjs` | Phase 7 静的スコアML化 PoC（`npm run poc:ml`・**クローズ済だが再開用に温存**） |

## 2. 探索品質の実験ハーネス（2026-07-28 追加）

> ⚠ **局所探索（LS）は 2026-07-30 に production 実装済**（`src/sim.js` `_localSearchRoute`）。以下の `exp_local_search*` / `exp_c27_vs_localsearch*` は
> **実装前の判断根拠となった実験の再現用**＝各自が LS を scratchpad 実装として持っており、production の `_localSearchRoute` とは**別物**（近傍は同一だが
> 停止条件が時間バジェット）。production の挙動を測るなら `_localSearchRoute` を直接 import すること。
> なお `_refineRoute` を import するハーネス（`c27_refine_probe` / `exp_c27_vs_localsearch{,_edison}` / `exp_beam_width_sweep` / `exp_local_search_control` /
> `ml_fit_static`）を壊さないため、`_refineRoute` は export ごと残置している。

**C37/C38 の根拠となった数値を出したスクリプト。結果と解釈は `archive/SEARCH_QUALITY_EXPERIMENTS.md` が正**（本表は「どの数値がどのスクリプト由来か」の対応のみ）。

> ⚠⚠ **本表に載っている napoleon 系の数値は、すべて「旧 config」で測定されたもの**（下の「共通の注意」）。
> **✅config の再発防止は完了（§0.5）だが、数値の再取得は未実施**＝**裏付けとして引用しないこと**（E1）。

| スクリプト | 出した数値（→ 実験記録の節） |
|---|---|
| `exp_beam_width_sweep.mjs` | BW 64〜512 掃引＝BW64 が最悪点・非単調（§1） |
| `exp_prefix_sweep.mjs` | 全17prefix 掃引＝`PREFIX_TOPK=8` は転移・損失0.017%・3層構造（§2） |
| `exp_atk_sensitivity_napoleon.mjs` | ナポ ATK感度＝押し順7割変化・**ダメージ非単調**（§3） |
| `exp_atk_sensitivity_edison.mjs` | A1 エジソン対照＝**厳密単調・一致99.2〜100%**（§6） |
| `exp_local_search.mjs` | 局所探索（近傍3種）＝+3.024%（§5・実験5b） |
| `exp_local_search_multistart.mjs` | 多点スタート＝`pike` 起点 +6.88%（§5・実験5c） |
| `exp_local_search_control.mjs` | **対照**＝BW384+LS が多点LSを上回る（§5・実験5d） |
| `exp_abilcap_isolation.mjs` | B1＝**不安定性の原因は abilCap 19 で確定**（§6b） |
| `exp_horizon_sensitivity.mjs` | B2＝押し順は3分の2変わるが累積は不変（§6d） |
| `exp_buffcount_diag.mjs` | buffCount の buf キー別分解＝全tier が T1 から到達（C38・`buffcount_sim_side_diag.md`） |
| `exp_order_compare.mjs` | 2×2 比較（順×ATK基準）でリプレイ突合＝**G3 v1 撤回の発見に使用** |
| `exp_c27_vs_localsearch.mjs` | B3＝C27 リファインは局所探索に包含されるか（refine無し+LS vs refine有り+LS）＋C27 単独の寄与（§6e） |
| `exp_c27_vs_localsearch_edison.mjs` | B3b＝**エジソン**で C27 単独の改善を LS が包含するか（(a)素/(b)C27単独/(c)素+LS/(d)refine+LS の4点。B3 はナポ編成で C27 が発火せず判定不能だったため）（§6f） |
| `exp_prefix_route_identity.mjs` | C1＝実験1 の「中位7本（総ダメ完全同値）は同一ルートか」をキー列で厳密比較（未検証だった推定を潰す）（§6g） |
| `extract_order_loki.mjs` | **推奨押し順の抽出**（G3）。①全 prefix をビームのみで採点 → ①-b キー列で重複除去を実測 → ②上位N本に局所探索 → 最良。引数=LS対象本数（既定3）。**✅2026-08-02 に①②とも並列化**（逐次 約1時間）。**✅2026-08-05: config は台帳駆動へ移行**（GEAR は proper v1 のままだった）。⚠**敵は loki のまま**（較正ボスは宿儺に確定）・**override `{judg:130,pactcore:1}` は C37 世代・旧 ATK/GEAR で較正**＝loki を使うなら再較正が要る。⚠**C39 でダメージモデルが変わっている**＝過去の出力は再取得が必要。⚠2026-07-31 以降、実走は**実機勘のフリー押し**方針のため本ハーネスの出力は**参考値**（`simulation/sim05/data/record_skeleton.md` 冒頭） |
| `exp_loki_stability.mjs` | **B4＝較正ボス切替（`walpurgis_loki`）の受入検証**。実験2/B1 と同一手続きで ATK 感度を再測（`node tools/exp_loki_stability.mjs <scale>`・1.00 を先に走らせて基準キー列を保存）。ビームのみ＝LS を通さない（後処理の強さと交絡させないため）（§11） |
| `exp_ls_incremental_verify.mjs` | **LS インクリメンタル replay（`_LSReplay`）の結果不変性 回帰**。edison / napoleon×宿儺 の2 config で、LS 近傍3種を網羅サンプリングし `_LSReplay.dmgOf` と full `_replayResult` の **ビット一致**＋受理後（rebase 後）の一致を検証し、1評価あたりのコスト比も出す。所要 **約4分**（内訳はビーム 2本＝43s＋130s）。**`_replayResult` / `_execKey` / `clone` / `_snapshotForReplay` を触ったら必ず回す**（C39 を検出したのがこのハーネス） |
| `exp_t1_abilcap_sweep.mjs` | **sim05 README §4.4.1＝T1 の押下上限を外すとシムの T1 ダメージはどこまで伸びるか**（`DMG.enemy_abil_cap` を掃引・静的greedy で cap 以外を揃える）。実測: cap=19→16.3% / 無制限→24.8%（×1.52・30手で自然枯渇）。⚠⚠**上記の数値は無効**＝**GEAR が最古値（2026-07-27 暫定）のまま**だった（下の「共通の注意」）。加えて「30手で自然枯渇」は**静的greedy が自発的に選ぶ手数**であって押せる上限ではない（**実機の押し順を強制すると 39手通る**＝`calib_replay_compare.mjs`）。**✅2026-08-05: config は台帳駆動へ移行済＝そのまま再実行してよい**（冒頭で E2 の bit 一致を自己検証してから測る）。**正しい config での実測 = cap19→22.8% / 無制限→32.3%（×1.42）**。数秒 |

## 3. ドキュメント検査（2026-08-05 追加）

| スクリプト | 用途 |
|---|---|
| **`doc_refs.mjs`** | **md 相互参照の機械検査**（`npm run doc:check`・DOC_RELATION_PLAN S1）。全 md の参照グラフを構築し ①**壊れた参照** ②**曖昧参照**（裸 basename・`README.md` が15本あるので一意解決できない層）③**被参照ランキング** を出す。**`--write` を持たない＝リポジトリ無改変**。`--ambiguous` / `--graph` / `--refs <path>` / `--json`。<br>⚠ **「解決できない」＝「壊れている」ではない**（地の文 `Node.js`、連結表記 `A.md/B.md`、命名パターン `<CHAR>_REGISTRATION.md` を分離する。初版はこの分離が無く実数の約10倍を報告した）。<br>⚠ **死んだパスを資料として引用する文書**（SESSION_LOG の歴史記述・DOC_RELATION_PLAN のリンク切れ一覧）は `<!-- doc_refs:ignore-begin -->` / `<!-- doc_refs:ignore-end -->` で区間除外する。<br>⚠ `git ls-files` は**非ASCIIパスを8進エスケープする**ため `-z` で受ける／**追跡済みしか出さない**ため実ファイル存在も併せて見る（どちらも実際に踏んだ） |

### 共通の注意

- **⚠⚠ 本表の napoleon 系の数値は「旧 config」で測定されている＝再取得が必要**（2026-08-03 発覚・2026-08-05 に構造対策）。
  ハーネスが config を各自ハードコードし、**configC の GEAR が 2026-07-31 に2回更新されたのに追随していなかった**。
  汚染は GEAR だけでなく**サブ枠・パーティ順・override** にも及ぶ（対比表＝`archive/SEARCH_QUALITY_EXPERIMENTS.md` §0）。
  この config で出した突合は **T1 実機/シム ×1.77（正 ×1.41）／バースト本体 ×1.04（正 ×0.77＝符号ごと反転）** という誤りを生んだ。
  **✅ 対策済＝ §0.5 の `lib/config_c.mjs` へ15本を移行**。**⚠ ただし数値の再取得は未実施**（`workspace/TODO.md`）。
- **config は `lib/config_c.mjs` 経由で台帳から読む**（§0.5・**E10**）。ハードコードしない。
  `verifyE2()` が**記録ルートの強制リプレイ bit 一致**を走行前に自動で通す＝`napo_burst_cd_reduce`・`betaia_*`・
  `CURRENT_SUBS` のような **`_configSig` に含まれない項目も、リプレイ値が動くので検出できる**
  （＝「署名一致だけでは不十分」という E2 の但し書きに、ローダ側で答えている）。
- `exp_atk_sensitivity_*` / `exp_abilcap_isolation` / `exp_horizon_sensitivity` は **引数でスケール/ホライズンを指定し、1条件=1プロセス**で回す設計（E8）。基準条件の押し順を JSON に落として次の条件が読む。
- **旧 E2 アンカー（`archive/caches/sim05_sukuna{,_v2}.json`）はもう使っていない**。engineVersion が2世代前で
  記録値との bit 一致が成立しなかったため（＝E2 が機能しない状態だった）。`exp_loki_stability` / `exp_abilcap_isolation` は
  **現行台帳（`configC_cache_20260803.json`）へ差し替え済**。⚠ `exp_order_compare` だけは入力として旧キャッシュの
  **押し順**を読む（比較自体は同一エンジン内なので成立するが、記録 dmg との照合はできない）。
- 出力先の JSON パスは **`$SCRATCH`（未設定なら `/tmp`）** を見るよう統一済み。⚠ scratchpad はセッション毎に消えるので、
  恒久的に残す数値は台帳（`archive/SEARCH_QUALITY_EXPERIMENTS.md` 等）へ書くこと。

## 4. Phase 9 T1（録画転記）のオフライン検証（2026-08-20 追加）

> ⚠ **T1 はシム本体と非結線**（`transcribe/` ＋ `src/transcribe/`）＝golden に干渉しない。
> ⚠⚠ **Claude はブラウザ画面を見られない**（PHASE9_PLAN §10.1）＝**本節が唯一の実画素の検証経路**。

| スクリプト | 用途 |
|---|---|
| **`t1_selftest.mjs`** | `npm run test:t1`（**373件・約15秒**＝2026-08-23 実測。⚠ 旧記載「1秒未満」は誤り＝[17] 追加前の時点で既に 13秒だった）。合成フィクスチャで**性質**（スクロール/ズーム不変性・格子・マスク・関門）を固定する。<br>★**[16-15] だけが実データ回帰**＝`fixtures/t1_glyph_atlas_M3-1.json` を読み `leaveOneTeachingOut` の **誤≦6 / 正≧80 / 曖昧≦20**（101点）を関門にする。<br>⚠ **合成で通っても実機で通る証明にはならない**＝本 Phase で合成が実機を裏切った型が3つある（PHASE9_PLAN §4.3.0d/e/h） |
| **`t1_teach_probe.mjs`** | ユーザーが保存した**切り抜き**（`.json`＝実画素を data URL で内包 ／ `.png`＝`<png>=<数字>` で正解を付ける）を Node で読み、**ページと同じ経路**で切り出して測る。<br>出力＝①寸法（送り幅・帯・比）②**1枚抜きの読み** ③`--dump <dir>` で切り出し位置を描いた PNG ④**`--atlas <path>` でフィクスチャを書き出す**（`--source` で由来を併記）。<br>★**④が再現性の担保**＝初版のフィクスチャは使い捨てスクリプトで作っており次セッションで再現できなかった。<br>★**`--merge <既存.json>`**（2026-08-23）＝**同じ表示（`text` 一致）の教示回を新しい切り抜きで置き換える**。⚠**過去の切り抜きは手元に残らない**（署名しかリポジトリに入らない＝§10.3）ので、14枚のうち2枚を囲み直したときに**全部の再送を要求しない**ための経路。<br>★**`kind: 'teach-label'` の切り抜き**（`CRITICAL!` / `STING!` / `TOTAL`）も受ける＝**1文字ずつに割らず**語まるごと1枚のテンプレートにして `atlas.labels` へ入れる。<br>★★**打ち間違いを弾く**＝教えた文字列が桁区切りとして読めなければその切り抜きを使わない（実使用で `5,,553,703` が届いた）。 |
| **`t1_verify_probe.mjs`** | ★**検算⑦（`TOTAL` 突合）が実データの誤読を直せるか**をオフラインで測る（P3-1b）。`fixtures/t1_glyph_atlas_M3-1.json` を**教示回ごと leave-one-out** で読み、**k 枚を1押下と見なして TOTAL＝真値の和**を与える。<br>出力＝①**検出率**（残差≠0 で気づけたか）②**★偽の訂正**（TOTAL に一意一致したのに真値と違う＝静かに較正を汚す唯一の型）③一意に直せた件数。<br>`--k 2,3,4` `--accept N` `--search N` `--dump` `--json`。**既定は `src/transcribe/verify.js` から読む**（同じ値を2箇所に書かない）。<br>★`measure()` を export し **`t1_selftest.mjs` [17-9] が同じ関数を呼ぶ**＝計測ロジックを二重に持たない |
| **`lib/png.mjs`** | 依存なし PNG コーデック（`decodePng`/`encodePng`・8bit 非インターレース）。**これができるまで合成だけで調整して実機で外していた** |
| `fixtures/t1_hp_profiles_M3-1.json` | P2-5（HPバー）の実走プロファイル＝**合成では再現できなかった型**（孤立列・演出による ROI 汚染）の回帰 |
| `fixtures/t1_glyph_atlas_M3-1.json` | P3-1 のグリフ・アトラス（**署名の数値だけ**・画像ではない＝PHASE9_PLAN §10.3 の例外）。切り抜き14枚・101標本 |

**アトラスの作り直し**（新しい切り抜きを受け取ったとき）:

```bash
node tools/t1_teach_probe.mjs \
  --atlas tools/fixtures/t1_glyph_atlas_M3-1.json \
  --source 'M3-1.mp4 の教え切り抜き（ユーザー提供）' \
  <切り抜き>.json ...
npm run test:t1     # [16-15] の閾値を実測へ**締め直す**（緩めない）
```

⚠ **同じ表示の切り抜きが複数届いたら、後から届いた（囲みの狭い）方を使う**＝ユーザーが囲み直したもの。
実際に踏んだ＝`5,044,101`(20.0s) が 588×134 と 573×113 の2通りあり、広い方を混ぜると **`validateAtlas` が
比 1.82 で落とした**（誤読も 6→7 に増えた）。★**関門が緩い囲みを実際に捕まえている**。

### 4.1 撤去した検査の記録（回帰の穴を残さないため）

> 検査を消したら**理由をここに残す**（`verify-transcribe-pipeline` が「ベースラインにあった検査が消えている」と警告する）。

| 日付 | 消した検査 | 理由 |
|---|---|---|
| 2026-08-23 | `checkCropFraming` 関連 **4件**（[17-10] 囲みの検査） | ★**測れていなかった**＝`glyphMask` は明るい場面で**画像全体の 42〜73% をインクと判定**する（バースト演出そのものが金色）ので、「枠の縁のインク率」は**ベースラインとほぼ同じ**にしかならない。実際、受領した**7枚すべてで警告**が出た＝何も分けていない。⚠ **誤った説明（「囲みが字を切っている」）のために作った検査**で、その説明を裏書きする循環に入りかけた（経緯＝`PHASE9_PLAN.md` §4.3.0j）。同じ [17-10] 枠には**打ち間違いの検査**（`checkCommaGrammar`＝実使用で `5,,553,703` が届いた）を入れてある |

---

## 5. スキル（ワークフロー自動化・2026-08-22 追加）

**実体は [tools/skills/](skills/README.md)**（スキル定義は `.claude/skills/<name>/` に置く2層構成）。<!-- doc_refs:ignore-line -->
索引だけを置く＝どの数値・どの検査がどのスクリプト由来かを本書で辿れるようにするため。

| スキル | 実体 | 何を回すか |
|---|---|---|
| `check-engine-invariants` | `skills/check_engine_invariants.mjs` | 不変条件の静的検査8種 ＋ `test:t1` ＋ `test:golden`（`--full` で `exp_ls_incremental_verify`） |
| `run-sim-experiment` | `skills/run_sim_experiment.mjs` | `exp_*.mjs` を1条件=1プロセスで実行し、生ログ・provenance・数値を `simulation/simNN/` の様式へ転記 |
| `sync-workspace-handoff` | `skills/sync_workspace_handoff.mjs` | git 差分の層別集計・TODO のチェックボックス/点検カウンタ転記・HANDOFF ドラフト生成 |
| `verify-transcribe-pipeline` | `skills/verify_transcribe_pipeline.mjs` | `fixtures/` の実走データで T1 の精度を測り、`skills/baselines/t1_baseline.json` と突合 |
| **`skills-doctor`** | `skills/skill_doctor.mjs` | **スキル群そのものの点検**＝登録の5点整合／description 予算／検査の根拠（`doc:` の節が実在するか）／**関門の緩み**（`skills/baselines/guardrails.json`）／必要性／発火確認／スモーク |
| （実体のみ） | `skills/negative_tests.mjs` | **検査器の発火確認 13ケース**。`SKILL_ROOT` でサンドボックスへ複製して壊す＝**本物のリポジトリは触らない** |

⚠ **判断はスキル側（Claude）**＝実体が出すのは観測値と「規定のどの節に反しているか」まで。
⚠ **運用規律（S1〜S10）の正は [tools/skills/README.md](skills/README.md) §4**＝「何を機械が見て、何を人が見るか」を明記してある。
⚠ `skills/.reports/` は一時出力（git 管理外・`doc_refs` の検査対象外）。

---

## 更新履歴

<!-- 直近5件のみ（それ以前は git log）。「波及確認」列が本体＝git が持たない情報はここだけ。 -->

| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-22 | §5 に **`skills-doctor` / `negative_tests.mjs`** を追加（スキル群の乖離を1本で見るオーケストレーター＋検査器の発火確認） | 負のテスト **13/13**。関門の台帳＝`skills/baselines/guardrails.json`（変更には `--reason` が要る） |
| 2026-08-22 | **§5 を新設**＝スキル（`tools/skills/` の4本＋`lib/skill_util.mjs`）。`doc_refs.mjs` は `.claude/` と `tools/skills/.reports/` を検査対象外へ（スキル本文に被参照ブロックを注入しない・一時出力で被参照ランキングを汚さない） | 静的検査は**負のテストで5種の発火を確認**（TDZ・キャラ名リテラル・`_refineRoute` 結線・app.js export 漏れ・golden 期待値の台帳同期）。⚠ 実際に踏んだ罠＝**文字列を見る検査で `stripJs` を使うと黙って空振りする**（`from './app.js'` の中身まで潰れる）＝`stripComments` と使い分ける。`--write` 実行で**既存の被参照ブロック4本の陳腐化**（HANDOFF/TODO が参照しなくなった先が残っていた）も同時に解消 |
| 2026-08-22 | **§4 を新設**＝Phase 9 T1（録画転記）のオフライン検証（`t1_selftest.mjs` / `t1_teach_probe.mjs` / `lib/png.mjs` / `fixtures/*`）。`t1_teach_probe.mjs` に **`--atlas` / `--source`** を追加 | ★**索引が T1 を1本も持っていなかった**（P2/P3 の工具はすべて本書の外にあった）＝どの数値がどのスクリプト由来かの原則に反していた。★`--atlas` は**再現性の担保**＝初版のフィクスチャは使い捨てスクリプト製で次セッションに再現できなかった。**再構築で `glyphs`/`samples` がビット一致**することを確認済（差分は `builtAt`/`builtBy`/`labels` のみ）。⚠ 実際に踏んだ罠＝同じ表示の切り抜きが2通り（588×134 と 573×113）あり、広い方だと **`validateAtlas` が比 1.82 で落ちる**＝**関門が緩い囲みを捕まえている** |
| 2026-08-06 | `exp_puvoir_lever.mjs` を追加（M3 の設計支援・見積り専用） | `puvoir` が cap 専用でないこと（`elem_puvoir` +15%）を一次情報で確認したうえでの分離設計。trial01 の holy 8ヒットから**ヒット間 CV 1.04%** を実測し、効果 3.11% が約10σで見えることを確認 |
| 2026-08-06 | **`--lever` を追加**（必要 raw 倍率 / cap 倍率を成分別に解く） | trial01 で **raw 主因 63.9% / cap 主因 31.4%** と分割でき、C25 に機構レベルの説明がついた。⚠ 初版は後段係数（`judg_calib`/`calib_burst`）の割り戻しを忘れて judg ph0 を「×1.0＝一致」と誤表示＝同日修正 |
| 2026-08-06 | `--def` の **no-op バグを修正**（`recalcGearK` 未実行）＋出力に **gross / net / 相殺率**を追加 | ⚠ バグにより「def を動かしても比が動かない」という**誤観測**を trial01_quant §2 に書いていた＝**訂正済**。正しい掃引＝def 5/10/20/40 でシム T1 は 325.7M/256.2M/221.3M/189.0M（**1/def ではなく cap が大半を吸収**）。成分の数値は不変 |
| 2026-08-07 | `calib_replay_compare.mjs` に**記録の検証**を追加（列数不一致でエラー／成分列・ヒット数・FB グループ数を値の並びと照合） | **出力はビット一致**（pre-trial・trial01 とも旧実装と 0 行差分）＝検証専用で帰属ロジックは不変。負のテストで①ヒット落ち②列数不足③成分の書き間違い④FB のヒット落ち をすべて捕捉することを確認。`record_skeleton.md` を同時に改訂（§1 に「key 別 値の並び」表を新設＝この検証の仕様書） |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 3）

- [CALIBRATION_ANALYSIS.md](../CALIBRATION_ANALYSIS.md)
- [CLAUDE.md](../CLAUDE.md)
- [workspace/HANDOFF.md](../workspace/HANDOFF.md)

_他に 凍結sim/archive/essays から 2 件（更新対象外）_
<!-- doc_refs:end -->
