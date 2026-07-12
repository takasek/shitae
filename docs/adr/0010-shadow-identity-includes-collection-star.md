# ADR-0010: shadow の一致判定に `*`（collection 全体参照）の有無を含める

- Status: accepted（2026-07-12、設計者合意）
- 出典: stress-test r2 — spec-review-r2 S5 = 内部レビュー R8（独立収束）

## Context

shadow「完全一致」の基準（ADR-0006 B6: 対象参照は quote を剥いだ name の等価、`?` は含めない）は ADR-0004（対称参照）以前の文言で、`*` に言及がなかった。実装（resolver `referencesEqual`）も `collection` フラグを比較せず、`スクロール(*手札)` と `スクロール(手札)` が互いに shadow していた。意味的には別対象（collection 全体 vs 1 インスタンス）。

## Decision

`*` の有無は shadow 一致判定に**含める** — `行動(*対象)` と `行動(対象)` は異なる対象参照であり、shadow の対象にならず両立する。

`?` を含めない決定との整理: `?` は**同一の行動**への条件付与（gate を付けても行動の同一性は変わらない）、`*` は**対象そのものの変更**（全体と 1 インスタンスは別の操作対象）。

## Consequences

- SPEC: 「操作は variant に属する」節の完全一致基準に 1 文追加。resolver の `referencesEqual` に `collection` 比較を TDD で追加。
