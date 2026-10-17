# #25 受入記録（独立した状態軸の表し方と組合せ確認）

Issue [#25](https://github.com/takasek/shitae/issues/25) の記録。処理系は origin/main `fea6132` から作った `issue-25-independent-state-axes`。engine `278103a97da5…`。製品コード・SPEC・`docs/examples`・原モデル・旧証拠・旧scenarioは変更していない（`git diff origin/main` の変更は `docs/AI_GUIDE.md` とこのdirectoryだけ）。

## 成果物

| 種類 | ファイル | 内容 |
| --- | --- | --- |
| ガイド | [AI_GUIDE「一つの variant 集合にするか、component を分けるか」](../../../AI_GUIDE.md#一つの-variant-集合にするかcomponent-を分けるか) とチェックリスト1項目 | 分ける例・分けない例（反例）・組合せを先に書いてから操作する方法。SPEC の singleton 節と「扱わないもの」、session の使い方へ導線 |
| 期待 | [expectations.md](expectations.md) | モデルを書き直す前に書いた、出来事の組合せごとの「残るもの・変わるもの」。最初のcommit。レビュー後に原モデルの観察位置の記述だけを訂正した（同ファイルに明記） |
| 派生モデル | [model/proposed.shitae](model/proposed.shitae) | 保存済み Sol proposed のコピーで、`DocumentStatus` を `#! SyntaxStatus`（Valid/Invalid）と `#! DiskStatus`（InSync/Conflict）に分けた。`DocumentStatus` は両方を置く通常 component。操作名は原モデルと同じ |
| 決定的検査 | [check-axes.mjs](check-axes.mjs)、[check-mutants.mjs](check-mutants.mjs)、[check-guide-example.mjs](check-guide-example.mjs) | 公開 CLI `shitae session` で組合せを操作し、期待と照合する |
| 再検討 | [reexamine/](reexamine/) | #23 の検討手順を使った選び直しと新規 scenario |
| 実ブラウザ | [browser/](browser/)、[guide-example/](guide-example/)、画像2枚 | 派生モデルとガイドの例の操作記録 |
| 別の作者 | [independent/](independent/) | 異なる題材での分け方の説明 |

原モデル [2026-10-13-standalone/sol/models/proposed.shitae](../../../dogfooding/2026-10-13-standalone/sol/models/proposed.shitae) と、それと bytes が一致する [sol-original](../../../dogfooding/2026-10-16-end-to-end/models/sol-original/proposed.shitae) はそのまま残した。

派生モデルの原モデルからの差分は次の通り。冒頭コメント1行、ParseError/ValidInput/Conflict と3つの解決操作の `set` 対象の付け替え、`DocumentStatus` を通常 component にして2つの singleton を置く形への変更。旧 `##Valid` の要素 `SavedOrUnsaved` は `DiskStatus##InSync` へ移り、`SyntaxStatus##Valid` には新しい葉 `SourceParsed` を置いた。

## 受入条件との対応

### 構文が復帰しても競合が未解決と読める

[check-axes.mjs](check-axes.mjs) は [expectations.md](expectations.md) の C1〜C5 を、組合せごとに新しい process で操作し、各操作の後に `query state/actions` を照合する。期待表の「—」（前の行から変わらない）も照合するため、各表の列を初期値から始め、行ごとの変化を積み上げた値と比べる。モデル名と問いの対応（例:「競合」は `DiskStatus##Conflict`）だけを profile として人が書き、期待はモデルに依存しない。

- 原モデル（profile `original`）: C1・C4・C5 が失敗する（[original-check.json](original-check.json)）。
  - C1・C5: ParseError の `set(DocumentStatus##Invalid)` が Conflict を上書きし、その時点で競合が失われる。2026-10-16 の評価で観察された欠陥と同じ。
  - C4: Conflict の `set(DocumentStatus##Conflict)` が Invalid を上書きし、その時点で構文エラーが記録から消える。profile は `DocumentStatus` が Invalid 以外なら構文を妥当と読む（Conflict を構文不正と読む根拠がモデルにないため）。最後の SaveCopy が `##Valid` を書く点は、「解決は構文を変えない」という今回の設計選択（下記）との差であり、観察された欠陥ではない。
- 派生モデル（profile `split`）: 8組合せすべて通過（[split-check.json](split-check.json)）。
- 検査が空振りしないことの確認: [check-mutants.mjs](check-mutants.mjs) が派生モデルに7種の改変を入れ、すべて想定した組合せで失敗した（[mutants.json](mutants.json)）。ValidInput が競合を消す、解決が構文も直す、Review が競合を解決する、KeepEditing が構文を壊す、DiskChangedAgain が構文を壊す、KeepEditing が通知を戻さない、ノード操作の gate を外す、の7つ。各改変の結果は別ファイルに書かせ、終了コード 1（照合の失敗）と結果ファイルの生成を確かめる。
- 経緯: 独立レビューで、最初の版は「—」の列を照合せず、KeepEditing・DiskChangedAgain が構文を壊す改変が通過してしまうと指摘された。改変を先に加えて生き残ることを確認してから、積み上げ照合に直した。

### 比較の取消は競合保持、明示的な解決は解除。通知と競合を同義にしない。図のノード操作 gate と整合

- C2: Review で通知は消え比較が開くが競合は残る。KeepEditing で通知が戻り競合も残る。
- C3: SaveCopy [Success]・ReplaceReviewedDisk [ConfirmedFresh]・UseDiskVersion [ConfirmedFresh] で競合が解除され、DiskChangedAgain では比較が開いたまま競合が残る。
- C5: 競合中でも DiagramView が Ready ならノード操作（`NodeDoubleClick(DiagramView.graph?)`）は可能、ParseError で不可、ValidInput で可能に戻る。
- 自由文 effect は照合に使っていない。`Preserve both versions` などを実保存の成功とは扱わず、「解決」は条件ラベルの経路を選んだ後のモデル上の状態だけを指す。NodeDoubleClick の `Reveal matching source position` も実行していない（gate の有効・無効だけを見た）。

設計上の選択として、解決操作は構文軸を変えない（C4）。UseDiskVersion でエディタの内容が入れ替わっても、取り込んだ内容の構文はモデルが知らないため、再評価は ParseError・ValidInput の出来事で表す。**この選択は設計者の確認待ち。**

派生モデルの `SyntaxStatus` と `DiagramView` は、原モデルの構成を保ったため別々の singleton のままで、いつも同じ出来事（ParseError・ValidInput）で一緒に変わる。ガイドの基準では独立した軸ではない（同じ軸を二つの画面部品に表示している）。原モデルとの差分を小さく保つためにまとめていない。

### ガイドの例・反例が SPEC と一致し、check・生成・公開CLI・実ブラウザで照合する

- ガイドの例は新しい構文を導入せず、既存の `#!`・`set`・`show`/`hide`・`present`/`dismiss`・条件ラベルだけを使う。SPEC が「扱わないもの」に挙げる並行状態や条件式を導入しないこと、組合せで挙動を分ける条件式は書けないことを本文に明記した。
- 独立レビューで、最初の版の例が `構文` と `図` を常に同じ出来事で書き換えながら別の singleton にしており、ガイド自身の基準と矛盾すると指摘された。例から図を除き、反例を `構文` の 妥当/不正 で示し、「いつも一緒に変わる二つの姿は分ける理由にならない」と加えた。
- [check-guide-example.mjs](check-guide-example.mjs) は AI_GUIDE の該当節から shitae ブロックを抜き出し、`shitae check` でエラー・warning がともに 0 であることを assert する。続けて C1・C2・C3-SaveCopy・C4（例にない操作を使う組合せは除く）を通過することを確認した。ガイドが避けるよう書いている「一つの `#! 文書状態` に 妥当/不正/競合 を並べた版」は C1・C4 で失敗する（[guide-example-check.json](guide-example-check.json)）。
- 「分けない例」（反例）を機械的に確かめる検査はない。反例は「同時に成り立たない姿」の説明であり、ありえない組合せが生じないことは一つの variant 集合であることから構文上従う。
- 派生モデルは `check` でエラーなし。warning は原モデルと同種の W103（空の葉 component）で、追加した `SourceParsed` の1件だけ増えた（31→32）。
- 生成: `simulate` で [derived.html](derived.html) と [guide-example/split.html](guide-example/split.html) を生成した。ガイドの例の抜き出し [guide-example/split.shitae](guide-example/split.shitae) は AI_GUIDE のブロックと bytes 一致を確認した。

#### 実ブラウザ

Claude desktop の内蔵ブラウザで、生成 HTML を 127.0.0.1 の一時 HTTP サーバーから開いた（確認後に停止）。「部品の状態を表示」を on にし、操作は実クリック、値の読取りは表示されたテキスト（各操作後の本体表示と掲示中カードの全行）を使い、その全行を記録した。

派生モデル（[browser/browser-walk.json](browser/browser-walk.json)）:

1. Conflict → ParseError → ValidInput: `SyntaxStatus ##Valid`、`DiskStatus ##Conflict`、RecoveryNotice のカードが「掲示中」（[browser-c1-valid-input.jpg](browser-c1-valid-input.jpg)）。
2. Review → KeepEditing: Review 後は本体が VersionReview で掲示中カードなし。KeepEditing 後は Split に戻り、`DiskStatus ##Conflict` とカードが戻った。
3. DiagramOnly → ParseError → ValidInput: NodeDoubleClick は競合中も有効、ParseError 後は「gate off で無効」（[browser-c5-parse-error-gate.jpg](browser-c5-parse-error-gate.jpg)）、ValidInput 後に有効へ戻った。
4. Review → SaveCopy [Success]: `DiskStatus ##InSync`、掲示中カードなし、構文と図は Valid/Ready のまま。

ページの「シナリオを保存」「検討手順を書出し」を実クリックし、ダウンロード処理をページ内で受け取って一時サーバーへ送り、[browser/](browser/) に保存した（ファイル保存ダイアログは使っていない）。保存された scenario（10手順）と、同じ10操作を公開 CLI で選んだ [reexamine/derived-browser-path.scenario.json](reexamine/derived-browser-path.scenario.json) は、どちらも `JSON.parse` して空白なしの `JSON.stringify`（キー順はファイルのまま）にした SHA-256 が `a310c2ce…` で一致した。書出した検討手順も CLI の review text と SHA-256 `55444fac…` で一致した。ブラウザで保存した scenario は、派生モデルの CLI で再生でき、原モデルでは `MODEL_MISMATCH` で拒否される（[replay-rejections.txt](reexamine/replay-rejections.txt) の追記）。

ガイドの例（[guide-example/browser-walk.json](guide-example/browser-walk.json)）: 外部で変更される → 構文エラー → 構文が直る の後、`構文 ##妥当`、`競合 ##あり`、競合通知が掲示中（[guide-example/browser-c1.jpg](guide-example/browser-c1.jpg)）。比較する → 取り消す の後も `競合 ##あり` で通知が戻った。

ブラウザで見つけた制約: VersionReview の画面には `DocumentStatus` が置かれていないため、比較を開いている間の競合の値は GUI の本体表示では読めない（gate 用ドロワーにも DiskStatus は出ない）。この間の競合保持は CLI の state 照会（check-axes の C2・C3 と下記の再検討）で確認した。モデルや製品の変更はしていない。

### 別の作者が「分ける場合」と「一つの集合でよい場合」を説明できる

Claude subagent（Sonnet、この会話の文脈は渡していない）に、AI_GUIDE と SPEC だけを読むよう指示し、音楽アプリの曲詳細（再生・ダウンロード・曲情報の読込）をモデル化させた。分けるかどうかは伏せた。`docs/design/` と `docs/dogfooding/` は読まないよう指示し、報告で読んだファイルを列挙させた。

- 再生・ダウンロード・曲情報を3つの singleton に分け、各軸の内側（再生中/一時停止 等）は一つの集合のままにした。理由を「再生中→ダウンロード完了の後も再生中が残るべき」などの組合せで説明し、一般化した説明も書けた（[author-report.md](independent/author-report.md)、[music.shitae](independent/music.shitae)、`check` エラー・warning なし）。
- 迷った点として「`shitae session` の使い方が AI_GUIDE にない」を挙げた。ガイドから [session-usage](../../session-usage.md) へのリンクを追加した。ほかに、要素行の `;`、組合せの制約を書けないこと、document common の `set` の効果範囲を挙げた。いずれも今回のガイド範囲外として変更していない。
- 限界:
  - 隔離は指示と自己申告による。作者の作業directoryはこの worktree で、期待表などの evidence にファイルシステム上は到達できた。ハーネスは AGENTS.md・CLAUDE.md を自動で文脈に添付している。
  - 下記の再検討担当と同じ出力directory（`/tmp/i25-handoff-011251/out/`）を同時に使っており、そこには派生モデルのコピーもあった。再検討担当の報告には、作者の `music.shitae` が見えたとある。
  - 作者はモデルを CLI で実行していない（手書きの表と SPEC で判断した）。
  - 題材は分けるのが比較的自明で、トップレベルで「一つの集合が正しい」状態を判断させる場面を含まない。説明にはガイドの言い回しに近い部分がある。
  - agent 1体の結果であり、人間の作者一般に広げない。

### 旧 scenario を保持し、派生モデルで新規記録する（source-byte 不一致の拒否は新規記録で確認）

[replay-rejections.txt](reexamine/replay-rejections.txt) に再生結果を記録した。

- 2026-10-16 の旧 scenario（engine `8679f277…`）は、原モデルでも派生モデルでも `ENGINE_MISMATCH` で拒否される。engine の不一致が先に報告されるため、**この旧 scenario では source-byte の照合まで到達しない**。旧 scenario と旧証拠は変更していない。
- そこで現在の engine で原モデルに同じ問いを新しく記録した（[original.scenario.json](reexamine/original.scenario.json)、Conflict→ParseError→ValidInput→Review→KeepEditing）。原モデルでは再生でき、派生モデルでは `MODEL_MISMATCH: source bytesが異なるmodule: proposed` で拒否される。
- 派生モデルの記録は新規ファイルとして作った（受取人の [derived.scenario.json](reexamine/derived.scenario.json)、ブラウザ経路の [derived-browser-path.scenario.json](reexamine/derived-browser-path.scenario.json) と [browser/](browser/) の保存物）。どれも派生モデルで再生でき、原モデルでは `MODEL_MISMATCH` で拒否される。

### #23 の検討手順を参照し、修正前と同じ問いを再検討する

原モデルで記録した [original.review.txt](reexamine/original.review.txt)（#23 の `review` 照会）と派生モデル本文を、別の Claude subagent（Sonnet、この会話の文脈は渡していない）に渡した。問いは「競合の後に構文エラーと修正を経ても、比較を開いて取り消しても、競合は未解決か」とし、答えは伏せた。原モデル本文、AI_GUIDE、evidence・dogfooding は読まないよう指示し、報告上は読んでいない。隔離の限界は上の別の作者と同じ（同じ出力directoryを同時使用、evidence はファイルシステム上到達可能）。

- 受取人は手順と同じ5操作を actions 照会から選び直し、各時点の sharedVariants・overlays を照会して「競合は残る」と答えた（[recipient-report.md](reexamine/recipient-report.md)、[送受信](reexamine/derived.jsonl)、[検討手順](reexamine/derived.review.txt)）。`derived.jsonl` は受取人の client の出力で、各行に送信 `>> `・受信 `<< ` の接頭辞が付く（厳密な JSON Lines ではない）。
- 選び直しの誤り: なし。転記: なし（handle の session ID 部分を自作 helper に固定した以外）。追加質問: なし。
- 操作名・host・配置・結果の数と順序は一致し、`set(...)` の対象名だけが変わった（DocumentStatus → DiskStatus / SyntaxStatus）。受取人は、この違いを派生モデル本文を読んで対応付けたと報告した。原モデルの検討手順と派生モデルの検討手順の差分も、`set` の対象名の行だけだった。
- **人による相違の確認は未実施。** issue は「操作名・結果の意味が変わった場合は人が相違を確認する」としているが、今回 `set` 対象名の相違を確認したのは agent の受取人である。設計者による確認を残件とする。
- 限界: 受取人は agent 1体。問いの範囲外として解決操作（InSync へ戻る）は操作しなかった。操作名が変わらない設計変更だったため、名前の変更を伴う選び直しは試していない。

## 残件

- 解決操作は構文軸を変えない（C4）という設計選択の確認（設計者）。
- `set` 対象名の相違を人が確認すること（設計者）。
- 人間の作者・受取人による利用評価（今回は agent のみ）。#27 の統合利用評価で扱う。

## 再実行

worktree の root で `pnpm install --frozen-lockfile && pnpm -r build` の後に実行する。

```sh
node docs/design/evidence/state-axes/check-axes.mjs docs/dogfooding/2026-10-16-end-to-end/models/sol-original/proposed.shitae original
node docs/design/evidence/state-axes/check-axes.mjs docs/design/evidence/state-axes/model/proposed.shitae split
node docs/design/evidence/state-axes/check-mutants.mjs
node docs/design/evidence/state-axes/check-guide-example.mjs
```

1行目は失敗（終了コード 1）が期待どおり。`record.mjs` は既存ファイルを上書きしないため、再記録するときは別の出力名を渡す。

`pnpm -r --no-bail test` は全 package 通過（simulator 248件を含む）。本変更は製品コードと `docs/examples` を変更していない。

## 独立レビュー

別コンテキストのレビュー（Claude subagent、Opus）で、高2・中6・低7件の指摘を受けた。主な対応は次の通り。

| 指摘 | 対応 |
| --- | --- |
| 検査が「—」の列を照合せず、軸を壊す改変が通過する | 改変を先に追加して生き残りを確認し、積み上げ照合に修正 |
| 2体の subagent の隔離が実態より強く書かれている | 同一出力directoryの同時使用と到達可能性を限界に明記 |
| C4 の失敗位置の説明が結果と違い、設計選択との差を欠陥と書いている | 上記のとおり書き直し |
| mutant の結果ファイルの使い回しで偽の検出が起こりうる | mutant ごとの別ファイルと終了コード 1 の assert |
| ガイドの例が自身の基準と矛盾（構文と図を常に一緒に変える） | 例から図を除き、反例を書き直した |
| ガイドの例を生成・実ブラウザで確認していない | 生成し、実ブラウザで操作した |
| ブラウザ確認の証跡不足 | 保存物・操作ごとの表示記録・画像2枚を追加 |
| 人による相違確認が agent で代替 | 残件として明記 |
| 低（再生結果の追記、見出しの過大、観察位置の誤記、warning の assert、差分の開示、作者評価の弱さ、jsonl 形式） | すべて反映 |
