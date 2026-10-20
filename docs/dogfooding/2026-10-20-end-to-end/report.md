# 一連の設計作業を通した評価

2026-10-20、SHA `3c68321001771faab35a35fc212056f54bb02bf1` の評価。自然文からの作成は独立 author agent、保存済みモデルの探索は root、引継ぎは会話を継承しない recipient agent が担当した。AI による評価であり、人間一般の使いやすさや #27/#35 の人向け受入を証明しない。

今回の一連の仕事は完遂できた。新規モデルの作成・設計変更、保存済みモデルの問いの照合、process間とGUI/CLI間の保存・再開、独立受取人の説明・継続・再生成、変更後モデルの厳密拒否と新規記録まで成立した。評価した範囲で新しい処理系不具合・回帰は見つからなかった。実利用の負担は残るが、言語機能や自動migrationの追加を急ぐ根拠にはならない。

## 得られた設計判断

| 仕事 | 操作前の問い・期待 | 実際に判断できたこと | 証拠 |
| --- | --- | --- | --- |
| 自然文から図書予約を記述 | 検索→詳細→確認、取消と確定で寿命と戻り先を分けたい | 初案の確認画面の `back()` は barrier で留まる。取消は詳細、確定は確認を消して詳細を完了画面に置換し、その後戻ると検索結果。動かして「戻るを置くなら取消と同じ意味にしたい」という小さな設計変更を選んだ | [author-notes](author-notes.md)、[v1](evidence/author/library-v1.html)、[v2](evidence/author/library-v2.html) |
| 文書ごとの保存表示 | A を保存後、B を編集しても A の状態は残るか | proposed は A=保存済・B=未保存を別 singleton として保持。B 編集後に A へ戻っても A.pfdsl — Saved。current は B 未保存でも共通通知 Saved. が残るため、文書名付きの状態表示が有効 | [操作前期待](saved-expectations.md)、[Astra CLI](evidence/astra-cli.jsonl)、[current CLI](evidence/astra-current-cli.jsonl)、[Aへ戻った表示](evidence/astra-a-saved.txt) |
| 図からソースへ戻る | 図中心でノードから戻るとどの表示か | active 文書Aのまま作業面だけ並列になる。action 詳細から set の対象と後続 effect を区別できた。focus 実動作は証明しない | [操作詳細を含むCLI](evidence/astra-cli.jsonl)、[GUI結果列](evidence/astra-node-return.txt) |
| 競合の比較を取消 | 通知・比較・編集状態はどう残るか | Review中は通知を消し、KeepEditingでSplitへ戻して通知再掲示、競合状態維持。通知の寿命とmodalの寿命を別々に書く必要が具体化した | [Sol CLI](evidence/sol-cli.jsonl)、[比較中](evidence/sol-review.txt)、[取消後](evidence/sol-keep-editing.txt) |
| 構文エラーから復帰 | 図とノード操作はいつ戻るか | Errorではgraphがないため無効、ValidInput後Readyで操作可能、NodeDoubleClickでSplit。操作一覧だけで無効を発見し、action詳細のgateで理由が分かった | [CLI](evidence/sol-cli.jsonl)、[GUIエラー](evidence/sol-parse-error.txt)、[復帰](evidence/sol-valid-with-notice.txt) |
| 最後の文書を閉じる | 空の作業場に何を残すか | navigation と start が残り、RecoveryNotice と NormalizedEdges は消える。component共通操作がNoDocumentでも残るのは原モデルの記述どおり。実製品に残してよいかは別の設計判断 | [最終状態と限定history](evidence/sol-cli.jsonl)、[GUI](evidence/sol-empty.txt) |
| 未確認の復旧経路 | 採用確認中にディスクが再変更されたらどうするか | ChangedAgain[NewRevision] は採用せずConflictへ戻る。SaveAs[Cancelled]もConflictを維持。effectの「Preserve editor」は実データ保全の証明ではない | [recovery CLI](evidence/recovery-cli.jsonl)、[scenario](scenarios/recovery-cli.scenario.json) |

Sol原 proposed の Conflict→ParseError→ValidInput では、通知が残っても DocumentStatus は Valid になる。このモデルは独立した構文・競合を一つの variant 集合に置いている。#25 の既知のモデル問題と一致し、完了済みのガイド・派生例を再開発する候補にはしなかった。原モデルを直さず記録として保持することと、その原モデルを推奨例として扱うことは別である。

## 保存・再開と引継ぎ

