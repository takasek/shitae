# Issue 35 独立実装レビュー

対象: `/Users/m5/.codex/worktrees/shitae-issue35-design/shitae` の未コミット差分、新規履歴テスト、GUI履歴契約、ADR-0025。読み取りのみ。過去レビュー/evidence報告は未参照。

## 指摘

### [P2] 右ペインの確認・取消・閲覧終了でfocusが起点へ復帰しない

- `packages/simulator/src/gui-session.js:409-412`（復元先が同一キーまたはhistory親のみに限定）、同:69、75（右ペインの固有キー）。
- 反例: 過去点を閲覧し右ペインの `request-resume` にfocusして確認へ進む。置換後DOMには同じキーがなく、起点も履歴行の子ではないため、captureのfallbackが選んだ「たまたま表示中の先頭行」の親へfocusする。初期点のみ、metadataなしfallbackなど親のない状態ではbodyへ落ちる。同じ問題が `cancel-resume` と `end-preview` にも起きる。
- DOM置換を再現するVM probe（history行の親を提供しないモック）で3操作ともfocusがnullとなることを確認。このprobeは通常の履歴行がある場合のfocus先を検証していない。通常行ありの場合はソース上、起点と無関係な可視行へのfallbackになる。実ブラウザでの操作はこのレビューでは未実行。
- Bの「focusが消えず」「起点または明記した親へ残る」を満たさない。確認に入るときのfocus先と取消/終了時の戻り先を保持し、置換後に復元する必要がある。

### [P2] 最終保存状態への近道が実際の結果番号・状態番号を表示しない

- `packages/simulator/src/gui-session.js:112-114`。
- 近道のボタンは常に「この操作の最後に保存された状態を見る」だけで、対象のresultPosition/ordinalを表示していない。結果本文は見出しを開くまで出ない。
- A「近道には実際の結果番号・状態番号を併記」、GUI履歴契約「最終結果が無観測なら前の結果に属することがあり、実際の結果・状態番号を示す」、ADR-0025に反する。観測あり結果の後に無観測結果がある操作では、押す前に近道がどの結果を指すか判別できない。
- probe出力: `<button data-focus-key="last:1" onclick="previewObservation(3)">この操作の最後に保存された状態を見る</button>`。
- provenanceの対象点から実際の結果と状態をラベルへ付ける必要がある。

### [P2] metadataなしfallbackで操作後の全地点が「起動」と表示される

- `packages/simulator/src/gui-session.js:50-63`、とくに63。
- metadataなしは既存サポート経路。provenanceはavailable=false・items=[]になるため、pointDescriptionは全地点で `起動 / <画面>` を返す。
- 反例: `Home -> push(Next); back()` のtimelineは id=1「起動」、id=2「push → Next」、id=3「back → Home」。生成HTMLのVMでそれぞれの説明が `起動 / Home`, `起動 / Next`, `起動 / Home` になることを確認。固定現在地・閲覧見出し・再開の変更前/後がこの関数に依存し、同じ画面に戻った異なる点の区別も失う。
- provenance unavailable時はtimelineのlabelや安定IDから識別可能な説明を作り、起動は初期点のみに限定すべき。

## 検証

- `pnpm exec vitest run packages/simulator/test/history-preview.test.ts packages/simulator/test/load-summary.test.ts packages/simulator/test/presentation.test.ts packages/simulator/test/scenario-ui.test.ts packages/simulator/test/simulator.test.ts`
- 5ファイル / 170テストすべて通過。初回は対象checkoutの一時ファイル書込み権限でEPERM、昇格後に上記成功。EPERM自体はテスト失敗ではない。
- `/private/tmp/shitae35-review-probe.mjs` に独立反例probeを保存。生成HTML（現行build）をVMで実行しfocus・近道表示・metadataなし表示の上記反例を確認した。
- 閲覧/取消のstate・revision・history・provenance・handle・export不変、拒否/失敗load保持、受理no-op解除、分岐破棄、成功load世代更新は対象テストで成功。Sessionの実行処理への変更はない。
- 実ブラウザanchor 2px以内、狭幅、拡大、支援技術、CLI別process照会はこのレビューでは再実行していない。実行済みテストの成功からこれらの受入を推定しない。
