# REPO_STANDARDS — ドキュメント規約＆リクエスト振り分けフロー

> **種別**: 規定（生きた台帳） ／ **ゴール**: どのセッションの Claude Code でも同一の文書作成・ID採番・git 運用ができる状態を保つ ／ **完了条件**: なし（生きた台帳・規約変更はユーザー承認で改版）
> 2026-07-16 制定（ユーザー指示: 統一テンプレートによるメンテナンスコスト・トークンコスト低減）。**新規ドキュメント作成・新規タスク着手の前に本書 §1 の振り分け表を必ず通すこと。**

---

## 1. リクエスト振り分け表（セッション冒頭の分類）

ユーザーのリクエストを受けたら、まず下表で**フローを1つに分類**する。**どの行にも当てはまらない／複数に跨がる場合は、着手前にユーザーへ「どのフローで策定するか」を選択肢つきで確認する**（勝手に新形式を発明しない）。

| リクエスト種別 | フロー | ID | 成果物の置き場所 |
|---|---|---|---|
| 実機とシムの乖離・バグ報告 | CALIBRATION_ANALYSIS.md §4 バックログへ **Cx 起票** → 修正は較正セッション or 通常dev | Cx（全リポ一意） | 台帳=CALIBRATION_ANALYSIS.md（根拠が大きければ simNN/ へ） |
| 較正値・設計判断の確定 | CALIBRATION_ANALYSIS.md §2〜3 へ **Dx 記録**（なぜその値/枠かの根拠つき） | Dx（全リポ一意） | CALIBRATION_ANALYSIS.md |
| 大規模な統計的較正（複数trial・実機バッチ） | `cp -r simulation/TEMPLATE simulation/simNN` → README確定 → trial → 2層分析 | simNN・**Mx**（測定メニュー・sim内連番） | simulation/simNN/ |
| 新キャラ入手・登録較正 | **md-first intake**（ユーザーが §1 一次情報 md 作成→Claude が要検証洗い出し→registry 配線→実機/sim で解消。**フロー詳細＝ROADMAP.md §5**）。要検証は当該キャラの `gamedata/md/神姫|英霊/<key>.md` **§3 登録較正記録**へ直接記録（先例: [gamedata/md/神姫/arianrhod.md](gamedata/md/神姫/arianrhod.md) §3＝旧 ARIANROD_REGISTRATION.md を 2026-07-19 統合）<!-- doc_refs:ignore-line --> | **Ax**（キャラdoc内連番・A0=文言転記から） | キャラmd §3（独立rootドキュメントは作らない） |
| 仮説の起票・検証 | 関連する考察台帳（CHARACTER_ANALYSIS 等）へ **Hx 起票**。台帳がなければ起票先をユーザーへ確認 | Hx（起票文書内連番・引用は `文書名 Hx`） | 既存台帳内（新規docは乱立させない） |
| 一次情報の受領（txt/スクショ転記/実機値） | 内容で振り分け: ゲーム仕様→`gamedata/md/`（神姫/英霊/幻獣/その他）・敵→`gamedata/md/敵/`（README手順）・sim測定→`simNN/data/`・キャラ→キャラ md §3（`gamedata/md/神姫|英霊/<key>.md`） | — | 各所（原文ママ＋出所ヘッダ） |
| エンジン改修・機能追加・リファクタ | CLAUDE.md「Git 開発ワークフロー」＝branch → 実装 → **golden必須** → merge。設計検討が要る規模なら `*_DESIGN.md` を root に | — | src/・root設計doc → 完了後 archive/ |
| フェーズ級の計画（新機能領域） | ROADMAP.md で採番 → `PHASEN_PLAN.md` 作成 | Phase N（ROADMAP が採番台帳） | root → 完了後 archive/ |
| 読み物・振り返り・ガイド | essays/ へ（ゴール/完了条件は不要な唯一の区分） | — | essays/ |

## 2. ディレクトリ体系（確定・変更はユーザー承認）

