# ADR-0003: オーバーレイ集合 — show/hide（語は仮）で component を常時表示層に掲示する

- Status: accepted（2026-07-12、設計者合意。動詞の正式名は SPEC 改訂時に確定）
- 出典: stress-test 2026-07 — music/video プローブ（PiP・ミニプレイヤー・トースト等が表現不能）

## Context

「アクティブなフレームは常に 1 つ」の外側にある常駐要素（ミニプレイヤー・PiP・バナー）は、6 プローブ中 2 本が独立に「書けない」と申告した頻出パターン。
document common は静的な重ね合わせしか表せず、「再生中のみ表示」のような条件付き可視性が落ちる。

## Decision

実行時状態として**オーバーレイ集合**（掲示中 component の集合）を導入する。

- result として `show(X)` / `hide(X)`（語は仮）を書ける。どの interaction からでも追加・除去できる。`hide` の対象が掲示されていなければ no-op。
- 掲示中の component は全画面で表示され、その interaction はどこでも有効。
- オーバーレイは**フレームではない** — back/exit/dismiss の走査対象外で、明示的な hide だけで消える。
- ID は component 名が兼ねる（同一 component の多重掲示の実需が出るまで別 ID は導入しない）。
- テキストだけのヒントは専用機構にせず、**本文がテキストの component（または名前がそのテキストである未定義 component）を show する**ことで表す — (id × string) リスト構想は「id = component 名、string = body」としてこの機構に包摂される。
- オーバーレイ集合は stroke（Plan C のシナリオ層）の assertion から観測可能な状態として設計する（`overlays contains X` 相当）。
- 特定画面での除外（例: Now Playing 上にはミニプレイヤーを出さない）は初版では見送り、既知の制限として注記する。

## Consequences

- 条件式は導入していない — 可視性の変化は遷移（show/hide の result）にのみ紐づき、「評価しない」原則は維持される（セッション・フレーム木と同類の遷移駆動状態）。
- 予約語追加は S2 の教訓（既存文書の effect への静落ち）を踏むため、「`語(引数)` 形の effect への lint」（findings C8）とセットで導入する。
- SPEC: 記号一覧・EBNF（result に overlay verb を追加）・専用節の新設。実装は parser → simulator の順で TDD 追随。
