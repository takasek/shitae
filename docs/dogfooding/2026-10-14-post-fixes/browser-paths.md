# ブラウザ操作と観察

主評価者はモデル作者ではないが、依頼文と旧レポートを事前に読んでいる。完全な初見評価ではない。製品コード・実行内部を先に読んで経路の答えを得ることはせず、利用者向け表示から予測して操作した。各手順の予測と取得した DOM は `evidence/browser-observations.json` に保存した。`id` は同ファイルの観察ID。下表の期待は操作前の予測、実際はブラウザ操作後の表示。effect の成功は実I/Oの証拠としない。

## 原本で行った経路

| モデル・開始状態 | 操作・分岐列 | 期待 → 実際 | 不足情報・参照戻り / 観察ID |
| --- | --- | --- | --- |
| Astra current・開始 | 開く(開始ボタン) → 編集 → 保存[成功] → 切替(B) → 編集 | A保存済、B未保存、全体通知が残る可能性 → B未保存ドットと Saved. が共存 | 通知から文書帰属は読めない。`astra-current-b-edit`、画像 `astra-current-b-edit.jpg` |
| Astra proposed・開始 | 同じ5操作 | 文書別状態 → B.pfdsl — Edited、切替(A)で A.pfdsl — Saved が保持 | 2つの代表 singleton であり任意文書の状態管理ではない。`astra-proposed-b-edit`、`astra-proposed-return-a` |
| Astra proposed・文書A/作業面並列 | 図のみ → ノードからソースへ | 図中心 → 並列、文書A不変 → ソースと図が戻る | set の変更先はログから分かる。階層の作業面には現在 variant/実名がない。フォーカスは effect。`astra-proposed-diagram`、`astra-proposed-reveal` |
| Astra proposed・文書A保存済 | 外部変更確認 → 取消(KeepEditing) | 比較からAに戻るが状態は不明 → Saved のまま | 「外部変更確認」は直接比較を開く操作。Changed on disk の設定ではない。表示から予測できず、操作後にソースを参照。`astra-proposed-direct-cancel` |
| Astra proposed・文書A保存済 | 保存[外部変更] → 外部変更確認 → 取消(KeepEditing) | Changed on disk が残る → その通り。比較にいる間は元文書は stack で読める | 依頼の「確認」はこのモデルでの外部変更確認（別の確認操作なし）。状態の設定と比較を開く行を区別。`astra-proposed-save-external`、`astra-proposed-review-cancel` |
| Astra proposed・文書A外部変更 | 正規化[有効な入力] → 閉じる(Close) | 結果だけ消える → AとChanged on disk は残り、結果が消える | 現在 variant は表示ラベルとログの照合が必要。`astra-proposed-normalized`、`astra-proposed-close-normalized` |
| Astra proposed・結果を閉じた直後 | timelineの `[文書A] set(正規化A##表示)` をクリック | 結果が戻る → Normalized edges — A.pfdsl が戻り未来の閉鎖イベントは ghost | 同一タブの試行には既存機能で十分。画像 `astra-timeline-rewind.jpg` |
| Astra current・文書A保存済 | 正規化 → 閉じる(Close) | 文書はそのまま、読取結果だけ閉鎖 → その通り | currentには図のみ・外部変更比較の対応操作がない。追加していない。`astra-current-close-normalized` |
| Sol proposed・Workspace/Split | SourceOnly → DiagramOnly → NodeDoubleClick(DiagramView.graph) | Source → Diagram → Split → その通り | Undo/選択/viewportはモデルにない。`sol-proposed-source`、`sol-proposed-node` |
| Sol proposed・Split | Conflict → Review → KeepEditing | 通知掲示 → 比較中は非掲示 → Splitと通知復帰 → その通り | status/state の alias から Conflict を直接読めない。overlayは自動消滅ではなく hide/show をログで確認。`sol-proposed-review`、`sol-proposed-keep` |
| Sol proposed・Split（前行の通知が残る） | ParseError → DiagramOnly → 無効なNodeDoubleClickを試す → ValidInput → NodeDoubleClick | Error中は図なし・gate off、復帰時はonでSplitへ → その通り | status/current variant の確認はログとソースを併用。`sol-proposed-error-node-attempt`、`sol-proposed-valid-node`、画像 `sol-proposed-error-detail.jpg` |
| Sol proposed・Split/通知掲示中 | CloseLastDocument | NoDocument、文書操作・図・通知なし → その通り | Open/New と commonイベントは残る。`sol-proposed-close-last` |
| Sol current・Workspace/Editing | ParseError → CloseLastDocument | Error部品、NoDocumentでもcommandsが残る → その通り | currentには Source/Diagram切替・Conflict/Review経路がない。Save/Formatの表示と同名操作は異なる要素。`sol-current-parse-error`、`sol-current-close-last` |
| alias最小例・Workspace/Ready | Alias、Named、Undefinedを各1回 → select Error → 3操作を各1回 → select Ready → 3操作を各1回 | alias/name on→off→on、Missing常時on → Error中は2つのログが増えず、Undefinedだけ発火。Ready後は全て発火 | selectは意図した手動gate試験。DOMのdisabled classと実クリック無効をともに確認。`alias-error-attempt-fire`、`alias-restored-fire` |
| inline原本・比較画面 | 初期表示を比較 | 両群に New/Save/Format → 各群1回ずつ、同じ順で表示 | 他モデルのinline view/choices/actionsも子を表示。操作行と同名葉の併記は役割が異なりrendererによる重複ではない。`inline-original` |

