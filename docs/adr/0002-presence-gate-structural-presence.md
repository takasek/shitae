# ADR-0002: presence gate は「構造的 presence」— 参照解決先の現在 variant で判定する

- Status: accepted（2026-07-12、設計者合意）
- 出典: stress-test 2026-07 — spec-review S5/S8/S12・spec-internal-review R3・reservation プローブ

## Context

SPEC は gate を「静的な注記」と呼ぶが、common に置いた gated 行動の有効性はもともと host の現在 variant に依存しており、「静的」は「式を評価しない（variant ごとに on/off が構造から確定する）」の意味でしかなかった。
対象が別 component の要素参照（`タップ(日付.選択可能?)`）のとき、どちら側の variant で存在を見るかは未規定で、haiku プローブは「参照先 component の現在 variant」と自然に読み、これで「満席の日は選べない」を条件式なしで表現した。
静的側に倒すと跨 component の gate は定義不能（対象のどの variant を見るかが決まらない）で、この有用パターンが死ぬ。

## Decision

gate の「存在」を次の**構造的 presence** として定義する。

- 判定は「参照が解決される先の variant の実効 body（共通＋固有）に、対象と同名の alias または ref が element-line として書かれているか」。
- 裸参照（`投了?`）は host component の現在 variant、要素参照（`日付.選択可能?`）は**対象インスタンスの現在 variant** で判定する。
- 式・値比較は導入しない（XState guard との差＝任意述語を持たない、は維持）。collection は個数を問わない（宣言の有無のみ）。
- 対象が未定義 component 等で presence が判定不能なときは **always-on**（ラフさ優先。lint はヒントを出してよい）。
- `?` の出現位置は行動対象のみ。nav-target 等への `?` は構文エラー。

SPEC の「静的な注記」という語は「構造的 presence」に改める。

## Consequences

- SPEC の gate 節・XState 対比の段落を書き直す。
- インスタンスの variant は shitae の外（データ）で決まりうる — condition label と同じ「外で転ぶ」整理を明記。simulator はインスタンス variant の手動トグルで観測可能にする。
- gate は未実装（S5）だったため、実装はこの定義で新規に入れる（simulator/checker、TDD）。