| 場所 | 責務 | 例 |
|---|---|---|
| root `*.md` | **現役の**規定・台帳・計画（クローズしたら archive/ へ git mv。キャラ登録較正はキャラmd §3 へ＝2026-07-19 改訂） | CLAUDE.md・CALIBRATION_ANALYSIS.md |
| `workspace/` | **起動時必読の変動情報**（現状スナップショット＋次タスク・有界）。2026-07-24 新設 | HANDOFF.md・TODO.md |
| `gamedata/js/` | シムが読むランタイムDB＝現在値（ESM） | weapons.js・characters.js |
| `gamedata/md/` | ゲーム側データの一次情報（神姫/英霊/幻獣/敵/その他） | [gamedata/md/その他/damage_frames.md](gamedata/md/その他/damage_frames.md)・[gamedata/md/敵/cath_palug.md](gamedata/md/敵/cath_palug.md) |
| `gamedata/md/敵/` | 敵DBの intake（一次情報 md → ENEMY_REGISTRY へ蒸留・旧 `enemies/`） | cath_palug.md |
| `simulation/simNN/` | 統計的較正の試行単位（data=一次情報 / analysis=2層構造） | sim03・sim04 |
| `essays/` | 読み物（開発に拘束力なし） | ENGINE_CHRONICLE.md |
| `archive/` | **クローズ済みの歴史台帳**（内容は書き換えない・現状の一次情報ではない） | PHASE7_ML_PLAN.md |
| `src/`・`test/` | エンジン・UI・golden | — |

## 3. ID接頭辞レジストリ（意味は全リポ統一・番号のスコープは台帳文書）

| 接頭辞 | 意味 | 番号スコープ・台帳 | 状態 |
|---|---|---|---|
| **Cx** | 較正乖離（実機vsシム） | **全リポ一意**・CALIBRATION_ANALYSIS.md §4（現在 C1〜C35） | 現役 |
| **Dx** | 確定較正値・設計決定 | **全リポ一意**・CALIBRATION_ANALYSIS.md §2〜3（現在 D1〜D10） | 現役 |
| **Ax** | 新キャラ実機確認項目 | キャラ登録doc内連番（A0=文言転記を必ず先頭） | 現役（先例: ARIANROD） |
| **Mx** | 単独測定メニュー | simNN/README 内連番 | 現役（先例: sim04 M1〜M5） |
| **Hx** | 仮説 | 起票文書内連番・引用は `文書名 Hx` | 現役（今後の仮説はすべてこれ。ad-hoc な新文字を発明しない） |
| **Ex** | **実験・計測の作法（手順規律）** | **本書 §6「実験・計測を回すときの作法」内で連番**（現在 E1〜E8）。引用は `REPO_STANDARDS E1` 等 | 現役（2026-07-28 制定。⚠**Cx/Dx とは別軸**＝Cx=モデルの乖離／Ex=**作業手順の失敗から得た規律**。実験の数値そのものは simNN/ へ、規律だけを Ex に置く） |
| B/F/P/S/K 等 | 旧・文書ローカルID（sim02のB1〜B5・F1、sim03のP1〜P4、Phase5のS1〜S5 等） | 各文書内で凍結 | **凍結**（歴史台帳内の参照はそのまま・新規採番禁止） |

- 起票・状態遷移（open→investigating→fixed/closed/wontfix）は**台帳文書の1箇所だけ**を正とし、他文書からは ID で参照する（本文コピーで二重管理しない）。

## 4. MD統一テンプレート（Claude Code が新規作成する全MD必須）

冒頭に**ヘッダブロック**を置く（essays/ と、simulation/TEMPLATE 系の既定様式を持つファイルは除く）:

```markdown
# <タイトル> — <一行要約>

> **種別**: <規定/プロトコル | 台帳 | 分析 | 一次情報 | 設計 | 計画>
> **ゴール**: <この文書が達成したら何が真になるか・1〜2文>
> **完了条件**: <archive へ移せる条件を列挙。生きた台帳は「なし（生きた台帳）」と明記>
> **状態**: <準備中 | 進行中 | クローズ（→archive済） | 生きた台帳>
> 作成 YYYY-MM-DD ／ 関連: <Cx/Ax等のID・関連文書>
```

- **一次情報**は加えて「出所（ユーザー提供・実機転記等）＋受領日＋原文ママ宣言」を必須とし、**本文は書き換えない**（訂正は冒頭注記で行う＝damage_frames.md 方式）。
- **分析**は入力（どのファイル・どのID）と出力（起票したCx等）を明記する（sim の2層構造ルールに従う）。
- ~~既存MDへの遡及適用はしない~~ → **2026-08-05 改訂**: ユーザー決定により**現役層 52本へ遡及適用する**（[DOC_RELATION_PLAN.md](DOC_RELATION_PLAN.md) §0 決定表）。対象外＝**凍結 sim01〜04 / archive / essays / TEMPLATE**。

