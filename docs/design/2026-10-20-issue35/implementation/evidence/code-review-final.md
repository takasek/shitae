# Issue 35 独立実装再レビュー

対象: `/Users/m5/.codex/worktrees/shitae-issue35-design/shitae` の最新未コミット差分。初回報告 `/private/tmp/shitae35-product-review.md` は保持した。read-onlyで初回3指摘と修正周辺の回帰を再確認。

## 結論

初回P2 3件は解消。今回確認した修正範囲に追加の必須修正指摘なし。

1. **focus復帰** — `packages/simulator/src/gui-session.js:31-41,298,411-416`。確認へ進むとconfirm-resume、取消ではrequest-resume、閲覧終了では該当previewボタン、確定ではcurrent-positionへ移す明示的な復帰先が追加された。存在しないcontrolについてもcurrent-positionへfallbackする。`packages/simulator/test/history-preview.test.ts` の新規focusテストを独立実行し成功。独立VM probeでも確認/取消/終了の遷移を確認した。
2. **最終保存状態の位置表示** — `packages/simulator/src/gui-session.js:115-117`。近道にpointDescriptionを併記し、実際の記録・結果・状態番号を表示する。末尾無観測backのテストが「結果2は地点なし」「近道は結果1/状態1」を照合して成功。
3. **metadataなしfallback** — `packages/simulator/src/gui-session.js:52-66`。初期id=1のみ起動とし、その他は観測ID・label・定義内結果位置を表示。独立VM probeのpush/back反例で `観測2「push → Next」 / 定義内の結果1 / Next` と `観測3「back → Home」 / 定義内の結果2 / Home` を確認。同じ画面に戻っても初期点と区別できる。

## 独立検証

- `pnpm exec vitest run packages/simulator/test/history-preview.test.ts packages/simulator/test/presentation.test.ts packages/simulator/test/simulator.test.ts`
- 3ファイル / **152テスト通過**（history 8、presentation 1、simulator 143）。
- 初回で通過済みのload-summary/scenario-uiは修正対象外のため繰り返していない。
- `/private/tmp/shitae35-review-probe-final.mjs` に最新gui-session.jsを生成HTMLへ差し込む独立probeを保存。distのGUIコピーが古かったため、そのまま実行した旧probeの出力は最新修正の判定に使っていない。最終probeでfocus・近道ラベル・fallback説明を確認した。確定focusは最新ソースを読むVitestで確認。
- 実ブラウザのpixel位置、狭幅、拡大、支援技術、CLI別process照会は本再レビューでは未実施。テスト成功からこれらの受入を推定しない。

## 追記: viewport座標でのanchor保持（最終追加差分）

前回152件の独立実行後に追加された差分として確認した。`gui-session.js:394-395,408` はanchor/親の変更前 `getBoundingClientRect().top` をそのまま保存し、復元時に変更後のviewport topとの差をscrollTopへ加算する。ペイン上端自体がstatus高さによって動いても補正され、B1のviewport内位置保持と一致する。親fallbackにも同じ座標系を適用している。先頭追従・Session世代変更の既存分岐は維持される。

対応テストはpaneTopを0→20へ変更すると同時に行内容位置を200動かし、scrollTopが120→340になることを確認する反例へ更新されている。静的照合で修正との整合を確認し、追加指摘なし。提供された `/private/tmp/shitae35-viewport-green.log` では対象8テスト通過を確認した（実装者実行ログ。この追記での独立再実行・実ブラウザ測定はしていない）。

## 追記: 状態確認案内の独立表示（追加差分限定）

`gui-session.js:177-178,191,242-243` と新規assertionを確認。常設案内はidentity-detailsの閉じタグ直後に独立detailsとして置かれ、版情報を開かずにsummaryへ到達できる。load要約内はload-state-query、常設はstate-queryとなり、capture/restoreのMapキーが衝突しない。案内本文・収集範囲・保存/API意味論は維持される。GUI契約38行との整合を確認し、実装の追加指摘なし。テストは位置とキー一意性を検証する形に更新済み。今回は読取確認のみで独立再実行なし。実装者報告の関連22件成功を独立実行結果としては扱わない。

文書の軽微な残件: C-load-summary.md:17は旧記述「『定義と実行プログラムの版・再現用の資料』にも置き」を残し、末尾67行も「直後にも」と加筆している。実装は内部から直後へ移動しているので、本文も「直後に置き」、末尾も「直後に独立した…」へ揃えると内外両方にあるという誤読を避けられる。

## 追記: 近道ラベルの照会削減・イベント説明（最終限定差分）

`gui-session.js:52-66,117`を確認。completionObservationIdを取得した同じprovenance itemのstepをpointDescriptionへ渡しており、対象点をその記録のobservationsから選ぶため結果/状態番号の意味は変わらない。既知stepなしの現在地・確認・閲覧説明は従来の探索を維持し、metadataなしfallbackにも影響しない。全履歴を近道ごとに再探索する処理が除かれることをソースで確認した。新規テストは30操作後の1renderでprovenanceStep照会数を数え、90以下を要求する。今回独立再実行はしておらず、実装者のRed/Green報告と区別する。

`simulator.ts:1275`のイベント説明は、event種の状態点だけを条件付きで隠しprovenanceの操作/seek記録自体は維持する実装と整合する。現在点を常に表示する既存例外は維持される。追加指摘なし。

C-load-summary.md:17,67の位置記述も「版情報の直後に」へ修正されていることを確認し、直前追記の文書残件は解消した。これで本レビューの未解消指摘はなし。

## 追記: 最終表示文2箇所の静的確認

履歴actionsのbranches空配列に「なし」を補う表示と、item.discarded.lengthを「この記録で文章のみになった地点:N件」と示す表示を確認した。前者は条件欄の空白を避け、後者は当該記録が破棄した点の数を当該記録自身の保持/破棄countsから区別する。どちらも既存データの説明変更で、query/dispatch/seekや保存内容の変更はない。追加指摘なし。依頼どおり静的確認のみで、関連17件通過という実装者報告の独立再実行はしていない。
