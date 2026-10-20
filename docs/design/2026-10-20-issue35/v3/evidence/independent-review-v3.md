# Issue 35 v3 独立レビュー

対象: /Users/m5/.codex/worktrees/shitae-issue35-design/shitae/docs/design/2026-10-20-issue35/v3。読取のみ。利用試行担当の結果は未読。製品/SPEC変更は対象外。Git変更・外部書込み・入力生成スクリプト実行はしていない。

## 指摘

### R1 [P2] 無観測no-op後に参照が解除されず、既存の参照寿命契約を変更している

`v3/trial-state.mjs:7`、`v3/ui-proposal.html:37`。記録7・結果1へ再開→記録10・結果1を参照→「前の画面に戻る」で、続行位置は7だが画面は10の参照のまま。Nodeによる再現で `live=7, view=10, selected=true` を確認した。`A-history.md:56` は、無観測no-opでも受理した実行command後には参照と移動確認を解除して現在表示へ戻す、と明記している。後続snapshotを保持することと参照画面を保持することを混同している。`v3/scripts/state.test.mjs:7` が反対の挙動を期待するため、既存テスト成功では検出できない。既存契約に合わせて参照解除を検証するか、契約変更を明示して判断する必要がある。

### R2 [P2] 分岐操作後も破棄された点への移動確認が残る

`v3/ui-proposal.html:34-38`。記録7・結果1へ再開→記録10・結果1を参照→「ここから操作を続ける…」で確認を開く→同時に表示されている「申請を取り下げる」を実行すると、branchはselectionを消すがconfirmを隠さない。移動先が破棄された後にも確認の「この位置に変更」が残り、押すと `trial-state.mjs:6` の「参照先なし」で例外になる。source上、confirmを隠す処理は履歴選択・復帰・取消・commitにしかなく、branch/noopにないことを確認。`A-history.md:56-60` の確認解除と古い再開入口を残さない契約に反する。branch/noop受理時に確認も閉じる必要がある。DOMイベントのブラウザ実行は未検証であり、この指摘はハンドラと状態関数の直接照合による。

### R3 [P2] 現在位置の資料案内が異なる状態のシナリオを指す

`v3/ui-proposal.html:30`。stepだけで判定するため、記録12・結果1へ再開してもloaded.scenario.jsonを案内する。しかし結果1は「保存済み」で、loadedは結果2「未保存」。両者の値はSession観測値とfixtureの一致を直接確認した。また、一度branchするとbranchedフラグが残り、その後保持中の記録3などへ再開しても常にbranched.scenario.jsonを案内する（Nodeでlive=3, branched=trueを再現）。現在の状態の資料を選ぶという同HTML13行・guide.htmlの説明と矛盾し、別の実値を現時点の値として照会させる。step/resultまたは観測IDと履歴系列を照合し、未用意の位置は未用意と表示する必要がある。

## 実施検証と確認できた範囲

- `node --test docs/design/2026-10-20-issue35/v3/scripts/state.test.mjs`: 2件成功。R1の反対期待が含まれるため契約適合の証明にはならない。
- 既存ビルドのloadModel/replayScenario/queryを使用し、loaded/resumed/noop/branchedの4保存資料を新しいSessionで再生成功。各metadataはfixtureと一致。
- loadedの全14結果について、観測IDから取得した共有variantとhistory-data.jsonのvaluesをdeepEqual照合して一致。
- 文書B: loaded「再確認が必要」、resumed/noop/branched「確認済み」。読込時点・指定の再開時点の実値確認資料は存在し、再生できた。
- loaded cursor=15/latest=15/count=15、resumed/noop cursor=8/latest=15/count=15、branched cursor=16/latest=16/count=9。seekで未来を保持し、no-opでcursor/未来が変わらず、分岐で後続を破棄する実資料を確認。
- docs/SPEC.mdのbackの戻り先なしno-opと、packages/session/src/index.tsのquery/seekを読んで照合。
- preview/closeはliveを変更せず、cancelハンドラは状態移動を呼ばないことを確認。
- 生成スクリプトは入力変更を避けるため実行していない。ブラウザのfocus/scroll/AXや人の理解、公開CLIの標準入力経路、別環境でのビルド再現はこのレビューでは未検証。既存ビルドのSession API再生成功と区別する。

追加の非ブロッキング不足: B-position.mdで定める参照対象ごとのスクロール復元と「参照中」行表示はv3で表現されていない（HTML32行は毎回main.scrollTop=0、23/29行は参照中の行を標示しない）。また分岐後の記録15は固定の履歴行へ追加されない。限定模型の省略であれば、v3 READMEにこの範囲を明記すると既存A/B契約の撤回との混同を防げる。
