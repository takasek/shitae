# ADR-0004: collection の対称参照 — 参照位置の `*手札` は全体、`手札` は 1 インスタンス

- Status: accepted（2026-07-12、設計者合意）
- 出典: stress-test 2026-07 — spec-internal-review R18

## Context

`*手札` と宣言した collection を「全体」として参照する構文が無く、全体操作（スクロール等）には inline で包んで別名を付ける二重ラッピングが必須だった。
名前が要らない場面でも命名を強制する迂回であり、宣言記号 `*` の意味が参照側に対称に現れないのは直感に反する。

## Decision

参照位置（行動対象）でも `*` 前置を許す。

- `スクロール(*手札)` … collection 全体への操作。
- `タップ(手札)` … 1 インスタンスへの操作（従来どおり）。
- inline による包み込みは「別名を付けたいときの追加手段」に格下げする（必須の回避策ではなくなる）。

## Consequences

- SPEC: collection 節と EBNF（reference に `*` 前置を追加）を改訂。nav-target には導入しない（collection へ遷移する概念は無い）。
- parser/resolver に TDD で追随。既存文書は無変更で valid（追加のみ）。