## recovery の今回新しくブラウザ確認した経路

旧記録は静的検査・生成までだった。下記は今回の新しい実操作確認。全分岐を網羅したとは扱わない。

| 開始 | 操作・分岐列 | 予測 → 実際 | 観察ID |
| --- | --- | --- | --- |
| Editing | ExternalChange → ReviewAndSaveHere → KeepEditing | 比較へ、取消でConflict → OverwriteReviewからConflictへ | `recovery-review`、`recovery-cancel` |
| Conflict | UseCurrentDiskVersion → UseDiskVersion[Fresh] | 採用確認後Editing → DiscardReviewからEditingへ | `recovery-use-disk-fresh` |
| Editingに再読込 | ExternalChange → ReviewAndSaveHere → ChangedAgain[NewRevision] | 比較内で更新し留まると予測 → **Conflictへdismiss** | `recovery-changed-again`。直後に[Saved]が見つからず手順修正。操作後にモデル18–27行を読み、明示的dismissと一致と確認 |
| 前行のConflict | ReviewAndSaveHere → ReplaceObservedVersion[Saved] | 再比較後Editing → その通り | `recovery-reopen-after-new-revision`、`recovery-replace-saved` |
| Editingに再読込 | ExternalChange → SaveAs[NewTargetSaved] | 新規先保存の意図を出力してEditing → その通り | `recovery-save-as-new` |

ExistingDifferentTarget、ChooseAnotherFile、SaveAs[Cancelled]、DiscardReviewのChangedAgainは未操作。ファイルが消失した場合、実revisionや非同期競合はモデルの外。

## 比較用の派生モデルと独立ガイド課題

`derived/sol-proposed-alias.shitae` は NodeDoubleClick の実名参照だけを同じ body の diagram alias へ変更。ParseError → DiagramOnly → 無効操作を試す → ValidInput → NodeDoubleClick を操作し、off→onとSplit復帰を確認（`derived-alias-*`）。原本は先に実名参照のまま評価済み。

`derived/sol-proposed-readable-status.shitae` はDocumentStatusの3つのstate aliasだけを意味の分かる名前に変更。初期Valid → Conflict → ParseErrorで `Document state: valid/conflict/invalid` と表示され、状態の意味はソースへ戻らず読めた（`readable-status-*`）。解決後 component・共有の範囲・instance の同一性はその表記では分からず、#12の限定表示はなお有用。

独立ガイド評価の `initial.html` は 文書一覧 → 別の場所へ → Aを保存済にする → Bを編集中にする → 戻る → 開く(A) → 編集開始 → 保存 → 戻る → 開く(A) → 戻る → 開く(B)。外部操作画面に留まってA/Bを別々に更新し、画面を閉じても状態を保持することを確認。通常編集画面は再入場時に閲覧、Bの共有状態は編集中だった（`guide-*`）。receiver probeでは部品内のgotoで包含画面が保存済になり、通常文書は未編集のまま（`receiver-probe-fired`）。ガイド説明とSPECの意図に一致した。

## 再現と参照戻り

`evidence/scenarios.json` にモデルSHAと具体操作・condition labelを保存。Sol proposed の11操作を初期化して再実行し、NoDocumentのmain表示が最初の試行と一致。Astra proposedの5操作（保存[成功]を含む）も初期化してB編集を再現し、main表示が一致した（`replay-*`、`astra-replay-*`、比較は `evidence/replay-comparison.json`）。この比較は利用者向けmainのDOM snapshot（遷移マップ以前）であり内部状態の完全一致ではない。`compare-replays.py` に抽出式を固定し、比較した文字列とSHA256を保存した。

SPECへ戻ったのはsingletonの保持・裸gotoの作用先の正確さを確認する段階（299–328、365–376行）。モデルへ戻ったのはAstraの「外部変更確認」と状態設定の違い、Solのstatus/stateがどのvariantか、recoveryのChangedAgainの戻り先。内部状態はブラウザの結果予測に使っていない。限定VMはgate/inlineの補助照合として独立に記録した。

既存のgateパネルも開いたが、このモデルではDiagramViewだけを選択でき、DocumentStatusを表示しなかった（`sol-existing-inspection`、`existing-gate-panel.jpg`）。ログは直前のsetの変更先を示すが、入れ子の現在状態をその場で説明する表示ではない。

同名の葉と操作を含むrecoveryでは「操作行」と明記すると識別できた。ブラウザ自動化では `summary.element` と `span.action-text` を区別した。曖昧さを処理系不具合には算入しない。独立したChrome再現は接続不整合により全列未確認で、製品の再現失敗にも成功にも算入しない。
