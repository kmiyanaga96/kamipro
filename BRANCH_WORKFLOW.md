# ブランチ運用メモ — 節目で `main` へ集約するワークフロー

> 目的: Claude Code on the web は新セッション毎に作業ブランチ `claude/<...>` を自動生成する。
> 放置するとブランチが乱立するため、**`main` を恒久トランク（＆GitHub Pages 配信元）とし、節目で作業ブランチを
> `main` へマージして削除**する運用に統一する。本書はその手順と注意点のメモ。

---

## 0. 現状と目標構成

- **現状**: `main` が存在せず、唯一のブランチ `claude/keen-ritchie-4rnr7c` がデフォルトブランチ（GitHub Pages もこれを配信）。
  安定トランクが無いため、新セッションが「claudeブランチ」を更に分岐し乱立する。
- **目標**:
  - `main` = **恒久トランク**。GitHub Pages はここから配信。
  - `claude/<...>` = 各セッションの一時作業ブランチ。**節目で `main` へマージ→削除**。
  - 常に「`main` ＋ 作業中の1本」だけが存在する状態を保つ。

---

## 1. 【一度だけ】`main` トランクの確立

> 現在の作業ブランチ `claude/keen-ritchie-4rnr7c` の内容を `main` に昇格させる。GitHub Web UI で実施。

1. **`main` ブランチを作成**
   - GitHub リポジトリ画面 → ブランチ選択ドロップダウン → `main` と入力 → 「Create branch: main from 'claude/keen-ritchie-4rnr7c'」を選択。
   - （CLI派なら: `git checkout -b main claude/keen-ritchie-4rnr7c && git push -u origin main`）
2. **デフォルトブランチを `main` に変更**
   - Settings → General → 「Default branch」→ 鉛筆アイコン → `main` を選択 → Update。
3. **GitHub Pages の配信元を `main` に切替**
   - Settings → Pages → Build and deployment → Source = 「Deploy from a branch」→ Branch = `main` / `/(root)` → Save。
   - 数十秒後、Pages が `main` から再ビルドされる（Actions タブで進捗確認可）。
   - カスタムドメインを使う場合のみ: Pages 設定の「Custom domain」に入力（CNAMEファイルは GitHub が自動管理）。使わないなら空のままで github.io URL を使用。
4. **配信を確認してから、旧ブランチを削除**
   - Pages の URL を開き、ページが正しく表示されることを確認。
   - 確認後、`claude/keen-ritchie-4rnr7c` を削除（Branches 画面のゴミ箱アイコン）。
   - ⚠ Pages が `main` 配信に切替わり表示OKを確認する**前**に旧ブランチを消さない。

> これ以降、リポジトリは「`main` のみ」から始まり、セッション毎に `claude/<...>` が増える運用になる。

---

## 2. 【毎回の節目】作業ブランチを `main` へ集約

> 1セッション分の作業がまとまり安定したら実施。「マージ → 確認 → 削除」の順を厳守。

1. **作業ブランチを push 済みにする**（セッション内の変更を全てコミット＆push）。
2. **`main` へマージ**（どちらか）
   - **PR経由（推奨・履歴と差分が残る）**: GitHub で `claude/<work>` → `main` の Pull Request を作成 → Merge。
   - **直接マージ（CLI）**:
     ```bash
     git checkout main && git pull origin main
     git merge --no-ff claude/<work>
     git push origin main
     ```
3. **Pages 再ビルドと表示を確認**（Actions タブ完了 → Pages URL を開いて確認）。
4. **作業ブランチを削除**
   - リモート: GitHub Branches 画面のゴミ箱（※セッション内 `git push --delete` は組織ポリシーで 403 になることがあるため Web UI が確実）。
   - ローカル: `git branch -d claude/<work>`。

---

## 3. 【新セッション開始時】`main` を基点にする

- 新しい Claude Code セッションを作る際、**ソース/ベースブランチを `main` に設定**する。
  セッションは `main` から新しい `claude/<...>` を切って作業する。
- そのセッションの作業が安定したら **§2 で `main` へ集約＆作業ブランチ削除**。
- これで常に「`main` ＋ 作業中1本」に保てる（過去の `wizardly-dirac` のような取り残しブランチが出ない）。

---

## 4. 注意点（重要）

- **順序厳守**: マージ → Pages表示確認 → 削除。確認前に作業ブランチを消すと、未マージ作業が消失し得る。
- **GitHub Pages の配信元**: `main` を指していること。`claude/*` を指したままだと `main` への集約が反映されない。
- **CNAME / カスタムドメイン**: 使うなら Pages 設定で管理（手動で CNAME ファイルを作る/消すと不整合の元。過去に作成→削除した経緯あり）。使わないなら触らない。
- **ブランチ削除の 403**: このリモートは git 経由のブランチ削除が組織ポリシーで拒否されることがある。**削除は GitHub Web UI** で行う。
- **エージェントへの権限**: セッション内の Claude は既定で割当ブランチに開発し `main` へは勝手に push しない。私（Claude）にマージまで任せたい場合は「`main` にマージして push して」と明示的に指示すること（または §2 を自分で UI 実施）。
- **分岐の取り残し対策**: 万一複数の `claude/*` が並走したら、それぞれ `main` へマージ可能かを確認（`git log main..claude/<x>` で固有コミット差分を見る）してから集約・削除する。今回の `wizardly-dirac` は keen の旧祖先＝固有差分ゼロだった。
- **マージ衝突**: 「常に `main` から切って速やかに戻す」運用なら衝突は最小化される。長く分岐させた場合のみ衝突解消が必要。

---

## 5. クイックリファレンス（CLI）

```bash
# --- 一度だけ: main 確立 ---
git checkout -b main claude/keen-ritchie-4rnr7c
git push -u origin main
# → GitHub Settings で デフォルトブランチ=main, Pages Source=main に変更

# --- 毎回の節目: 集約 ---
git checkout main && git pull origin main
git merge --no-ff claude/<work>
git push origin main
# → Pages 表示確認後、GitHub UI で claude/<work> を削除
git branch -d claude/<work>     # ローカル後始末

# --- 取り残しブランチの固有差分確認（削除前チェック）---
git log --oneline main..claude/<x>   # 空なら main に内包済み=安全に削除可
```
