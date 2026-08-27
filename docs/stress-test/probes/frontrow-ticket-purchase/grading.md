# FrontRow ticket-purchase 採点

- アプリ内の画面遷移は自然に対応する。
- FrontRow は可視性アサーションと test ID が評価層の契約であり、コア DSL の機能ではないことを示す。
- `check` と `simulate` は静的検証と HTML 生成だけで、OSS アプリのテストを再生した証拠ではない。
- コア構文の追加は提案しない。

## CLI verification (2026-08-23)

`check` は exit 0 で診断なし、`simulate` は exit 0 で HTML stdout 31,677 bytes、`mermaid` は exit 0 で Mermaid stdout 1,802 bytes だった。生成物はリポジトリに保存していない。

Mermaid には `チケット購入_購入済み --タップ(マイチケットタブ)--> マイチケット一覧` の edge が出力され、document common のタブ対応を確認できる。
