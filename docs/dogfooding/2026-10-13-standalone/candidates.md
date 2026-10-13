# 改善候補の統合と対応

2026-10-13の起票前確認では、GitHub connectorのissue検索、全状態のCLI一覧（limit 1000）、RESTの全ページ一覧で既存issueは0件と確認した。PRを改善issueと混同しない。既存issueへのコメント・状態変更は行わない。

| 候補 | 出典 | 判断・公開先 | 分類と境界 |
| --- | --- | --- | --- |
| CLI出力切断 | Astra 1 / Sol 1 | [#8](https://github.com/takasek/shitae/issues/8) | 高。不具合候補。出力完了と早期exitの因果は修正後検証が必要 |
| inline子要素表示 | Astra 2 | [#9](https://github.com/takasek/shitae/issues/9) | 高。既存表現の可視化。inlineの入れ子/interaction制約やレイアウトは広げない |
| alias member gate解決 | Sol 6 | [#10](https://github.com/takasek/shitae/issues/10) | 高。仕様/実装不一致候補。未定義参照のalways-onを保つ |
| シナリオ保存・再生 | Astra 4 / Sol 2 | [#11](https://github.com/takasek/shitae/issues/11)へ統合 | 中。ログ・巻戻し・simconfigの新設ではなく、モデル版と操作/分岐を渡す補助機能 |
| receiver説明と入れ子状態表示 | Astra 3 / Sol 3 | [#12](https://github.com/takasek/shitae/issues/12)へ統合 | 中。操作の変更先と包含部品の現在状態を任意表示。裸gotoの意味変更や通常インスタンスの共有化はしない |
| AI_GUIDEのsingleton/set入口 | Sol 4 | [#13](https://github.com/takasek/shitae/issues/13) | 中。SPECが正本。有限代表文書を複数文書の共有設計と誤認させない |
| 空の葉のW103警告 | Sol 5 | 保留、ここへ記録 | 低。70件の意図した葉と記述漏れが混在し得る。leaf構文やW103一律抑制を追加する前に、未定義葉の運用と外部の承知済み警告台帳を比較する |
| Mermaidのset/包含補助表示 | Astra 5 | 保留、[#12](https://github.com/takasek/shitae/issues/12)への関連として記録 | 低。遷移図の目的に沿った限界。凡例と既存simulator併用で足りるか先に確認し、移動/参照/状態変更を区別したビューの需要を再評価する |

新規6issueには再現条件、指定版、期待/実際、設計境界、レポート保存commit `6f212d056f9c7dbf72b1c255a7542b8107d26d64` の固定URLと、PFDSL一次分析の保存索引固定URLを収録した。[起票後の読戻し記録](evidence/issue-readback.json)では、全6件の保存タイトル・本文が独立レビュー済みの内容と完全一致し、openであることを確認した。候補の採用・実装は別作業。製品コード、SPEC、AI_GUIDEを今回変更しない。
