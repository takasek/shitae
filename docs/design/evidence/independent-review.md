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
