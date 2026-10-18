# #27 統合利用評価：今回の記録と判断

2026-10-18。**現状は AI 用の分析ツールと位置づけ、人向け受取評価はデザイン改善前の段階と判断する。** 設計者の [原文と経緯](human-stage1-feedback.md#設計者の最終判断後続回答原文) に基づき、今回の人向け評価は打ち切る。[人向けデザイン issue](https://github.com/takasek/shitae/issues/35) の改善後に再評価する。今回の評価記録の作成は完了するが、#27 全体の受入は完了していない。

固定版は `8c86f7cb1412e919554a41d65ff96f68f7e2b1bb`。準備の履歴は [preparation.md](preparation.md)、開始時の計画と最終判断は [plan.md](plan.md) を参照。R2 は設計者指示で行わない。AI 用という位置づけは当面の利用判断であり、AI の独立引継ぎがすべて検証済みという意味ではない。

## 得られた証拠

- **CLI 構文検査**：[S1](models/s1/expenses.shitae)、[S1派生](models/s1-revised/expenses.shitae)、[S2](models/s2/main.shitae) の check は3入口とも exit 0。[題材と問い](models/README.md)。AI 作者の素材で、人間作者による評価ではない。
- **実ブラウザ探索と保存証拠照合**：[探索報告](browser/report.md) と [S1保存時画像](browser/s1-ghost.png)。[S1保存物](browser/s1-explorer.scenario.json) と [S2保存物](browser/s2-explorer.scenario.json) は、別 CLI process で replay し全 export が一致した（[S1結果](browser/s1-explorer-validation.json)、[S2結果](browser/s2-explorer-validation.json)）。S1 は dispatch9/seek3/reset0/手動0、S2 は dispatch14/seek0/reset1/手動2。これは agent の探索と保存証拠の検証であり、独立受取や人の成果ではない。
- **題材の修正**：初期 S2 は手動試験対象がなく不十分だった。[初期モデル](models/s2-initial/)、[旧版保存物](browser/s2-initial-explorer.scenario.json)、[照合結果](browser/s2-initial-validation.json) を保持。[修正モデル](models/s2/catalog.shitae) で探索し直した。製品不具合の修正ではない。
- **CLI 不一致拒否**：[生成スクリプト](build-identity-fixtures.mjs) と [完全結果](identity/cli-results.json)。初期 Session の scenario について同一モデル exit 0、不一致5種 exit 1。engine は metadata だけを変更した制御 fixture で歴史的な旧処理系ではない。entry 差には module 追加、module 増減には entry source 差も伴い、診断に記録する。参照 module の source だけを変更した検査では entry source 同一を assert した。初期 Session の不一致拒否を探索経路の再生や GUI の保持の証拠にしない。
- **派生モデルの準備**：[準備結果](s1-revised-preparation.json)。条件名を一件変更したモデルへ旧 scenario を replay すると MODEL_MISMATCH / exit 1。人が検討手順を参照して同じ問いを選び直した証拠ではない。
- **人の予備的試用**：[原文と最終判断](human-stage1-feedback.md)。流れの大筋は読み取れたという申告と、巻戻し先・閲覧/操作の区別・スクロール・用語・情報階層への指摘を得た。人の申告を agent の再現検証と区別する。操作はランダムウォークと明示されたため、経路・操作意図・効率を分析せず、正式な受取評価の成功/失敗として採点しない。案内の追加説明は1回行った。
- **独立レビュー**：[レビュー記録](independent-review.md)。修正版の CLI 6件と S1/S2 の保存物照合を別担当が再実行した。CLI/保存証拠の照合であり、reviewer の実ブラウザ操作や独立受取ではない。

## 未達と今後の扱い

| 項目 | 今回確認した範囲と未達 |
| --- | --- |
| 構造の違う2題材 | agent の実ブラウザ探索・保存・別CLI照合済み。独立受取は未完了 |
| 作者と探索/受取の分離 | 別会話・別 directory。OS 読取禁止は未実施。厳密な隔離の受入は未達 |
| HTML/scenario → 回答後に全モデル | 人への HTML/scenario 配布まで。全モデル配布以降はデザイン改善後へ保留 |
| 経緯説明・次の一操作・再保存 | 正式な人向け受取評価の前段階と判断。厳密な説明・次の一操作・再保存は未検証。追加依頼しない |
| 不一致理由・行動選択・失敗後 Session 保持 | CLI 拒否のみ確認。GUI は [ファイル選択の応答待ちで中断](browser/gui-import-limit.md)。受取人による行動選択も未確認 |
| 派生モデルで同じ問いを再検討 | fixture と旧scenario拒否まで。人の再検討はデザイン改善後へ保留 |
| #25 の人による相違確認 | 試用時点では未実施。後続の設計説明と [A 方針の採用](../state-axes/clarified/decision.md) で意味と対応を確認。人による UI 再検討は未実施で #27／#35 に残す |
| 改善前後の比較 | 設計者指示で対象外。速度改善を主張しない |
| 人間作者の評価 | 未実施。素材は AI 作者が作成しており、人間作者による評価の代替にはしない |

[人向けデザイン issue](https://github.com/takasek/shitae/issues/35) は、状態を変更しない履歴閲覧、巻戻し先の予告、変化を追えるスクロール、用語と情報量・視覚階層を扱う。具体方式と実装は別作業。従来の人向け受入条件を達成済みにせず、#27 の該当チェックも付けない。issue close/merge は行わない。