### 4.1 末尾ブロック（2026-08-05 新設・★対象は現役層のみ）

冒頭ヘッダに加え、**末尾**に次の2ブロックを置く。⚠ **適用対象は 52本**（除外＝凍結 sim01〜04 86本・**archive 15本**・essays 4本・TEMPLATE 7本）。

```markdown
---
## 更新履歴
<!-- 直近5件のみ。それ以前は git log。「波及確認」は必須（git に無い情報はここだけ） -->
| 日付 | 変更点 | 波及確認 |
|---|---|---|
| 2026-08-05 | C44 の残ゲートを更新 | CLAUDE.md 較正ステータスと workspace/HANDOFF.md を同時更新。sim05 README は影響なしと確認 |

<!-- doc_refs:begin ── 自動生成。手で編集しない（node tools/doc_refs.mjs --write が再生成する） -->
## この md を参照している文書（現役層 6）

- [CLAUDE.md](./CLAUDE.md)
- [DOC_RELATION_PLAN.md](./DOC_RELATION_PLAN.md)
- [ROADMAP.md](./ROADMAP.md)
- [gamedata/md/README.md](./gamedata/md/README.md)
- [gamedata/md/神姫/README.md](./gamedata/md/神姫/README.md)
- [workspace/HANDOFF.md](./workspace/HANDOFF.md)

_他に 凍結sim/archive/essays から 1 件（更新対象外）_
<!-- doc_refs:end -->
```

- **★末尾ブロックは「本文外のメタ領域」と定義する**（ユーザー承認 2026-08-05）。∴ **一次情報の「原文ママ・本文は書き換えない」原則と抵触しない**。
- **更新履歴は直近5件で打ち切る**（それ以前は git log に委ねる）。**「波及確認」列が本体**＝git が持たない唯一の情報。
- **被参照ブロックは手で書かない**。`npm run doc:check`（[tools/doc_refs.mjs](tools/doc_refs.mjs)）が生成・検証する。手書きすると**リスト自体が更新漏れの発生源**になる。
- 種別別の要否（更新履歴は一次情報には不要 等）は [DOC_RELATION_PLAN.md](DOC_RELATION_PLAN.md) §5.2 が正。
- **archive/ は末尾ブロックも入れない**＝§2 の「歴史資料として安置する（内容は書き換えない）」を優先する。
- **★被参照リストに載るのは現役層の参照元だけ**。凍結 sim・archive・essays は「二度と更新しない」と決めた文書なので、
  波及先として並べても実際に直すことはない＝**件数だけ添えて一覧からは外す**。
  （このブロックの目的は「ここを直したら、どこを直すか」であり、網羅ではない。
  CLAUDE.md は被参照48件のうち32件が凍結 sim の trial で、そのまま出すと最も読まれる md がノイズで埋まる。）
- **生成は冪等**＝`node tools/doc_refs.mjs --write` を何度走らせても差分は出ない。
  被参照ブロックは毎回まるごと再生成し、更新履歴の雛形は**無いときに1度だけ**置く（以後は人間が追記する）。

## 5. ライフサイクルと git 運用

1. **作成時**: §1 で分類 → §4 テンプレで作成 → **CLAUDE.md「ドキュメント体系」に1行登録**（同一コミットで）。
2. **クローズ時**: 完了条件の充足を明記 → `git mv` で archive/ へ → 旧パス参照を更新 → CLAUDE.md の登録行を archive 節へ移動（同一コミットで）。
3. **コミット**: 文書のライフサイクルイベント（作成/クローズ/移動）と CLAUDE.md 登録更新は**必ず同一コミット**にする（台帳と実体の乖離防止）。ブランチ運用・golden 検証・push 手順は CLAUDE.md「Git 開発ワークフロー」を正とする。
4. **エンジン/DBに触れる変更**は文書だけの変更でも `npm run test:golden` を回してから commit（golden不変の確認を習慣化）。

## 6. セッション定型（どのセッションでも同じ対応をするための手順）

**起動時（読むのは2本のみ）**:
1. **CLAUDE.md（自動ロード）＋ `workspace/HANDOFF.md`（現状スナップショット）** を読む。次タスクは `workspace/TODO.md`。他doc（sim/CALIBRATION/ROADMAP/Phase/essays/キャラmd）は HANDOFF・CLAUDE のポインタ経由で**必要時のみ**読む（新セッション移行のトークン浪費を避ける＝2026-07-24 ドキュメント運用刷新）。過去の経緯は `archive/SESSION_LOG.md`。
2. 着手前に本書 §1 で分類。分類が曖昧・複数フロー跨ぎ・新形式が必要 → **ユーザーへ選択肢つきで確認**（例:「これは Cx 起票＋simNN 新設のどちらで進めますか」）。

