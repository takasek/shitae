# #25 受入記録（独立した状態軸の表し方と組合せ確認）

Issue [#25](https://github.com/takasek/shitae/issues/25) の記録。処理系は origin/main `fea6132` から作った `issue-25-independent-state-axes`。engine `278103a97da5…`。製品コード・SPEC・原モデル・旧証拠・旧scenarioは変更していない（`git diff origin/main` の変更は `docs/AI_GUIDE.md` とこのdirectoryだけ）。

## 成果物

| 種類 | ファイル | 内容 |
| --- | --- | --- |
| ガイド | [AI_GUIDE「一つの variant 集合にするか、component を分けるか」](../../../AI_GUIDE.md#一つの-variant-集合にするかcomponent-を分けるか) とチェックリスト1項目 | 分ける例・分けない例（反例）・組合せを先に書いてから操作する方法。SPEC の singleton 節と「扱わないもの」へ導線 |
| 期待 | [expectations.md](expectations.md) | モデルを書き直す前に書いた、出来事の組合せごとの「残るもの・変わるもの」。最初のcommit |
| 派生モデル | [model/proposed.shitae](model/proposed.shitae) | 保存済み Sol proposed のコピーで、`DocumentStatus` を `#! SyntaxStatus`（Valid/Invalid）と `#! DiskStatus`（InSync/Conflict）に分けた。`DocumentStatus` は両方を置く通常 component。操作名は原モデルと同じ |
| 決定的検査 | [check-axes.mjs](check-axes.mjs)、[check-mutants.mjs](check-mutants.mjs)、[check-guide-example.mjs](check-guide-example.mjs) | 公開 CLI `shitae session` で組合せを操作し、期待と照合する |
| 再検討 | [reexamine/](reexamine/) | #23 の検討手順を使った選び直しと新規 scenario |
| 別の作者 | [independent/](independent/) | 異なる題材での分け方の説明 |

原モデル [2026-10-13-standalone/sol/models/proposed.shitae](../../../dogfooding/2026-10-13-standalone/sol/models/proposed.shitae) と、それと bytes が一致する [sol-original](../../../dogfooding/2026-10-16-end-to-end/models/sol-original/proposed.shitae) はそのまま残した。

## 受入条件との対応

### 構文が復帰しても競合が未解決と読める

[check-axes.mjs](check-axes.mjs) は [expectations.md](expectations.md) の C1〜C5 を、各組合せ新しい process で操作し、各操作の後に `query state/actions` を照合する。モデル名と問いの対応（例:「競合」は `DiskStatus##Conflict`）だけを profile として人が書き、期待はモデルに依存しない。

- 原モデル（profile `original`）: C1・C4・C5 が失敗する（[original-check.json](original-check.json)）。C1 の Conflict→ParseError→ValidInput で競合が失われ、C4 の ParseError→Conflict→Review→SaveCopy では解決後に構文が「妥当」と読める一方 DiagramView は Error のまま残る。2026-10-16 の評価で観察した欠陥と同じものを検出した。
- 派生モデル（profile `split`）: 8組合せすべて通過（[split-check.json](split-check.json)）。
- 検査が空振りしないことの確認: [check-mutants.mjs](check-mutants.mjs) が派生モデルに5種の改変を入れ、すべて想定した組合せで失敗した（[mutants.json](mutants.json)）。ValidInput が競合を消す、解決が構文も直す、Review が競合を解決する、KeepEditing が通知を戻さない、ノード操作の gate を外す、の5つ。

### 比較の取消は競合保持、明示的な解決は解除。通知と競合を同義にしない。図のノード操作 gate と整合

- C2: Review で通知は消え比較が開くが競合は残る。KeepEditing で通知が戻り競合も残る。
- C3: SaveCopy [Success]・ReplaceReviewedDisk [ConfirmedFresh]・UseDiskVersion [ConfirmedFresh] で競合が解除され、DiskChangedAgain では比較が開いたまま競合が残る。
- C5: 競合中でも DiagramView が Ready ならノード操作（`NodeDoubleClick(DiagramView.graph?)`）は可能、ParseError で不可、ValidInput で可能に戻る。
- 自由文 effect（`Preserve both versions` など）は照合に使っていない。「解決」は条件ラベルの経路を選んだ後のモデル上の状態だけを指す。

設計上の選択として、解決操作は構文軸を変えない（C4）。UseDiskVersion でエディタの内容が入れ替わっても、取り込んだ内容の構文はモデルが知らないため、再評価は ParseError・ValidInput の出来事で表す。この選択は設計者の確認対象として残す。

### ガイドの例・反例が SPEC と一致し、check・生成・公開CLI・実ブラウザで照合する

- ガイドの例は新しい構文を導入せず、既存の `#!`・`set`・`show`/`hide`・`present`/`dismiss`・条件ラベルだけを使う。SPEC が「扱わないもの」に挙げる並行状態や条件式を導入しないこと、組合せで挙動を分ける条件式は書けないことを本文に明記した。
- [check-guide-example.mjs](check-guide-example.mjs) は AI_GUIDE の該当節から shitae ブロックを抜き出し、`shitae check` でエラーなし・warning 0 を確認する。続けて C1・C2・C3-SaveCopy・C4（例にない操作を使う組合せは除く）を通過することを確認した。ガイドが避けるよう書いている「一つの `#! 文書状態` に 妥当/不正/競合 を並べた版」は C1・C4 で失敗する（[guide-example-check.json](guide-example-check.json)）。
- 派生モデルは `check` でエラーなし。warning は原モデルと同種の W103（空の葉 component）で、追加した `SourceParsed` の1件だけ増えた。
- 生成: `simulate` で [derived.html](derived.html) を生成。ローカル directory の絶対パスは含まれない。

#### 実ブラウザ

Claude desktop の内蔵ブラウザで、derived.html を 127.0.0.1 の一時 HTTP サーバーから開いた（確認後に停止）。「部品の状態を表示」を on にし、操作は実クリック、値の読取りは表示されたテキストを使った。

1. Conflict → ParseError → ValidInput: `SyntaxStatus ##Valid`、`DiskStatus ##Conflict`、RecoveryNotice 掲示中（[browser-c1-valid-input.jpg](browser-c1-valid-input.jpg)）。
2. Review → KeepEditing: Review 後は VersionReview が本体で通知カードなし。KeepEditing 後は Split に戻り、`DiskStatus ##Conflict` と通知が戻った。
3. DiagramOnly → ParseError → ValidInput: NodeDoubleClick は競合中も有効、ParseError 後は「gate off で無効」、ValidInput 後に有効へ戻った。
4. Review → SaveCopy [Success]: `DiskStatus ##InSync`、通知なし、構文と図は変わらない。

ページの保存・書出しボタンを実クリックし、ダウンロード処理をページ内で受け取った（ファイル保存ダイアログは使っていない）。保存された scenario（10手順）の正準化 JSON の SHA-256 と、同じ10操作を公開 CLI で選んだ [reexamine/derived-browser-path.scenario.json](reexamine/derived-browser-path.scenario.json) の値は一致した（`a310c2ce…`）。書出した検討手順の SHA-256 も CLI の review text と一致した（`55444fac…`）。

ブラウザで見つけた制約: VersionReview の画面には `DocumentStatus` が置かれていないため、比較を開いている間の競合の値は GUI の本体表示では読めない（gate 用ドロワーにも DiskStatus は出ない）。この間の競合保持は CLI の state 照会（check-axes の C2・C3 と下記の再検討）で確認した。モデルや製品の変更はしていない。

### 別の作者が「分ける場合」と「一つの集合でよい場合」を説明できる

文脈を共有しない Claude subagent（Sonnet）に、AI_GUIDE と SPEC だけを読ませ、音楽アプリの曲詳細（再生・ダウンロード・曲情報の読込）をモデル化させた。分けるかどうかは伏せた。`docs/design/` と `docs/dogfooding/` は読まないよう指示し、報告で読んだファイルを列挙させた。

- 再生・ダウンロード・曲情報を3つの singleton に分け、各軸の内側（再生中/一時停止 等）は一つの集合のままにした。理由を「再生中→ダウンロード完了の後も再生中が残るべき」などの組合せで説明し、一般化した説明も書けた（[author-report.md](independent/author-report.md)、[music.shitae](independent/music.shitae)、`check` エラーなし）。
- 迷った点として「`shitae session` の使い方が AI_GUIDE にない」を挙げた。ガイドから [session-usage](../../session-usage.md) へのリンクを追加した。ほかに、要素行の `;`、組合せの制約を書けないこと、document common の `set` の効果範囲を挙げた。いずれも今回のガイド範囲外として変更していない。
- 限界: ハーネスが AGENTS.md・CLAUDE.md を自動で文脈に添付している。作者はモデルを CLI で実行していない（手書きの表と SPEC で判断した）。agent 1体の結果であり、人間の作者一般に広げない。

### 旧 scenario の source-byte 不一致拒否を維持し、派生モデルで新規記録する

[replay-rejections.txt](reexamine/replay-rejections.txt) に4通りの再生結果を記録した。

- 2026-10-16 の旧 scenario（engine `8679f277…`）は、原モデルでも派生モデルでも `ENGINE_MISMATCH` で拒否される。engine の不一致が先に報告されるため、この旧 scenario では source-byte の照合まで到達しない。
- そこで現在の engine で原モデルに同じ問いを新しく記録した（[original.scenario.json](reexamine/original.scenario.json)、Conflict→ParseError→ValidInput→Review→KeepEditing）。原モデルでは再生でき、派生モデルでは `MODEL_MISMATCH: source bytesが異なるmodule: proposed` で拒否される。
- 派生モデルの記録は新規ファイルとして作った（受取人の [derived.scenario.json](reexamine/derived.scenario.json)、ブラウザ経路の [derived-browser-path.scenario.json](reexamine/derived-browser-path.scenario.json)）。前者は派生モデルで再生でき、原モデルでは `MODEL_MISMATCH` で拒否される。旧証拠は上書きしていない。

### #23 の検討手順を参照し、修正前と同じ問いを再検討する

原モデルで記録した [original.review.txt](reexamine/original.review.txt)（#23 の `review` 照会）と派生モデル本文だけを、別の Claude subagent（Sonnet、文脈共有なし）に渡した。問いは「競合の後に構文エラーと修正を経ても、比較を開いて取り消しても、競合は未解決か」とし、答えは伏せた。原モデル本文、AI_GUIDE、evidence・dogfooding は読ませていない。

- 受取人は手順と同じ5操作を actions 照会から選び直し、各時点の sharedVariants・overlays を照会して「競合は残る」と答えた（[recipient-report.md](reexamine/recipient-report.md)、[送受信](reexamine/derived.jsonl)、[検討手順](reexamine/derived.review.txt)）。
- 選び直しの誤り: なし。転記: なし（handle の session ID 部分を自作 helper に固定した以外）。追加質問: なし。
- 操作名・host・配置・結果の数と順序は一致し、`set(...)` の対象名だけが変わった（DocumentStatus → DiskStatus / SyntaxStatus）。受取人は、この違いを派生モデル本文を読んで対応付けたと報告した。原モデルの検討手順と派生モデルの検討手順の差分も、`set` の対象名の行だけだった。
- 限界: 受取人は agent 1体。問いの範囲外として解決操作（InSync へ戻る）は操作しなかった。操作名が変わらない設計変更だったため、名前の変更を伴う選び直しは試していない。

## 再実行

worktree の root で `pnpm install --frozen-lockfile && pnpm -r build` の後に実行する。

```sh
node docs/design/evidence/state-axes/check-axes.mjs docs/dogfooding/2026-10-16-end-to-end/models/sol-original/proposed.shitae original
node docs/design/evidence/state-axes/check-axes.mjs docs/design/evidence/state-axes/model/proposed.shitae split
node docs/design/evidence/state-axes/check-mutants.mjs
node docs/design/evidence/state-axes/check-guide-example.mjs
```

1行目は失敗（終了コード 1）が期待どおり。`record.mjs` は既存ファイルを上書きしないため、再記録するときは別の出力名を渡す。

`pnpm -r --no-bail test` は変更前に全 package 通過（simulator 248件を含む）。本変更は製品コードと `docs/examples` を変更していない。