root は手動で必要な query を選び、JSON Lines の送受信・保存だけの薄い in-memory client を使った。全state/historyを毎回収集するharnessは作っていない。Astra proposed は8 dispatchに対して10 query（actions/metadata 1、actionsのみ7、state 1、action詳細1）。Sol proposedも8 dispatch、10 queryで、最後のCloseLastDocumentの3結果だけhistoryを読んだ。[全要求・応答と集計](evidence/cli-interaction-counts.json)を参照。操作名・条件は各応答から選び、受理後はhandleを取得し直した。rootの公開CLI要求70件に拒否・stale handleはなかった。

| 経路 | 結果 | 証拠 |
| --- | --- | --- |
| CLI操作→export→元process終了→別process replay→継続 | 通常終了点を再現して「編集」を実行、再保存。異なるprocessと異なるSession handleを使用 | [元CLI](evidence/astra-cli.jsonl)、[再開CLI](evidence/astra-replay.jsonl)、[process識別](evidence/process-lifecycle.json)、[継続scenario](scenarios/astra-resumed.scenario.json) |
| GUI結果途中→保存→CLI replay | 「ノードからソースへ」の結果1=set直後、結果2=effectがghostの状態を保存。別CLIでretained10/ghost1、現在地は記録8の結果1と確認 | [GUI](evidence/astra-ghost.txt)、[GUI保存scenario](scenarios/astra-gui-ghost.scenario.json)、[再開CLI](evidence/astra-ghost-replay.jsonl) |
| ghost地点→別操作→再保存→別process再開 | 「ソースのみ」を選び、retained11/ghost0/discarded1。放棄したeffectは来歴から消えず、現在timelineでは破棄となる | [分岐後scenario](scenarios/astra-ghost-branched.scenario.json)、[再開確認](evidence/astra-ghost-branched-replay.jsonl) |
| 別担当への引継ぎ | 目的・問い・HTML・scenario・処理系版から経路と成功条件を説明。次の「切替(B)」をGUI/CLIで実行し、A保存済/B未保存を確認。意味確認の追加質問0、元の8操作の再入力0 | [recipient-report](recipient-report.md)、[再開保存物](scenarios/recipient-resumed.scenario.json) |
| CLI保存→新GUI Session | 担当タブをreloadし記録0の新SessionへCLI保存物を読込。8 dispatch、seek0、保持11/ghost0、A保存済・並列の完了点を再現 | [読込表示](evidence/recipient/cli-to-new-gui.txt)、[画像](evidence/recipient/cli-to-new-gui.png) |
| モデル一式を別directoryで再生成 | import無しの1 moduleと判断し、同名bytesコピーでHTML生成成功、コピー先モデルでも元scenarioのreplay成功。同modelId・現在地・ghostを確認 | [受取検証](evidence/recipient/verification-summary.json)、[コピー先CLI](evidence/recipient/copied-replay.jsonl) |

操作前期待はモデル本文とSPECから立てた。CLI/GUIの一致は共通エンジンの一致であり、それだけで期待の正しさを裏付けたとは扱わない。結果途中への巻戻しはGUIの公開操作だけを使い、CLI seekを作っていない。

保存前のGUI表示には、破棄経路・reset前・ghost・手動試験を含む全記録、モデル本文/DOM/表示設定を含まないことが明示されていた。今回rootはresetを実行していないため、reset前の包含は文書・表示と既存回帰テストの確認であり、新規のブラウザ実操作証拠ではない。

## 一箇所の要件変更と再検討

新規図書予約モデルの確認画面だけ、`タップ(戻る) -> back()` を `dismiss()` に変えた。元ファイルはそのまま、別directoryに同じentry名の派生を置き、HTMLは v1/v2 の固有名で保存した。モデルの単なる記法修正ではなく、実操作で見えた「戻るボタンが動かない」という設計を変更した。

旧scenarioを派生モデルに渡すと、CLIとGUIは `MODEL_MISMATCH: source bytesが異なるmodule: library-v1（空白・コメントも照合対象）` と拒否した。診断には、完全一致する元HTML＋scenario、CLIなら元モデル一式＋処理系、変更後は新規記録という選択肢があった。[CLI診断](evidence/author/v2-old-scenario-replay.stderr.txt)と[GUI診断](evidence/author/v2-after-mismatch.ax.txt)を保存した。