**実験・計測を回すときの作法（2026-07-28 制定・同じ時間の溶かし方を繰り返さないため）**:

実測で確立した規律。いずれも本セッションで**実際に失敗して**得たもの（詳細な根拠は CALIBRATION_ANALYSIS C37）。

| # | 規律 | 失敗の実例 |
|---|---|---|
| E1 | **リポジトリ内の数値（コメント・過去の測定値）は、測定条件が不明なら前提にしない。必ず実測してから使う** | `test/golden.mjs`「edison ~2s」を信じて実験設計→実測57.8s＝**29倍の誤り**。C16「BW64で飽和」を一般則と読む→編成依存で**5.6%取り逃し** |
| E2 | **headless で config を再現したら、既知値との bit 一致を先に確認してから本番を回す**（署名一致だけでは不十分＝`_configSig` に含まれない項目がある） | サブ枠と英霊武器を欠いた条件で G3 押し順を抽出→**20分の探索を2回無駄**にし v1 撤回 |
| E3 | **差は絶対値で評価する。順位の逆転だけで結論しない** | PREFIX_TOPK で「最良が不採用枠にあった」→実は損失 0.017%＝実害なし。過剰反応だった |
| E4 | **対照実験を取る前に結論を出さない** | 「多点LSが BW384 を超えた」→BW384 にも同じ LS をかけると**逆転**（LSは加算的な後処理だった） |
| E5 | **実験は同時実行しない。コスト比較は負荷条件を揃える** | BW384 探索が単独 545s → 同時実行 762s（**約40%増**） |
| E6 | **`pgrep -f <文字列>` による待機は自己一致で無限ループになる**（待機コマンド自身の cmdline がパターンに一致）。**バックグラウンド完了はハーネスの通知に任せ、自前の待機ループを書かない** | `until ! pgrep -f "golden.mjs"` が自身に一致→**20分待機して未実行**。同一現象を2回踏んだ |
| E7 | **外部コマンドの存在を前提にしない**（計測・補助ツールは本番ジョブに組み込む前に単体確認） | `/usr/bin/time` が環境に無く**4条件すべて失敗**・1サイクル損失 |
| E8 | **長時間ジョブは1条件=1プロセスにする**（同一プロセスで条件を反復すると顕著に遅くなる） | 同一プロセスで4条件→2条件目が本来17分のところ33分超で timeout |
| E9 | **エジソン編成で確立した機構・定数は、新編成では必ず再測する**（一般則として書けるのは**2編成以上で再現**したときだけ）。原則と該当事例＝**CLAUDE.md 開発ルール §5** | `BEAM_W=64`(C16)／Phase7 §7.2／`CALIB_GRID`／C27リファイン の**4例**が同じ形で外れた（2026-08-01 に §5 として明文化） |
| E10 | **config（GEAR/サブ枠/パーティ順/敵/表示ATK/override）は台帳から読む。ハーネスにハードコードしない。**<br>台帳＝**受領キャッシュ JSON**（`_configSig` に GEAR/サブ枠/パーティ順/敵、value に `dispAtk`/`override`/`turnsKeys`/`dmg`）。キャッシュ1本で config が完全再現でき、**記録ルートの強制リプレイが bit 一致するか**で E2 が自動的に通る。実装＝**`tools/lib/config_c.mjs`**（`loadConfigC()` / `verifyE2()` / `configBanner()`）。<br>やむを得ずハードコードするなら**台帳の版を併記する**（例: 「configB＝`simulation/sim04/data/config.json` と同値・凍結」）。出力には必ず走行 config を1行で出す（provenance）。 | ハーネス15本が **configC の最古 GEAR**（`burst_cap 2.016`／正 2.34）を持ったまま動き続け、`simulation/sim05/analysis/` の初版がその GEAR で計算された。**T1 全体比 ×1.77 →（正しい GEAR で）×1.41**、**バースト本体 ×1.04（一致）→ ×0.77（シムが30%過大）**＝**`calib_burst` が転移している/していない が符号ごと反転**（2026-08-03 発覚・2026-08-05 に15本を台帳駆動へ移行） |

