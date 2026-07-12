# ADR-0009: オーバーレイ集合のエントリは (component 名, 表示 variant) を持ち、再 show は variant を上書きする

- Status: accepted（2026-07-12、設計者合意 — findings-r2 B4「更新」side、B5 はこれで解決）
- 出典: stress-test r2 — spec-review-r2 S2・内部レビュー R5/R6/R7・oracle Q7（読者期待 = 更新を実測）

## Context

SPEC は `show(X##v)` の variant 指定を規定するが、(1) 実装（runtime/simulator）が variant を捨てていた、(2) 掲示中の再 show の挙動が未規定、(3) variant 省略時の既定が未規定（「initial variant で開く」規則は transition 限定）、(4) 掲示中 component が自分の表示 variant を変える手段が無かった。

## Decision

1. オーバーレイ集合のエントリは **(component 名, 表示 variant)**。ID は従来どおり component 名（多重掲示なし）。
2. 掲示中の component への再 `show(X##v)` は表示 variant を **v に上書き**する（hide を経由しない）。
3. `show(X)`（variant 省略）は **X の initial variant** で掲示する。既に掲示中なら表示 variant を initial に上書きする（規則 2 の適用）。
4. 掲示中 component の variant 変更の正攻法は**自己再 show**（`> タップ(一時停止) -> show(ミニプレイヤー##一時停止)`）。overlay の interaction 内の裸 `##v` は ADR-0007 によりアクティブ画面に解決されるため、この用途には使えない。
5. 掲示中に有効な interaction は**表示中 variant の実効 body（共通＋固有）のもの**（フレーム上の component と同じ規則）。

## Consequences

- SPEC: オーバーレイ節に規則 1-5 を明文化。runtime の `overlays: Set<string>` を `Map<string, variant>` 相当へ、simulator の帯表示も variant 対応 + interaction 操作可能化（round-2 A3/A8 の追随）。TDD。
