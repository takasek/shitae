# ADR-0015: document common の裸 gate 参照は発火時のアクティブ component で判定する（ADR-0012 B7a の変更）

- Status: accepted（2026-07-14、設計者承認）。ADR-0012 B7a（host 不在 → 判定不能 → always-on）を置き換える
- 出典: stress-test r3 — findings B3（SPEC 内部整合レビューが非対称を指摘）

## Context

document common に書いた interaction について、2 つの「host が字句上存在しない」問題への解決が非対称だった:

- 裸 `##v`（`goto(##v)` 等）: **発火時にアクティブな component** に動的解決（ADR-0007）
- 裸 gate 参照（`行動(対象?)`）: host 不在 → 判定不能 → **always-on**（ADR-0012 B7a）

後者は、書き手が明示的に `?` で opt-in した意図を黙って無視する。「未定義 component への gate は always-on」（解決不能・ラフさ優先）とは事情が違い、doc common の裸参照は**画面ごとに解決可能**——対象名がある画面と無い画面が定まる。

## Decision

document common の裸 gate 参照は、**発火時のアクティブ component の現在 variant の実効 body**（共通＋固有）に対象と同名の alias / ref があるかで判定する。ADR-0007 の原理「document common から継承した interaction は、アクティブ component に書かれたかのように振る舞う」を gate にも貫徹する。

```
> 通知タップ(記事リンク?) -> push(記事詳細)   // 記事リンク要素を持つ画面でだけ有効な deep link
```

- member 参照（`対象.要素?`）は従来どおり対象インスタンス側の variant で判定（host 不要。変更なし）。
- **未定義 component への gate は従来どおり always-on**（変更なし——変わるのは「doc common の裸参照」の扱いのみ）。
- 判定に使う実効 body は shadow 合成後のアクティブ variant のもの（component common ＋ variant 固有。document common 自身の要素行も含む——document common の要素は全 component の表示に乗るため。SPEC 改訂 D5 と整合）。

## Consequences

- SPEC: 「操作は variant に属する」節の always-on 列挙から「document common の裸参照」を削除し、動的解決の 1 文と用例を追加。
- 実装: simulator `buildGate` の hasHost=false → indeterminate 分岐を廃止し、doc common の裸 gate を host 種別（判定対象 = アクティブ component）として扱う。checker 側に静的判定は追加しない（実行時にしか決まらない）。
- ADR-0012 の B7a 項は本 ADR により superseded。
