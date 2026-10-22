# 一連の設計作業を通した評価（2026-10-21）

## 要約

固定版 `365a8c0` で、作業 A〜D の四つを実施した。A は自然文からの新規モデル、B は保存済みモデルでの検討、C は保存・引継ぎ、D は一箇所の要件変更と再検討。どれも完遂した。保存・読込の受け渡しは CLI→CLI、GUI→CLI、CLI→新しい GUI、GUI での不一致拒否まで実ブラウザで行った。ただし built-in browser では、GUI の保存ダイアログとファイル選択ダイアログを利用者が操作した。今回の重点は前回以降の変更 #38（履歴の閲覧と確認付き再開の分離）の初の実利用で、契約どおりに働き、設計検討に使えた。

## 作業 A — 初見の作成担当による新規モデル

作成担当は README・AI_GUIDE・authoring skill から、図書館の「蔵書検索→詳細→予約確認モーダル→確定・取消」を書いた（[author-notes](author/author-notes.md)）。

- 設計上の効果: v1 は予約状態を詳細の variant に置いた。予約後に詳細を閉じて開き直すと「未予約」に戻ることを、操作して初めて確認した（[v1-reopen.txt:8](author/v1-reopen.txt)）。自然文では寿命を曖昧にしていた。v2 で singleton と `set` に移し、開き直しても残ることを確かめた（[v2-states.txt](author/v2-states.txt)）。本ごとの予約状態（一覧のバッジ）は表現できないと判断した。根拠は SPEC の E028 の記述で、発火は未確認。
- 検査と生成の区別: v1 は check の exit 0・warning 2 件（W105）で、simulate は別に成功した。作成担当は両者を区別できた。
- 導線: 文書へ戻ったのは 2 回（SPEC の singleton・variant・W105 の節、session-usage の CLI 節）。W105 の文言からは直し方（set / singleton）へ辿れず、AI_GUIDE:69 が役立った。
- 診断の疑い: v1 の `dismiss() ; goto(##予約済み)` は、実行時には詳細に効いた（[v1-after-confirm.txt](author/v1-after-confirm.txt)）。SPEC:370 は、裸の `##variant` の対象を「書かれた場所ではなく実行時にアクティブな component」と定めている。check は字句上のホスト（予約確認）で W105 を出しており、SPEC と食い違う（[check-v1.txt](author/check-v1.txt)）。親が SPEC で照合し、7 行の最小再現でも check の W105 と実行時の 詳細##確定済み を確かめた（[reproductions/](reproductions/w105-dismiss-goto.shitae)、[cli-w105](evidence/cli-w105/resp.jsonl)）。
- 回避策: 操作カードがアクセシビリティ上ボタンとして露出しないため、座標や find の参照で押した。モデルの不要な書き換えはない。

## 作業 B — 保存済みモデルでの再検討

操作前の予想は [saved-expectations.md](saved-expectations.md)。原モデルは変更していない。

| 問い | 結果 | どの情報で解消したか |
| --- | --- | --- |
| Astra Q1 A・B を編集して切り替えた後の保存状態 | 予想どおり状態A・状態B とも未保存 | CLI state（[resp.jsonl s1](evidence/cli-astra/resp.jsonl)） |
| Astra Q3 取込(UseDisk) の結果途中 | 予想どおり結果2 の直後は状態A=保存済のまま比較が開いている | CLI history と observation 11（[observation-11-view.json](evidence/cli-astra/observation-11-view.json)） |
| Astra Q6 履歴を見るだけで位置が変わるか | 変わらない（seek 0件のまま）。確認画面に変更前・変更後が出て、確定後だけ seek 1件 | GUI（[01](evidence/gui-astra/01-preview-record8-result2.txt)、[02](evidence/gui-astra/02-confirm-seek-and-branch.txt)） |
| Astra Q4 結果2 の地点から取消(KeepEditing) | 状態A=保存済のまま比較が閉じた。後の dismiss は「文章のみ」になり、記録8 は「一部の結果は文章のみ」 | GUI（[02](evidence/gui-astra/02-confirm-seek-and-branch.txt)） |
| Astra Q5 読込要約は画面外の状態B を含むか | 含まない。「一部です」と明示され、CLI state の案内が出る | GUI（[04](evidence/gui-astra/04-load-cli-scenario.txt)） |
| Sol recovery S1〜S3 | 予想どおり。別ファイルを選んでも確認画面は 1 枚、再変更で Conflict に戻り、SaveAs 取消は遷移なし | GUI（[gui-sol-recovery.txt](evidence/gui-sol-recovery.txt)） |

設計上の効果:

- Astra の取込は「保存済にする」と「比較を閉じる」を別の結果として書いており、その間に利用者が実際には到達できない中間状態がある。結果の途中から別の操作を選ぶと「置換を取り消したのに保存済」という状態を作れた。モデルの誤りではないが、この地点からの分岐は実際の UI の検討にならない。
- Sol recovery では、別の既存ファイルを選んで上書き確認を開き直しても、画面がまったく同じで、どのファイルへの上書きかが読めない。前回 CLI だけで確認された経路を実ブラウザで歩いて初めて気づいた。これを作業 D の要件変更にした。
- GUI の閲覧画面は、閲覧対象に含まれない部品の値（比較画面での状態A）を表示しない。画面外の状態は CLI の observation・state 照会で確かめた。これは ADR-0025 の方針（新しい全状態一覧 GUI を作らない）どおりの制約である。

CLI は同じ process で照会→操作→照会を続け、handle は応答から取り直した。Astra の元 process は query 13・dispatch 8・export 1 で、拒否 0。

前回未確認だった reset 前の実ブラウザ操作も確認した。「初期状態へ」の後、reset 前の 12 地点は文章のみになり、閲覧・再開ボタンは無効表示になった（[03-reset.txt](evidence/gui-astra/03-reset.txt)）。

## 作業 C — 保存・再開・引継ぎ

| 経路 | 結果 | 証拠 |
| --- | --- | --- |
| CLI 操作→export→process 終了→別 process で replay→継続 | revision 8・観測点 12 に復帰。Session ID は変わり、旧 handle は `UNKNOWN_HANDLE`。切替(B) を続けて再 export（9 step） | [cli-astra](evidence/cli-astra/)、[cli-astra-replay](evidence/cli-astra-replay/)、[astra-resumed](scenarios/astra-resumed.scenario.json) |
| GUI で位置を結果途中へ移し、ghost が残った状態を保存→CLI へ | 8 dispatch + seek 1 の保存物。CLI replay で観測点 11・dismiss は ghost=true | [astra-gui-ghost](scenarios/astra-gui-ghost.scenario.json)、[cli-astra-from-gui](evidence/cli-astra-from-gui/) |
| ghost 地点から別操作→再保存→別 process で再開 | CLI で保存(ReplaceDisk)[再変更] を選び、ghost は破棄。export 後に別 process で観測点 13 に復帰 | [astra-ghost-branched](scenarios/astra-ghost-branched.scenario.json)、[cli-astra-branched-replay](evidence/cli-astra-branched-replay/) |
| CLI 保存物→新しい GUI Session | 「dispatch 8件…を照合」で読込成功。読込要約と画面外の確認方法の案内が出た | [04-load-cli-scenario.txt](evidence/gui-astra/04-load-cli-scenario.txt) |
| 別担当への引継ぎ | 会話を継承しない引継ぎ担当が説明した: 何の検討か、現在地、分岐、途中の位置変更。次の操作 保存(ReplaceDisk)[再確認一致] を行い、別 process で再開した。要求は query 5・dispatch 1・export 1。親も引継ぎ担当の保存物（11 step）を別 process で再生し、exit 0 で文書A に復帰することを確認 | [recipient-report](recipient/recipient-report.md)、[親の再生確認](evidence/recipient-procA-replay.stdout.txt) |

GUI の保存は、built-in browser でネイティブの保存ダイアログが利用者側に出た。利用者が別名（既存ファイルとの衝突回避）で保存し、親が評価ディレクトリへ移した。読込も、Claude からのクリックではダイアログが出なかったため、利用者が pane 上で「ファイルを選択」を押してファイルを選んだ。どちらも製品の問題ではなく、評価環境の制約として扱う。

引継ぎで分かったこと:

- 引継ぎ担当は保存物の範囲を正しく理解した: 表示設定は保存されない、scenario にソースは入らない、reset 前・破棄経路・自由文 effect は入る、だから共有前に没案の確認が要る。
- 結果途中から分岐した経路を「モデルの誤り（ReplaceDisk の再変更に set がない）か、意図か」と質問した。step 8→9 の位置変更の意図も推測するしかなかった。scenario と検討手順は「何をしたか」を運ぶが「なぜその地点から分岐したか」は運ばない。brief.md の一言では足りなかった。
- HTML を開くと開始画面になり、保存地点を見るには読込か CLI が要ることで最初に迷った。
- HTML 内の「このHTMLからモデル本文は取り出せません」を、内容が含まれないと読みかけた。実際には要素名・操作・文字列が埋め込まれている（親が grep で確認）。この文は「CLI 再開に必要なソースの bytes は復元できない」という文脈では正しい。しかし README の「共有する」は、閲覧者へ HTML を渡すと定義の内容も渡ることに触れていない。
- 対話的に CLI を使うために送受信 script（drive.py）を自作した。

## 作業 D — 一箇所の要件変更

