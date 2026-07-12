# ADR-0007: 裸 `##variant` は実行時のアクティブ component に解決される

- Status: accepted（2026-07-12、設計者合意）
- 出典: stress-test r2 — oracle Q5（被験者が「決められない」を正当報告）・spec-review-r2 S14

## Context

SPEC は裸 `##variant` を「同一 component 内の variant」と言うだけで、「同一」がどの component かを定義していなかった。書かれた場所（字句ホスト）と実行時のアクティブ component は、(a) document common から継承された interaction、(b) 掲示中 overlay の interaction、(c) フレーム新規作成系 verb、で乖離する。実装（runtime `navTargetToLocation`）は一貫して実行時カレント。

## Decision

1. 裸 `##variant` は**実行時にアクティブな component**（アクティブフレームの最上段）に対して解決される。例外なし。字句ホストではない。
2. **フレームを新規作成する形**（`push(##v, @S)` / `present(##v[, @S])` / `switch(##v, @S)`）への裸 variant target は**構文エラー**（E023）。variant 切替のつもりの読者にフレームが増えるのは驚きが大きすぎる（T6 実測: `switch(##展開, @weird)` が同一 component 別 variant の新フレームを無警告で作った）。`push(##v)`（セッションなし・積むだけ）と `goto(##v)` は従来どおり可。
3. document common の裸 `##variant` 禁止（既定）に診断コード **E022** を割り当て施行する（round-2 A2: 規範だけあって施行も欠番もなかった）。

## Consequences

- overlay の interaction 内で裸 `##v` を使うと**背後のアクティブ画面**の variant が書き換わる（規則どおりだが多くの場合事故）。overlay 自身の variant 変更は ADR-0009 の再 show 慣用句で行う。lint（W 系）は静的に overlay 文脈を判別できないため導入しない。
- SPEC: 「variant の参照は必ず ##」節に解決規則 1 文を追加。診断コード表に E022/E023。parser に TDD で追随。
