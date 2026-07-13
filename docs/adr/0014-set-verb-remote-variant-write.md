# ADR-0014: `set(X##v)` — 遷移を伴わない singleton の共有 variant 書き換え（state verb）

- Status: accepted（2026-07-14、設計者承認。verb 名 `set` は設計者選択）
- 出典: stress-test r3 — findings C1。**2 プローブが独立に同じ壁へ収束**（langlearn: ハート自然回復・非アクティブ画面の状態書換 / ticketing: カート 0 件でミニバー変更）— r3 最強の表現力シグナル

## Context

variant への書き込み手段は従来、遷移（`goto(##v)` / `push(X##v)` 等）か掲示（`show(X##v)`）に付随するものしか無かった。「画面 A で起きた出来事が画面 B の状態を変える」——ハートを使い切ったら学習画面をハート切れ表示に、ハートが自然回復したら通常に戻す——を書くには、B へ実際に遷移する chaining（`exit(@lesson) ; goto(##ハート切れ)`）が要り、戻り先が B でない場合・B が非アクティブな間に起きる事象（時間経過等）では書けなかった。被験者は自然文コメントへの諦めか、singleton `show(X##v)` の掲示副作用つき濫用しか選択肢が無かった。

r2 の singleton（ADR-0011）が「状態の生存」を解いたのに対し、これは「状態への**遠隔書き込み**」。

## Decision

result に書ける **state verb** カテゴリを新設し、唯一の語 **`set`** を置く。

```
#! 学習          // タブ画面を singleton にする（タブは事実上単一インスタンス）
## 通常
レッスン開始ボタン
## ハート切れ

# 問題
> タップ(選択肢) -> [不正解・ハート切れ] set(学習##ハート切れ) ; exit(@lesson)

> ハートが回復する -> set(学習##通常)     // document common でもよい（非アクティブ中の事象）
```

- **意味論**: `set(X##v)` は X の共有レジストリに v を書き込む**だけ**。フレーム木を操作しない・掲示しない（`show(X##v)` から掲示副作用を抜いたもの）。全所在に即時反映（ADR-0011 の共有規則そのまま）。
- **対象は singleton のみ**。通常 component はインスタンス独立なので「どのインスタンスに書くか」が定まらず、遠隔書き込みは定義不能——これが set を singleton 専用にする根拠であり、逆に「遠隔から状態を書きたくなったら、その component を `#!` にする」が設計の导線になる（タブ画面の `#!` 化を SPEC で誘導する）。
- **構文**: `set-nav = "set" , "(" , [module-name , "::"] , name , "##" , name , ")"`。
  - `##variant` は**必須**（E029）。`set(X)` は書き込む値が無く無意味。裸 `set(##v)` も禁止（E029 に含める）——アクティブ component の variant 変更は既存の `goto(##v)` の仕事で、重複記法を作らない。
  - collection `*`・session `@S` は取れない。
- **診断**:
  - E029（parser）: `set` の引数が `component##variant` の形でない（`set()` / `set(X)` / `set(##v)` / `set(X, @S)`）。
  - E030（checker）: `set` の対象が**定義済みの非 singleton** component。未定義 component への set は従来方針どおり素通り（ラフさ優先。lint はヒントを出してよい）。
  - W105 拡張: `set(X##v)` の v が X に定義されていない variant。
- **予約語カテゴリ**: transition verb / overlay verb と並ぶ第 3 カテゴリ「state verb」。既存文書で effect として書かれていた `set(引数)` は本 ADR の時点から意味を持つ（「予約語は今後増える可能性がある」の既定路線）。

## 検討した代替案

- **gate の条件源分離**（`タップ(ボタン ? ハート.残あり)` 等・findings C2）: ガード式への半歩で「条件を評価しない」原則と衝突。C2 の摩擦の本体は「variant 分割は正しいイディオムだが、その variant を条件源の変化に追随させる書き込み手段が無い」ことであり、set の導入で解消する。gate 自体は「対象=条件源」型のみと SPEC に明記して現状維持。
- **`show(X##v) ; hide(X)` の慣用句化**: 掲示の一瞬の副作用が残り、意図（状態書換）と手段（掲示）が乖離する。却下。

## Consequences

- SPEC: 記号一覧・EBNF・予約語・「singleton component」節に追記。「操作は variant に属する」節に C2 の明記（gate は対象=条件源型のみ。対象と条件源が別なら variant 分割 + set）。診断コード表に E029/E030/W105 拡張。
- 実装: parser（set の構文 + E029）→ checker（E030・W105 拡張）→ runtime（`reduce` に set action。共有レジストリ書換のみ、diagnostics なし）→ simulator/transpilers（set の表示・エッジ化はしない——遷移でないため mermaid の edge にしない。効果表示のみ）。
- 「shitae はデータを持たない」との整理: set が書くのは variant（見た目の状態）だけ。ADR-0011 の整理を変えない。
