# Issue 35 v3.1 独立再確認

対象: /Users/m5/.codex/worktrees/shitae-issue35-design/shitae/docs/design/2026-10-20-issue35/v3 の trial-state.mjs、ui-proposal.html、scripts/state.test.mjs、scripts/review-regression.test.mjs。初見試行の結果は未読。入力変更、Git操作、外部書込みなし。

結論: R1〜R3の指摘経路は修正済み。今回の修正範囲に追加のブロッキング指摘はない。

## 根拠

- R1 解消: trial-state.mjs:7 でno-op受理時にselectedを解除。ui-proposal.html:37 が現在表示への復帰を明示し再描画する。記録7・結果1を続行位置、記録10・結果1を参照対象にした状態からno-opを実行し、参照解除・続行位置保持・未来参照可能を確認した。A-history.md:56 の参照寿命と一致する。
- R2 解消: ui-proposal.html:37-38 がno-op/branchの両方でconfirm.hidden=trueにする。現行HTMLの実際のscriptをNode VMと簡易DOMで実行し、未来参照の移動確認を開いた後、no-op/branchをそれぞれ実行。確認と参照帯がともに隠れ、現在画面と対応資料が表示されることをassertした。元の「破棄済み対象の確認が残る」経路はなくなった。cancelも同じハンドラ実行で、続行位置不変・参照保持を確認した。
- R3 解消: trial-state.mjs:8、ui-proposal.html:30 が結果位置と分岐状態を判定する。記録12・結果1は資料未用意、結果2はloaded。no-op後の記録7・結果1はnoop。分岐後に保持された元の全結果へ再開した場合はnull（UIは未用意）になり、branched資料を誤案内しない。ui-proposal.html:26 は分岐後の追加操作デモを隠し、固定の分岐資料で表現できない再分岐をUI上から生じさせない。

## 実行検証

1. `node --test docs/design/2026-10-20-issue35/v3/scripts/state.test.mjs docs/design/2026-10-20-issue35/v3/scripts/review-regression.test.mjs`: 4 tests、4 pass、0 fail。
2. 上記簡易DOMで、実HTMLハンドラによるno-op/branchの確認解除、参照解除、現在位置表示、資料案内を確認。取消→再確認→記録12・結果1への確定後の「未用意」も確認。
3. loadModel/replayScenario/queryを使ってloaded/resumed/noop/branchedの4資料をそれぞれ新規Sessionで再生。模型の全共有値・cursorObservationId・元の各結果の保持可否と実Sessionをassert照合し、全て一致。
4. 分岐後、保持された元の全結果へ順に再開し、全て資料未用意になることをassert確認。

## 限界と残る既知の省略

これは固定代表点の設計模型の再確認であり、製品受入や人の理解の証明ではない。簡易DOMはイベントハンドラとhidden/text更新を検証しただけで、実ブラウザのCSS、focus、scroll、AX、クリック到達性は検証していない。保存資料は事前生成された対応例であり、任意の往復やno-opの繰返しまで含む操作journalの完全一致を保証するものではない。今回照合した「履歴」はsnapshotの保持範囲である。

前回報告した非ブロッキングの省略（参照対象ごとのscroll復元、参照行の表示、分岐後の記録15の履歴追加）は今回のR1〜R3修正範囲外で、解消したとは評価していない。
