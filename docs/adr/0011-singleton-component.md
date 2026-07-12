# ADR-0011: singleton component `#!` — document 内で variant を共有する単一インスタンス

- Status: accepted（2026-07-12、設計者合意。記法 `#!` は設計者選択）
- 出典: stress-test r2 — findings C1。**3 プローブ全てが独立に「フレームを生き延びる状態」を要求**（delivery: クーポン受取済・カート点数 / podcast: 再生速度 / photosns: 既読バッジ）— 今ラウンド最強の表現力シグナル

## Context

variant はインスタンスごとに独立で、push/present は毎回 initial variant で開く。このため「一度クーポンを受け取ったら以後どこから開いても受取済」「再生速度の設定が画面を閉じても残る」という、データの代理を variant に負わせる場面のごく普通の要件が原理的に書けなかった。被験者は毎回 initial で開き直す不正確な近似を確信度 低で採用していた。

## Decision

定義ヘッダ `#!` で **singleton component** を宣言できる。

```
#! クーポン
## 未受取
> タップ(受け取る) -> クーポンを受け取る ; goto(##受取済)
## 受取済
適用ボタン
```

- singleton は **document 内で単一インスタンス**。どこから `push` / `present` / `show` しても、また要素として何箇所に置かれても、**variant 状態を共有**する。
- variant 指定なしで開いたとき、初回は initial variant、以降は**最後に遷移した variant** で開く。`X##v` 指定・`goto(##v)` は共有状態を書き換える。
- 参照側の記法は無変更（`present(クーポン)` — 特別な参照記号は要らない）。
- 通常 component（`#`）の「インスタンスごとに独立」の規則は不変。singleton は opt-in の例外。

記法選定: `#`/`##` と同じ見出し記号ファミリーの拡張であり、原則 5（構造は記号で表す）と多言語中立性を保つ。構造キーワード案（`single X` 宣言）は宣言と定義の分離と語彙の追加を伴うため退けた。

## Consequences

- 「shitae はデータを持たない」原則との緊張は「variant がデータの代理をする」既存の整理の延長で吸収する — singleton が共有するのは**variant（見た目の状態）だけ**で、値・カウンタは従来どおり扱わない。
- セッション・フレーム意味論との相互作用: singleton もフレームに積まれる点は通常 component と同じ（フレーム木の規則は不変）。共有されるのは variant 状態のみ。
- SPEC: two-layer model・記号一覧・EBNF（header に `#!`）・専用節を追加。parser（AST に `singleton` フラグ）→ runtime（共有 variant レジストリ）→ simulator の順で TDD 追随。
- 同一 component の「独立インスタンスが欲しい」ケースとの共存は、singleton にしない（既定のまま）ことで表す。
