# 引き継ぎ検討の報告

## 1. 問いへの答え
問い: 外部変更との競合が起きた後、構文エラーが起きて直っても競合は未解決のままと読めるか。さらに比較画面を開いて取り消しても競合は残っているか。

答え: 変更後モデルでは、どの時点でも競合は残っていた（照会で確認）。

選んだ操作: Conflict → ParseError → ValidInput → Review → KeepEditing（前の版の検討手順と同じ順序）。各操作の後に `select:["state"]` から sharedVariants / overlays / location / activePath だけを抜き出して確認した。

| 時点 | DiskStatus | SyntaxStatus | DiagramView | overlays | 現在地 | 根拠 |
| --- | --- | --- | --- | --- | --- | --- |
| 起動直後 | InSync (initial) | Valid (initial) | Ready (initial) | なし | Workspace##Split | id=s0 の data.state.sharedVariants |
| Conflict 後 | Conflict (dsl) | Valid | Ready | RecoveryNotice | Split | id=s1 |
| ParseError 後 | Conflict (dsl) | Invalid (dsl) | Error (dsl) | RecoveryNotice | Split | id=s2 |
| ValidInput 後 | Conflict (dsl) | Valid (dsl) | Ready (dsl) | RecoveryNotice | Split | id=s3 |
| Review 後 | Conflict | Valid | Ready | なし（hide 済み） | VersionReview（activePath [0,1]） | id=s4 |
| KeepEditing 後 | Conflict (dsl) | Valid | Ready | RecoveryNotice（再表示） | Workspace##Split | id=s5 |

- 構文エラーが起きて直っても: DiskStatus##Conflict は s2、s3 を通じて変わらない。ParseError と ValidInput は SyntaxStatus と DiagramView だけを書き換えた（dispatch 応答 d2 の receipt.changed は sharedVariants と origins、d3 は sharedVariants のみで、overlays は含まれない）。
- 比較画面を開いて取り消しても: Review で RecoveryNotice が一旦消え（s4 の overlays が空）、DiskStatus は Conflict のまま。KeepEditing 後の s5 で DiskStatus##Conflict と overlays の RecoveryNotice が両方戻っている。
- 補足（推測ではなくモデル本文の確認）: `DiskStatus##InSync` を set するのは VersionReview の SaveCopy / ReplaceReviewedDisk / UseDiskVersion だけ。KeepEditing は set しない。今回の操作ではそれらを実行していないので「解決操作を行うと InSync になる」は照会で確かめていない（モデル本文を読んだだけ）。
- 保存した検討手順（derived.review.txt）でも、記録1の結果1が `set(DiskStatus##Conflict)`、記録2・3が SyntaxStatus と DiagramView だけ、記録5の結果2が `show(RecoveryNotice)` と読める。ただしこの手順は set の対象名しか書かず、状態が残ることの直接の証拠は state 照会の方。
- 最終 actions 照会（id=a6）で Review が再び enabled（overlay:RecoveryNotice 配置）になっていることも、通知が戻った裏付け。

## 2. 前の版と変更後モデルの違いと対応付け
前の版のモデル本文は渡されていないので、以下は検討手順の記録から読み取った推測（前の版の挙動は自分では照会していない）。
- 状態の部品: 前の版は `DocumentStatus` 一つに Conflict / Invalid / Valid が入っていた（`set(DocumentStatus##Conflict)` 等）。変更後は `DocumentStatus` は SyntaxStatus と DiskStatus を包含するだけの部品になり、`set` の対象は `DiskStatus##Conflict`、`SyntaxStatus##Invalid/Valid` に分かれた。前の版では ParseError が `DocumentStatus##Invalid` を設定していたので、同じ singleton の値が Conflict から Invalid へ入れ替わると読める。変更後は別 singleton なので入れ替わらない。これが問いの核心と理解した。
- 操作名（Conflict, ParseError, ValidInput, Review, KeepEditing）、host、配置、結果の個数と順序は一致した。actions 照会（a1, a2…）の actionText と host で確認した。
- 対応付けの方法: 操作名を手順の「N. 操作名 / host / 配置」と actions 照会の actionText・host・placement で一致させた。意味の対応は set の対象名と変更後モデル本文（`#! SyntaxStatus` / `#! DiskStatus`）の読解による。
- 問いの「競合は残っている」の読み方: 前の版は DocumentStatus##Conflict が残っているかを見ていたと推測。変更後は DiskStatus##Conflict と overlays の RecoveryNotice の二つで見た。
- 手順に書かれていた「現在まで」は、全観測点が保持中でcursorまでという意味と理解（status=retained 相当。詳細は provenanceStep を照会しておらず未確認）。
- 前の版の検討手順は DiskStatus や SyntaxStatus を知らないので、結果の `set(...)` 行は完全には一致しない。出力が一致しないこと自体がモデル変更の差分として期待されたものと理解した。

## 3. 選び直しで間違えた操作・やり直した操作
なし。ただし作業手順の失敗が二つあった。(a) 最初の Bash で `echo ======` が zsh の `=` 展開で失敗し、proposed.shitae を読む部分が実行されなかったので再実行した（CLI 操作とは無関係）。(b) 最初に state 全体を照会して約25KBの出力を受信した。以後は sharedVariants 等だけを抜き出す小さな helper（sv.sh）を使った。CLI のセッション状態には影響していない（query は記録されない）。

## 4. 転記した情報
なし。操作名とhandleは actions 照会の応答から取った。handle は `<sessionId>:<revision>:<index>` の形式で、sessionId 部分は応答から読み、helper スクリプト内に固定して使った（revision と index は都度 actions 照会の結果を見て指定）。前の版の手順から手で書き写した値はない。

## 5. 追加の質問
なし。強いて言えば、(1) 前の版のモデルと手順にある「現在まで」の意味（retained かどうか）と、(2) 解決操作 SaveCopy 等まで進めて InSync に戻ることを確かめる範囲に含めるか、は問いの範囲外と判断して聞かなかった。

## 6. ファイル
読んだファイル:
- /tmp/i25-handoff-011251/original.review.txt
- /tmp/i25-handoff-011251/model/proposed.shitae
- /Users/m5/works/shitae/.worktrees/issue-25/docs/design/session-usage.md
- /Users/m5/works/shitae/.worktrees/issue-25/docs/design/session-provenance.md
- 自動で読み込まれた CLAUDE.md / AGENTS.md（作業ディレクトリの指示）。リポジトリのソース・SPEC・evidence・dogfooding・AI_GUIDE・git log/diff は読んでいない。

作ったファイル（すべて /tmp/i25-handoff-011251/out/ 配下。リポジトリ内には何も書いていない）:
- derived.scenario.json（exportScenario 応答の `scenario` 部分のみ。読みやすさのため整形して保存）
- derived.review.txt（review 照会の `text`）
- derived.jsonl（送信行 `>>` と受信行 `<<` を交互に並べた全記録。19往復。sv.sh 等の内部 helper が行った state / actions 照会も含む）
- recipient-report.md（本ファイル）
- 作業用: send.sh, ac.sh, sv.sh, dp.sh（照会・dispatch の小さな helper）, req.jsonl, resp.jsonl（生の送受信ログ）, stderr.txt（空）
- music.shitae は out/ に見えるが自分では作っていない（作成時刻は作業中だが、出所不明）。
- 終了時に CLI process と fifo は片付けた。
