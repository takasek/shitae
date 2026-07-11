# shitae 概念語彙の英語化 — 設計

## 目的

SPEC の概念語（姿・壁 等）が日本語固有で、日本語圏外に広げられない。アフォーダンスのある英単語に全面置換する。既存エコシステム（Figma・statecharts・ブラウザ仕様）からの借用を優先し、意味が衝突する語（state / guard / switch）は避ける。

## スコープ

- **対象**: 概念語のみ。構文記号・遷移語（push/back/goto/exit/present/dismiss/switch）・文法は不変。
- **SPEC 本文は日本語のまま**、術語だけ英語に置換する。
- 対象ファイル: `docs/SPEC.md`、`docs/AI_GUIDE.md`、`.claude/skills/shitae-authoring`（スキル本文）、`docs/example-*.shitae`（コメント内の術語）。
- **`docs/GLOSSARY.md` を新設**: 全概念語の正準名・記号・定義・旧称の対応を一覧化し、`.claude/CLAUDE.md` の入口に加える。
- parser 実装のリネーム（variation → variant 等の型名・テスト名）は**別判断・スコープ外**。

## 語彙対応表

| 旧語 | 新語 | 根拠 |
|------|------|------|
| 姿（`##`） | **variant** | Figma component variants から借用。ターゲット層（Figma 前段のスケッチ）に最強のアフォーダンス。EBNF の variation も variant に統一 |
| back の壁 | **(back) barrier** | ナビゲーション文脈で自然な技術語。「present erects a back barrier」と動詞とも相性良 |
| 存在ゲート（`?`） | **presence gate** | UI 文脈では existence より presence が自然 |
| 常在（`?` 無しの既定） | **always-on** | |
| 条件ラベル／分岐ガード（`[...]`） | **condition label** | 2 語を 1 語に統一。guard は XState の動的ガードと紛れるため廃語 |
| セッション（`@S`） | **session** | 現状維持 |
| フレーム／フレーム木 | **frame / frame tree** | 現状維持。ブラウザ仕様（HTML spec の frame tree）と同語 |
| 錨フレーム | **anchor frame** | |
| 集合（`*`） | **collection** | |
| 共通部分 | **common**（component common / document common） | EBNF の common-body / document-common と揃う |
| ねじれ | **mismatch**（mismatched pairing） | |
| 遷移語／複合語 | **transition verb / compound verb** | push 等は動詞 |
| 姿替え（`goto(##X)`） | **variant change** | switch は予約語と衝突するため不使用 |
| 初期姿 | **initial variant** | |
| 単一の姿 | **single variant** | |
| 二層モデル | **two-layer model** | |
| shadow / alias / inline component / quoted name / import / as | （既に英語、維持） | |

## 避けた語と理由

- **state**: 設計原則「状態は条件式ではなく姿で表す」が自己言及的に壊れる（state ではないと宣言する語に state を使う矛盾）。
- **guard**: XState の動的ガード（評価式）と紛れる。shitae は評価しない注記のみ。
- **switch**（姿替えの意味で）: 遷移語 `switch` と衝突。

## 書き換え方針

- SPEC 内の日本語術語を新語に置換。初出時のみ「variant（姿）」のように旧語を括弧で併記してよいが、以降は新語のみ。
- 「姿」を含む複合表現（姿固有・全姿に共通・姿の独立性 等）は variant-specific / common to all variants / variant independence 等、文脈に応じて訳す。日本語文としての読みやすさを保つ（無理な英語混在で文を壊さない）。
- example の `.shitae` 内のコメント・AI_GUIDE のチェックリストも同期。
- 検証: `pnpm test`（parser 統合テストが SPEC 文言に依存しないこと確認）、`git grep` で旧語の残存ゼロ確認（「姿」「壁」「存在ゲート」「条件ラベル」「分岐ガード」「集合」「ねじれ」「遷移語」「複合語」「錨」「常在」「姿替え」）。

## エラーハンドリング・テスト

ドキュメント変更のみ。既存テストが green のままであること（文言依存テストがあれば追随）。旧語 grep ゼロが完了条件。
