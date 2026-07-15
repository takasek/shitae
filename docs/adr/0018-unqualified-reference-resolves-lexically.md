# ADR-0018: 無修飾 component 参照の module 解決はレキシカル（書かれたファイル）基準

- Status: accepted（2026-07-15、設計者承認）
- 出典: stress-test r4 — findings B1（3 経路独立到達: runtime 実測 M2 / オラクル Q2 の読者期待 / SPEC 内部整合レビュー §5）

## Context

`set(X##v)` / `show(X)` / `push(X)` 等の無修飾（module 修飾なし）component 参照は、
発火時に実装がどの module に解決するかが未規定だった。runtime 実測では、発火時のアクティブフレームの module
（`currentFrame().module`）に動的解決されていた——doc common の裸 `##v`（ADR-0007）と同じ動的束縛の扱い。

一方、`::` の一般原則（ADR-0017）は「参照が書かれたファイルの import 表による」というレキシカル基準であり、
オラクル被験者はここから「無修飾も書かれたファイル基準のはず」と外挿し、実装と正面衝突した（Q2）。
SPEC 内部整合レビューも独立に「`::` はレキシカル、doc common はアクティブ、overlay の無修飾はどちらとも
明言されていない」と指摘している。

doc common では両基準は常に一致する（有効な doc common ＝アクティブ画面のファイルのものであり、
そこに書かれた無修飾参照の module も同じファイル）。挙動が分かれるのは **overlay 掲示中 component の
interaction** だけ——掲示中 component はアクティブフレームとは別ファイルに定義されうる。

## Decision

- 無修飾 component 参照（`set` / `show` / `hide` / nav-target とも）の module 帰属は**レキシカル**——
  その interaction が**書かれたファイル**の module に解決する。発火時のアクティブ module では**ない**。
- `::` の一般原則（「参照が書かれたファイルの import 表による」）を無修飾参照へ拡張したものであり、
  新しい基準を導入するわけではない。
- 裸 `##v`（同一 component 内の variant 切替。ADR-0007）は本 ADR の対象外——「同一 component」という
  スコープ自体が動的に決まる別の記法であり、変更しない。
- member gate の評価（`gate.module ?? currentFrame().module`）も、収集（sourceModule）と同じレキシカル
  基準に統一する——現状は評価が動的・収集が字句という内部非対称があり、これも解消する。

## Consequences

- SPEC: モジュール化節（無修飾解決の規則）＋オーバーレイ節（overlay の例）に反映（T3）。
- 実装: **正規化は呼び手（simulator extract）の責任**（ADR-0013 の路線を踏襲）。extract が SimAction
  生成時に `module: norm(body.target.module ?? sourceModule)` で字句ホストの module を焼き込む
  （現状は `?? null`）。対象は `convertResultBody` 系（transition target・overlay・set）に加え、
  `extract.ts` の `buildGate()` 内 `module: norm(ref.module ?? null)`（member gate 収集）も同様に
  `?? sourceModule` へ直す——Decision の member gate 統一はここに実装が対応する。runtime 側は変更しない
  ——`?? currentFrame().module` の fallback は最後の防衛として残すが、extract を通る限り到達しない。
  runtime の docstring に「module 解決は呼び手責務」を追記する。
- 挙動が変わるのは overlay 掲示中 component の interaction のみ（doc common・通常画面は両基準が一致する
  ため無変化）——r4 実測の「mod 定義の掲示中ミニプレイヤーの無修飾 set が no-op になる」という挙動が、
  本 ADR 適用後は「レキシカルな mod の共有状態が書き換わる」に変わる。これが本修正の眼目（regression では
  ない意図的な挙動変更）。
