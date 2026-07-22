# napoleon/arian 編成 移行ステージング（着手は次回以降）

> **状態: 未着手・叩き台のみ退避（2026-07-22）**。ユーザー方針: sim04（現編成=エジソン基軸）の絶対値較正を締め、**ナポレオン・アリアンロッド編成が現状の実機最強の感触**につき早めに移行したい。所感は後日共有予定。
> 本フォルダは正式 simNN ではない（採番は移行着手時に REPO_STANDARDS §1 で確定）。

## 編成
- **英霊=ナポレオン**、パーティ=**ヘカテー / テトラ / アリアンロッド / エレイン**（幻獣=freyja_christmas / artemis 継続）。
- 現編成（sim04）との差: エジソン→ナポレオン（英霊）、ヤマト→アリアンロッド。ヘカ/テトラ/エレインは継続。

## 実機 表示ATK / HP（ユーザー提供・2026-07-22）＝移行時に DISPLAY_ATK_OVERRIDE / HP_OVERRIDE へ反映
| キャラ | 表示ATK | 表示HP | Lv |
|---|---|---|---|
| ナポレオン | 102,262 | 12,675 | （英霊） |
| ヘカテー | 75,558 | 10,714 | Lv80 |
| テトラ | 83,718 | 11,089 | Lv95 |
| アリアンロッド | 77,297 | 10,119 | Lv80 |
| エレイン | 85,054 | 11,807 | Lv95 |

- ⚠ 共有キャッシュ（`cache_placeholder_20260722.json`）**同梱の dispAtk は fallback 満凸推定**（napoleon 30,021 / arianrhod 31,737 等）で**上表の実機値とは別物**＝キャッシュの絶対総ダメ(3.18B)・推奨順は暫定。移行時は上表で `DISPLAY_ATK_OVERRIDE` を更新し headless 再探索で基準順を取り直す。
- sim04(configB)比でヘカ/テトラ/エレインもATK微増（73727→75558 等）＝装備が更に変化。

## 敵
- 共有キャッシュの敵は **汎用placeholder**（max_hp=100,000,000・GEAR elem=0.54＝光属性UP設定）。**本番の較正ボスは移行時に別途確定**（cath_palug 続投か新ボスか未定）。

## 移行時にやること（着手時の順序メモ）
1. `DISPLAY_ATK_OVERRIDE` / `DISPLAY_HP_OVERRIDE` を上表へ更新（napoleon/arianrhod 行を新規追加）。
2. 較正ボス確定＋ configC（新装備パネル→GEAR）を export 受領。
3. frame calib（calib_na/calib_burst/judg_calib）は**編成非依存で自動継承**＝土台は流用。新編成固有を検証:
   - **アリアン追撃**（主火力になり得る）＝積み残しの追撃式（abi_dmg加算・cap／CALIBRATION_ANALYSIS C3/C5）を**この編成のアンカーで解く**。
   - **ナポレオン機構**・**2T周期ループ**（アリアン `elegant`/`elegant_re` の2T再発動＝ユーザー実機観測）を再現検証。現実装 guard: `elegant_re` は `T.elegant<(t===1?4:3) && g>=40`＝この周期と整合するか要突合。
4. override は config別に自動較正（この編成では暫定 {judg:145,pactcore:1,**effond:107**}＝effond が新レバー・prefix=["miti"]）。

## 参考: 現状シム出力（frame calib込み・ENGINE_VERSION sim04-abscal-C31C34-calib）
`cache_placeholder_20260722.json`（是非未検証・ユーザー共有の叩き台）。
