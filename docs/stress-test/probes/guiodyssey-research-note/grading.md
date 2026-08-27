# research-to-note 採点

- アプリ内の画面遷移、variant、戻り道は自然に対応する。
- Opera から Simplenote へのクリップボード因果は自然言語効果であり、実データの受け渡しや外部サービス再生を表すものではない。
- `check` は静的検証、`simulate` は HTML 生成だけであり、GUIOdyssey の実行を再現した証拠ではない。
- 追加のコア構文は提案しない。

## CLI verification (2026-08-23)

`check` は exit 0 で診断なし、`simulate` は exit 0 で HTML stdout 29,476 bytes、`mermaid` は exit 0 で Mermaid stdout 1,247 bytes だった。生成物はリポジトリに保存していない。
