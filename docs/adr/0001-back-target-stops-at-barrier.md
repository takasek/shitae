# ADR-0001: back(X) は barrier で停止する

- Status: accepted（2026-07-12、設計者合意）
- 出典: stress-test 2026-07 — spec-review S6・oracle Q4・spec-internal-review R7

## Context

SPEC「戻り先が無いとき」は back(X) が barrier に当たったときの挙動を一意に読めない書き方だった。
runtime（phase3 実装）は「壁を越えてよい」というコメント付きで barrier を越えて pop していたが、その判断の根拠はどこにも記録されていない。
オラクルプローブ Q4 では SPEC のみを読んだ被験者が「barrier で no-op」を予測しており、読者期待は「止まる」側にある。
また EBNF は `back(X##variant)` を許すが、「戻り系はスタックに積まれた時点の variant へ戻る」原則と両立しない（R7）。

## Decision

1. `back()` / `back(X)` はともに **barrier で停止し no-op**（ツールは警告してよい）。壁を越えて畳めるのは exit / dismiss のみ、という役割分担を明確にする。
2. back の引数から `##variant` を落とす（`back(component)` のみ）。戻り先の variant はスタックが決める。

## Consequences

- SPEC「戻り先が無いとき」に back(X) も barrier 対象であることを明記。EBNF の back-nav を修正。
- runtime の back(X) 分岐を修正（壁で停止 + 警告）。TDD で追随。
