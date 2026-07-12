# ADR-0008: switch の兄弟規則を「最も近い switch 製祖先の兄弟」へ強化する

- Status: accepted（2026-07-12、設計者合意 — findings-r2 B2 の (b) 案）
- 出典: stress-test r2 — spec-review-r2 S11 + oracle Q1（独立到達）、runtime トレース T1

## Context

従来規則「現在フレームが switch 製なら兄弟、switch 製でなければ子」は、タブ内で `push(記事, @reading)` した先から `switch(検索, @tabSearch)` すると検索タブを **push フレームの子**にしてしまい、`exit(@reading)` が検索タブを無警告で道連れ破棄する（T1 実測）。兄弟規則の動機（exit がタブを道連れにする事故の防止）が、タブ以外のフレームを 1 枚挟むと再発していた。読者期待（oracle 被験者・プローブ 2 本）は「タブは常に横並び」。

## Decision

switch でフレームを新規作成するとき、親は次で決める:

- 現在フレームから祖先方向に**最も近い switch 製フレーム**があれば、その**兄弟**（= その親の子）にする。
- switch 製祖先が無ければ、従来どおり現在フレームの**子**にする。

従来規則は「最も近い switch 製祖先 = 現在フレーム自身」の特殊ケースとして包摂される。タブ内でどれだけ push/present を挟んでも、新タブは既存タブ群と横並びになる。

## Consequences

- `exit(@reading)`（タブ内の閲覧セッション破棄）が他タブを道連れにしなくなる。
- 「タブ群への入場は present の名前付きフレームで」というタブ慣用句（anchor）は不変。
- SPEC: 「switch（中断と復帰）」節の兄弟規則と verb 対応表を改訂。runtime に TDD で追随（受け入れ基準: T1 の遷移列で検索タブが @tabHome フレームの子として生存すること）。
