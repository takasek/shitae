# language-setting 採点

- 設定アプリ内の階層遷移とカレンダー画面への到達は自然に対応する。
- OS ロケール伝播とスペイン語表示のアサーションは自然言語効果であり、DSL が評価する条件ではない。
- `check` は静的検証、`simulate` は HTML 生成だけであり、GUIOdyssey の実行を再現した証拠ではない。
- 追加のコア構文は提案しない。

## CLI verification (2026-08-23)

`check` は exit 0 で診断なし、`simulate` は exit 0 で HTML stdout 30,033 bytes、`mermaid` は exit 0 で Mermaid stdout 1,098 bytes だった。生成物はリポジトリに保存していない。
