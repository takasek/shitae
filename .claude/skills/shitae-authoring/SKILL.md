---
name: shitae-authoring
description: Use when reading, writing, editing, or reviewing shitae UI sketches (.shitae files) — the UI rough-sketch language in this repo for describing screens, components, variants, interactions, and transitions. Trigger whenever the user wants to draft a screen flow, sketch UI before Figma/implementation, add or modify a component/variant/transition, or review a .shitae file, even if they don't name "shitae" explicitly.
---

# shitae を読み書きする

shitae は UI ラフスケッチ言語。**ラフであることが機能** — 穴・未定・自然文を許す。厳密さが要る段階は shitae の仕事ではない。

## 手順

1. **書く/直す前に `docs/AI_GUIDE.md` を読む**。記号・予約語・transition verb の使い分け・分岐の意味論・出力例がすべてここにある。仕様の細部や曖昧点は `docs/SPEC.md`（唯一の正）を、概念語の正準名は `docs/GLOSSARY.md` を引く。
2. 既存の書き味に合わせる。`docs/examples/battle.shitae`（コア構文の通し書き）/ `docs/examples/ecommerce.shitae`（モーダル・session・singleton カートと set）/ `docs/examples/music.shitae`（overlay・タブ部品化）/ `docs/examples/fleamarket/`（module 分割・タブ慣用句・規模の手本）が検証済みの手本。
3. **書いたら必ず `docs/AI_GUIDE.md` 末尾のチェックリストで自己点検**する。特に頻出ミス:
   - variant change は `goto(##variant)`（`##` を落とすと別 component への遷移になる）。
   - 遷移には transition verb を書く（`-> 完了` は副作用、`-> push(完了)` が遷移）。
   - 要素参照は alias 名で引く。`present` したものは `dismiss`/`exit` で閉じる。
4. 機械検証は `/shitae-check <file>`（参照整合・モーダル整合）。

## やらないこと

- transition verb 以外のキーワードを発明しない。表現できないものは自然文で書く。
- 状態を `if`/`guard`/変数で書かない → variant（`##`）の列挙で表す。
- 未定を `???`/`(未定)` でなく自然文で書く。
- レイアウト・寸法・型定義は扱わない（Figma / 状態機械の領分）。