作業 B の Sol recovery の気づきから、「上書き確認に、どのファイルへの上書きかを表示する」を一件だけ選んだ。派生コピー [models/sol-recovery-target/recovery.shitae](models/sol-recovery-target/recovery.shitae) に singleton `ReviewTarget` を追加し、確認を開く経路で設定する。check では新しい警告が出ず（W103 は原本と同じ 9 件）、HTML を固有名で生成した。

- 変更前の scenario を変更後モデルへ渡すと、CLI は exit 1 で `MODEL_MISMATCH: source bytesが異なるmodule: recovery（空白・コメントも照合対象）` を返した。次の行動（完全一致する HTML との組、元モデル一式、新しく記録）も示した（[stderr](evidence/sol-v2-old-replay.stderr.txt)）。契約どおりの拒否で、不具合に分類しない。
- 元モデルへ戻すと再開でき、review 照会で旧版の検討手順を時系列の文章で得た（[review.json](evidence/cli-sol-v1-resume/review.json)）。
- 変更後モデルで同じ 5 操作（条件選択 3 件を含む）を記録し直した（[sol-recovery-v2](scenarios/sol-recovery-v2.scenario.json)）。自動移行や scenario の手編集はしていない。
- GUI で 2 操作した後に変更前の保存物を読み込むと、同じ診断で拒否された。元の Session（dispatch 2件・OverwriteReview）は残り、そのまま 3 操作目へ進めた（[gui-sol-mismatch.txt](evidence/gui-sol-mismatch.txt)）。
- 再検討で新しい設計上の気づきがあった。上書き対象は確認画面に属する情報だが、singleton は確認画面より長く生き、Conflict に戻っても ChosenFile が残る（[cli-sol-v2 resp](evidence/cli-sol-v2/resp.jsonl)）。確認を開くすべての経路で設定し直す必要があり、経路を足すときの漏れの原因になりうる。

## 負担と検証の範囲

- 親が利用者文書へ戻った回数: session-usage の CLI 節 1 回（observation の応答形を確認）、session-provenance 1 回（review 照会）、SPEC 1 回（W105 の照合）。observation が `view` の下に state を返す点は、session-usage の記述（「state と handle を含まない actions を返し」）からは読み取れず、1 回やり直した。
- 実装コードは読んでいない。生成 HTML は、引継ぎ担当の主張を確かめるために grep した。
- 3 人の評価者全員が、CLI を対話的に使うための送受信 script を自作した（親 [tools/send.mjs](tools/send.mjs)、作成担当 author/session-driver.py、引継ぎ担当 recipient/drive.py）。全員がエージェントで、ツール呼出しごとに stdin が閉じるハーネスの性質による。端末で 1 process を開いたまま要求を貼る人には当たらない。人にも当たるのは、受理操作のたびに handle を写し直す手間の方である。
- GUI 保存物の検出のため、開始時に ~/Downloads の scenario ファイル名一覧を目印として作った。共有不要な情報なので成果物からは削除した。
- 実ブラウザ操作は built-in browser の Astra proposed・Sol recovery・Sol recovery 派生、作成担当の library v1/v2 の 5 本。headless・VM の検査と既存回帰テストは今回実行していない。CLI と GUI の一致は共通エンジンの一致として扱い、期待はモデル本文と SPEC から立てた。
- 自由文 effect（「編集内容を置換」「Show fresh disk observation」等）は、画面の本体に出ず履歴にだけ出る。保存・通信の成功を示さない。

## 前回の残課題の再確認

| 前回の候補 | 今回 | 判定 |
| --- | --- | --- |
| 設計変更後の再入力負担 | 5 操作を review の文章を見ながら記録し直した。拒否の診断と次の行動は分かりやすかった | 継続（版固定は意図した制約） |
| 読込要約では画面外の状態が分からない | 「一部」の明示と CLI state への案内が出て、引継ぎ担当も親も辿れた | 解消（表示の範囲は意図どおり） |
| W103 の多さ | Sol recovery で 9 件のまま。今回の作業は妨げていない | 継続（既知の保留） |

## 未確認・外挿しない範囲

- 人間の初見作者・受取人は評価していない。AI 3 名の結果を人一般に広げない。ファイル選択と保存ダイアログは利用者が操作したが、それは人による受取評価ではない。
- Claude in Chrome は拡張の注入失敗で使えず、GUI の保存・読込は built-in browser と利用者のダイアログ操作だけで確認した。
- 確認していないもの: file URL、Windows/Linux、キーボードのみの操作、支援技術、実ディスクや通信の効果、旧 engine の保存物との互換、既存回帰テストの再実行、作成担当の疑問 4・5（確認モーダルの統合、検索語の保持）。

## 保全

最終確認は [final-validation.txt](evidence/final-validation.txt)。原モデルの hash は開始時の [original-models.sha256](evidence/original-models.sha256) と一致した。過去の評価ディレクトリを含む tracked ファイルの差分は 0 で、新規追加はこのディレクトリだけ。
