# ADR-0019: overlay 掲示中 component の裸 gate は掲示中 component 自身の表示 variant で判定する

- Status: accepted（2026-07-15、設計者承認）
- 出典: stress-test r4 — findings A4（コード確定 + SPEC 内部整合レビュー §4 の独立到達）

## Context

SPEC「操作は variant に属する」節は、裸参照（`行動(対象?)`）の presence gate を
「host component（**その行動が書かれている component**）の現在 variant」で判定すると定める（L253）。

実装（simulator `gateEnabled`）は host gate を常に `currentFrame()`（アクティブフレームの最上段）で判定
していた。overlay 掲示中 component の interaction（`overlayInteractions()` 経由）でも同じ判定経路を通る
ため、掲示中 component 自身が持つ要素への gate が、掲示中でない画面をアクティブにしている間は黙って
無効になっていた——ミニプレイヤーの `> タップ(曲名?) -> push(プレイヤー)` は、曲名要素を持たない画面
（ホーム等）の上に掲示中でも `currentFrame()` 側の body で判定され、gate が off になる。

SPEC 内部整合レビューは、この経路について「SPEC の言い回し自体が『host がフレームに積まれている』
前提で書かれており、overlay への適用は明文でない」と独立に指摘した——字義通りに読めば実装は SPEC 違反だが、
overlay への適用が明文化されていない以上、実装を正として SPEC 側を書き足す余地もある、という A/B 境界の
論点だった。

## Decision

- overlay 掲示中 component の裸 gate は、**掲示中 component 自身の表示 variant の実効 body**（共通＋固有）
  で判定する。アクティブ画面側の body は判定に**使わない**。
- SPEC L253 の字義（host component ＝その行動が書かれている component）どおりに戻す——overlay の
  interaction が書かれている component は掲示中 component 自身であり、アクティブフレームの component
  ではない。
- ADR-0015（doc common の裸 gate はアクティブ component の動的解決）はこの経路を**覆わない**。
  doc common が動的解決するのは「字句ホストが無い」からであり、overlay の interaction には字句ホスト
  （overlay 自身）が明確に存在する——両者は理由が異なるため同じ扱いにする根拠がない。
  doc common の動的解決は現状維持（regression テストで確認する）。
- member 参照（`対象.要素?`）の判定（対象インスタンス側の variant を見る。host 不要）は本 ADR の対象外
  ——変更しない。

## Consequences

- SPEC:「操作は variant に属する」節の裸参照規則に overlay の 1 文を追加。オーバーレイ節 L552
  「その表示中 variant の実効 body」の記述と、host gate の対応関係を明確化する（T3）。
- 実装: simulator `gateEnabled` に「判定対象 component」を引数化するか、overlay 経由の interaction に
  host 情報（掲示中 component 自身）を持たせる（実装形は任せる。「singleton モジュール」を参照）。
- 受け入れ基準（手トレース確定済み）: `# ミニ` の `## 再生` body に要素 `曲名` と
  `> タップ(曲名?) -> push(プレイヤー)`、アクティブ画面 `ホーム`（曲名なし）で `show(ミニ##再生)` 中
  → gate on（interaction 有効）。逆に `## 一時停止`（曲名なし）を表示中なら gate off。