**セッション末（現状を有界に保つ）**:
3. **`workspace/TODO.md` を更新**（完了項は `[x]`→ 該当を SESSION_LOG へ畳んで本書から削除・新規タスクは §1 分類を通してから追加）。
4. **`workspace/HANDOFF.md` を最新状態へ上書き**（「今」だけを短く）。押し出された進行＝現状化した経緯は **`archive/SESSION_LOG.md` の先頭（最新が上）へ1ブロック畳む**（provenance 保全・HANDOFF の青天井化防止）。
5. トークンコスト配慮: 生trialや大型台帳の全文読みは避け、sim の2層構造（per_trial→rollup→integrated）と ID 参照で必要最小限を読む。**CLAUDE.md には「現状/次タスク」を書かない**（安定リファレンスに留め、変動情報は workspace/ と SESSION_LOG が持つ）。
6. **★md リレーション点検（常駐サブタスク・2026-08-05 新設）**: `workspace/TODO.md` 冒頭のカウンタを **+1** する。
   次のいずれかなら **`npm run doc:check` を実行してカウンタを 0 に戻す**:
   - **イベント駆動（必須）**: md の**新設・リネーム・archive 移動**があったセッション
   - **定期**: カウンタが **5 に到達**したセッション（`doc_refs.mjs` が超過を警告する）
   検査が現役層の壊れた参照を出したら**そのセッションで直す**（archive/ と凍結 sim01〜04 の警告は**対象外＝直さない**）。
   設計と段階計画は [DOC_RELATION_PLAN.md](DOC_RELATION_PLAN.md) §7。

---

## 7. 参照の統一文言（2026-08-05 制定・[DOC_RELATION_PLAN.md](DOC_RELATION_PLAN.md) §4 が設計の正）

**目的**: 参照を**機械検証可能**にし、「関連 md の更新漏れ」を構造的に潰す。`npm run doc:check` が本節への適合を検査する。

### 7.1 参照の書式

```markdown
→ 詳細は [CALIBRATION_ANALYSIS.md](CALIBRATION_ANALYSIS.md) C37
→ 詳細は [simulation/sim05/README.md](simulation/sim05/README.md) §4.8
```

- **リポジトリ根からのパス**を markdown リンクで書く。**裸の basename は使わない**（`README.md` は15本あり一意に解決できない）。 <!-- doc_refs:ignore-line -->
- **文脈依存の略記を使わない**（例: `workspace/HANDOFF.md` に `analysis/PROVISIONAL_ANALYSIS.md` と書いても、HANDOFF の位置では解決しない）。 <!-- doc_refs:ignore-line -->
- ID がある台帳（Cx/Dx/Ax/Mx/Hx/Ex）は**必ず ID まで書く**。

### 7.2 引用は最低限にする（単一の正）

| 引用の中身 | 扱い |
|---|---|
| **軽量な数値**（1値・その場で意味が閉じる） | **そのまま書いてよい**（例: `golden = 202,005,923`・`BW=64`） |
| **情報量が多いもの**（複数行の表・手順・結論の連なり） | **ID 参照にする**（本文をコピーしない） |
| **状態**（open / fixed / investigating） | **例外なく ID 参照**（§3 の再掲＝台帳文書の1箇所だけを正とする） |
| どちらとも言えない | **出所と日付を併記して書く**（E1 と対。例: `×0.77（CALIBRATION_ANALYSIS C44・2026-08-03 時点）`） |

**判定基準**: 「その情報が**更新されたとき、ここも直さないと嘘になるか**」。
1値なら検知も修正も容易だが、**表・手順・状態の塊は部分的にズレたまま気づかれない**＝そこだけを潰す。

**例外**: 起動時必読の2本（[CLAUDE.md](CLAUDE.md) / [workspace/HANDOFF.md](workspace/HANDOFF.md)）は要約を持ってよい。
「読むのはこれだけ」という設計上、要約の保持が本質だから。ただし**正がどこかを明示**する。

### 7.3 検査の除外

- **死んだパスを資料として引用する区間**（歴史記述・リンク切れ一覧）は `<!-- doc_refs:ignore-begin -->` 〜 `<!-- doc_refs:ignore-end -->` で囲む。1行なら `<!-- doc_refs:ignore-line -->`。
- **未作成ファイルへの前方参照**（計画中のファイル）も同様に囲み、**いつ作るか**をその場に書く。