GUI拒否前後は本の詳細、記録4、6観測点、dispatch4件、検索結果→詳細のstackが一致した。拒否後の「戻る」は記録5・7観測点として検索結果へ進めた。[拒否前](evidence/author/v2-before-mismatch.ax.txt)・[拒否後](evidence/author/v2-after-mismatch.ax.txt)・[継続](evidence/author/v2-continued.ax.txt)。厳密な版固定は仕様上の制約であり不具合に分類しない。移行、scenario手編集、類似操作への自動対応は行っていない。旧engineの保存物も中心比較に使っていない。

元モデルに戻した旧GUI保存物のCLI replayはexit0。変更後は同じ問いを11操作で新規記録し、別process replayもexit0で検索結果・15観測点へ復帰した。旧版では10操作だったが、「戻る」が詳細へ出るようになったため取消を確認する前に確認画面を開き直す1操作が増えた。新規に入力し直す必要があった操作は11件。過去の所要時間との比較や改善率は出さない。[新scenario](evidence/author/library-v2-new.scenario.json)、[再開検証](evidence/author/v2-new-scenario-status.json)

## 負担と検証の範囲

rootは利用前にsession-usage/replay-contract/provenanceを各1回、モデル読取前にAI_GUIDEを1回、意味の独立期待を確認するためSPECのsingleton/switch/present・dismiss/overlayを参照した。保存モデル本文の初回読取はAstra proposed、Sol proposed、Sol recovery、Astra current、inline最小例、alias最小例の6本。再入力のために実装コードへ戻った回数は0。必要な意味を利用者文書・公開action/state照会で解決できた。READMEと過去受入記録は入口・既知/未確認の整理に使用した。初見作者には過去の解答モデルや不具合報告を渡していない。author/recipientの参照と選択負担はそれぞれの独立記録に分けた。

- 保存済み7モデルのcheckはerror 0。Astra3本とalias例はwarning 0、Sol current/proposed/recoveryはW103が30/31/9件。全7 HTMLの生成exit 0と終端を確認。warningのあるモデルでもHTML生成に成功するため、生成成功を診断通過の代用にしなかった。[結果](evidence/model-checks.json)
- 既存回帰テストは選んだ9ファイル203件が成功。CLI 19件、simulator 169件、Session 15件。全suiteの再実行ではない。[CLI](evidence/regression-cli.log)・[simulator](evidence/regression-gui-vm.log)・[Session](evidence/regression-session.log)。simulatorのVM/DOMテストを実ブラウザ検証とは呼ばない。
- #8の出力は既存stdoutテスト、#9のinlineは元最小例の実ブラウザ表示、#10のalias gateは元最小例の公開CLIで確認。ReadyでAlias/Named/Undefinedが有効、Error試験値でAlias/Namedが無効、未定義参照だけ有効という独立期待に一致。[alias CLI](evidence/alias-cli.jsonl)、[inline画面](evidence/inline-repro.txt)
- rootの実ブラウザ操作は[Astra/Solの歩行記録](evidence/root-browser-walk.json)。headlessや内部関数呼出しで代替していない。条件labelは手動選択であり、自由文effectは保存・通信・focus等を実行しない。
- GUI download/filechooserのbrowser tool呼出しが数分から約12分戻らないことがあった。root、author、recipientで観測し、tool timeout指定でも長時間待つ例があった。ファイルの保存・読込は最終的に成功したが、製品の処理時間・性能問題との因果は未確定。評価環境の待機として記録し、改善率を算出しない。

## 未確認・外挿しない範囲

人間の初見作者/受取人、file URL、Windows/Linux、キーボード・IME・支援技術、任意数文書や実ディスク競合、ネットワークとfocusの実effect、PFDSL本体の受入、旧engineとの互換性は評価していない。新しいSessionと新しい評価者は別概念であり、rootの再開確認を独立した初見評価に含めない。独立agentは会話を継承しないが共有filesystemにアクセスでき、資料隔離は指示と担当記録による。

改善候補と次の判断は [candidates.md](candidates.md) に集約した。[最終差分確認](evidence/final-validation.json)では原モデルを含む過去の証拠33ファイルのhashが一致し、製品・SPEC・既存ガイドを含むtracked差分は0だった。新規追加はこの評価ディレクトリだけ。元の作業checkoutはclean、primaryの未追跡2directoryも開始時のまま。評価用HTTPサーバーは停止し、8765ポートのlistenerが無いことを確認した。

[独立した証拠レビュー](evidence/independent-review.md)でも受入を妨げる指摘はなかった。9モデルのcheckと11 scenarioの別process再生、保全hashを別agentが再確認した。GUIについては保存証拠の照合であり、レビュー担当の再操作ではない。
