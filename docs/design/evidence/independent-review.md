# 共通 Session 契約案の独立レビュー記録

2026-10-14。実装会話を引き継がない別 agent が、Issue #18/#12 の現行本文、SPEC、runtime/simulator/CLI の一次コード、ADR-0008/0022/0023 と契約案を照合した。対象 base は `e985f4ee58ab76339df5b0f59144e1f1a5da91c8`。対象成果物は [session-contract.md](../session-contract.md)、fixtures、runtime probe。本記録はレビューの結果をまとめたものであり、新 Session の実装受入を表さない。

## 指摘と修正

1. CLI を seek 非公開としたまま、各 result の途中状態を GUI と比較する経路がなかった。dispatch response の各 observation に、snapshot から Session が投影した detached な `view` を追加した。過去 view は操作 handle を持たず、最終 query のみ現在 revision の handle を持つ。G01 の比較対象を具体化した。読戻しで解消確認。
2. 既存 GUI の組込み「← 戻る」をモデル interaction なしで実行する Session 入口がなかった。query の `controls.back` に組込み handle と可否を追加し、共通 dispatch の revision/operation/history/ghost 処理へ接続した。`builtin-back.shitae` を反例 fixture として追加。追記と runtime の back 規則を照合し、解消確認。

最終再確認で未解消の actionable finding なし。CLI 方式、試験値の作用範囲/source 必須化、runtime と SPEC の不一致をどう直すかは、契約案の proposed な設計判断として残る。

## 独立実行

- fixture 三件の CLI check は全て exit 0。switch-contexts は空 component 由来の W103 六件、他二件は診断なし。
- runtime probe `--expect-spec` は exit 1。四観測すべての SPEC 不一致を記載どおり再現。
- 新 Session の実行意味、CLI/GUI 接続、実ブラウザ、再ドッグフーディングは未実装・未検証。

既存 build/test/typecheck の実装側の検証結果は [validation.json](validation.json) に分離して記録した。レビューで契約を読んだこと、既存テストが通ったこと、CLI/GUI が同じコードを使う予定であることを新実装の正しさの証拠にはしない。

## 通常応答の縮小に関する改訂レビュー

2026-10-14、初版契約 commit `5b075552b95ebff1bd022e7085758ab65e2d6295` からの改訂。ユーザーの「通常の応答は小さくして、全状態・履歴・結果途中の詳細は必要なときだけ照会する」という要求を、実装会話を引き継がない別 agent が差分・関連全文・SPEC・ADR-0023・必要な一次コードから照合した。初版で dispatch に付けた詳細 view は、今回の契約では observation query に移した。

通常応答/既定 query は summary と今回の実行 receipt、全状態/操作/metadata/履歴/途中 view は明示 query とする。履歴はページ単位で、過去の観測値の照会は現在状態を変更せず実行 handle を返さない。C04/C05 の応答量・詳細照会の受入と G01 の比較手順も更新した。

指摘は一件。G01 を receipt.operationId からの観測点照会だけにすると、receipt のない reset/拒否と観測点のない no-op を比較できなかった。観測ありの受理操作、reset、拒否/無観測 no-op の比較経路をそれぞれ定義し、内部 seek/分岐と公開 CLI の境界を明記した。修正箇所の読戻しと diff check で解消を確認し、未解消・新規の actionable finding はない。

本改訂の文書検証は [compact-response-validation.json](compact-response-validation.json)。JSON Lines の例とローカルリンク、差分の整形を検査した。production/fixture は変更しておらず、既存全件テストの再実行は行っていない。実 response の byte 数、pagination 実行、CLI/GUI 接続は未実装のため未検証。
