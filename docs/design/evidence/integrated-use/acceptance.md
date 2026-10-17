# #27 統合利用評価：進行中

2026-10-18。固定版と準備結果は [準備記録](preparation.md)、設計者判断は [計画](plan.md) を参照。R2 は設計者指示で対象外。人の評価が残るため、統合利用評価は完了していない。

## 確認済み

- **CLI 構文検査**：親が [S1](models/s1/expenses.shitae)、[S1派生](models/s1-revised/expenses.shitae)、[S2](models/s2/main.shitae) の check を実施し、3入口とも exit 0。題材と問いは [作者メモ](models/README.md)。AI 作者による素材で、人間作者による評価ではない。
- **CLI 不一致拒否**：[生成スクリプト](build-identity-fixtures.mjs) が初期 Session の scenario を保存し、別 CLI process で同一モデル exit 0、不一致5種 exit 1を検査。[完全結果](identity/cli-results.json)。engine は metadata のみを変更する制御 fixture で、歴史的旧版の実行証拠ではない。entry 差には追加 module、module 増減には entry source 差も付随し、診断に記録される。参照先だけの差では entry source が同一であることを assert する。
- **独立レビュー**：別会話の reviewer が前項スクリプトと初期結果を別 directory で再実行し、パス以外の一致を確認。指摘なし。S2 の手動試験対象追加後の6件は親が再実行。詳細は [独立レビュー記録](independent-review.md)。初期 Session の照合に限り、操作経路の再生・GUI Session 保持を立証しない。

- **実ブラウザ探索と保存証拠照合**：S1 の経路・表示は [探索報告](browser/report.md)、保存時の状態は [画像](browser/s1-ghost.png)。[ブラウザ保存物](browser/s1-explorer.scenario.json) を別 CLI process で replay し、全 export 一致を [照合結果](browser/s1-explorer-validation.json) で確認した。これは探索担当の証拠で、人の受取評価ではない。
- **評価素材の修正**：初期 S2 は手動試験対象を持たず未達。[旧版観察](browser/report.md) と [旧版保存物](browser/s2-initial-explorer.scenario.json) を保持し、[修正モデル](models/s2/catalog.shitae) で実ブラウザ評価をやり直した。[修正版保存物](browser/s2-explorer.scenario.json) は dispatch14/seek0/reset1/手動2。別 CLI process の [全 export 照合](browser/s2-explorer-validation.json) が一致。製品不具合とは判定していない。

## 受入状況

| 項目 | 状況 |
| --- | --- |
| 構造の違う2題材 | 実ブラウザ探索・保存・別CLI照合済み。独立受取は OPEN |
| 作者と探索/受取の会話分離 | 別会話・別 directory。OS 読取禁止は未実施 |
| HTML/scenario → 回答後に全モデル | 人の段階1待ち。案内は [human-stage1.md](human-stage1.md) |
| 経緯説明・次の一操作・再保存 | OPEN |
| 不一致理由・行動選択・失敗後 Session 保持 | CLI拒否のみ確認。GUI/受取は OPEN（[ファイル選択の応答待ちで中断](browser/gui-import-limit.md)） |
| 派生モデルで同じ問いを再検討 | OPEN |
| #25 の人による相違確認 | OPEN |
| 改善前後の比較 | 設計者指示で対象外 |
| 人間作者の評価 | 未実施。AI 作者の代替 |

実ブラウザ・CLI・headless/VM・保存証拠照合を区別し、agent 評価を人間一般に広げない。速度改善を主張しない。PR/issue 更新は未実施、issue close/merge は行わない。
