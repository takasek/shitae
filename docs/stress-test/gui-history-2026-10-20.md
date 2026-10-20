# 生成GUI履歴契約の境界確認（2026-10-20）

承認済み設計を [ADR-0025](../adr/0025-history-preview-and-resume.md) と [GUI履歴契約](../design/gui-history-contract.md) へ反映した。言語構文・runtime意味論は変更しないため、新しいDSL構文プローブやframe意味論実験は追加せず、表示契約の境界に限定する。

- 手トレースと実測: 閲覧・取消でstate/revision/actions/journal/export不変、確定seekでのみ位置変更、末尾無観測結果に架空の点を作らない、分岐で同一記録内の可否が混在することをVM/Sessionの既存queryで照合。
- 独立読み手: 設計元の内部整合レビュー、実装差分レビュー、AIによる生成HTMLの実操作を別文脈で実施。
- 表示オラクル: queryが返す当時の包含・overlay・共有値を現在Sessionと比較し、実ブラウザーで予測した閲覧/取消/再開/分岐と表示を照合。

源流の未定義だった末尾無観測結果の近道とfilter fallbackは仕様化した。実装指摘は修正後に再レビュー。詳細とRed/Green、成功件数、未検証範囲は [実装記録](../design/2026-10-20-issue35/implementation/README.md) に集約する。
