# Nextcloud share-retry 採点

- アプリ内の共有・保存先・アップロード状態の遷移は自然に対応する。
- 外部イベント、バックグラウンドワーカー、ネットワーク前提は評価メタデータに属する。
- expected-vs-actual の失敗と再試行成功も評価メタデータに属し、コア DSL の実行結果ではない。
- `check` と `simulate` は静的検証と HTML 生成だけで、報告されたサービスを再生した証拠ではない。
- コア構文の追加は提案しない。

## CLI verification (2026-08-23)

`check` は exit 0 で診断なし、`simulate` は exit 0 で HTML stdout 32,721 bytes、`mermaid` は exit 0 で Mermaid stdout 1,177 bytes だった。生成物はリポジトリに保存していない。
