# #69の残件に対する追加結果

## 解消した残件：途中分岐のGUI実保存物

前回未回収だった種類の保存物を、同じmodule模型から新たに実ダウンロードし、回収・読込・分岐・再保存・別process再開まで確認した。前回失われたファイルそのものを発見したという意味ではない。保存の成功通知だけで判定せず、ブラウザーが返すdownload.pathからファイル本体を取得した。

操作前の問いと期待は expectations.md。a::Homeへ戻るBackFlowの途中で操作位置を止めたとき、後の結果が自動実行されずghostとして残り、保存後も同じ位置から別の操作を選べるかを確かめた。

| 工程 | 期待と実際 | 根拠 |
| --- | --- | --- |
| GUIで結果途中へ戻る | ShowA→Both→Again→BackFlow→ReturnA後、記録4の結果1へ確認付きで戻る。a::Home、a::Notice Ready、b::Notice Idle、Controller、ghost 3地点 | browser/ghost-before-save.txt・png |
| GUI保存の実体を回収 | 5 dispatch＋1 seek、timeline 9地点・ghost 3地点。現在位置はBackFlowの結果1 | scenarios/module-ghost-gui.scenario.json |
| 新しいGUIに実ファイル読込 | 5 dispatch・1 seek照合、現在まで6地点＋後の履歴3地点。a::Homeと3表示を復元 | browser/ghost-loaded.txt |
| 読込地点から別操作 | b::NoticeのCloseを選択。a::NoticeとControllerは残り、bだけ消える。後の3地点は文章のみになり閲覧・再開不可 | browser/branched-before-save.txt・png |
| GUI再保存の実体を回収 | 6 dispatch＋1 seek、timeline 7地点・ghost 0。元のReturnAや途中結果はjournalの文章に残る | scenarios/module-branched-gui.scenario.json |
| 保存物2件を別CLI processで再生 | どちらもexit0。現在地、overlay、timeline、cursor、再exportのfinal digestが元GUI保存物と一致 | evidence/cli-replay/results.jsonと各responses.jsonl |
| 再開後にさらに継続 | 分岐版の再生後、新しいactionsからHideAを選ぶ。a::Noticeだけ消えControllerが残り、再保存 | evidence/cli-replay/module-branched-gui/continued.scenario.json |

上表のbrowser/は evidence/browser/。保存前に消した経路もjournalに残る契約を確認した。CLIはGUIと共通エンジンだが、module単位のshow/hideと未実行の残り結果を自動適用しない期待は公開契約と模型から先に定めた。全境界・全模型の保証ではない。

## 未回収の過去ファイル

利用者が候補として示したZIP（SHA256 `ffc313aef2c9caf113e95d99f6a61383a2fa612c1ad729d6034355e2247cf362`）を直接確認した。含まれるscenarioは r2の15 step、r2_1の38/14 step、保守版の38/22 step。READMEも38操作のGUI保存物と別読者の48操作地点は別物、保守版38操作はCLI記録と明記している。

Downloads直下のscenarioのmodelIdも元模型と照合したが、48操作／11操作に対応するものは見つからなかった。原評価のブラウザー内だけに残ったのか、別の場所に保存されたのかは未確認。新しいGUI往復の成功で、その古い2件を回収済みとはしない。保存先か元の評価環境の資料が必要である。

## 人による利用評価

人向け評価の見学予約画面を準備し、HTMLと既存scenarioだけの段階で、経緯と現在状態の説明、次の操作と再保存、迷った情報を利用者に依頼した。回答・保存実体の検証が揃うまでは未完了。利用者は既存の評価結果の一部を既に見ているため、完全な初見・盲検とは呼ばない。

#27/#35の正式受取全体には、その後のモデル一式を受け取って再生成・一箇所の要件変更を試す工程もある。#44のCLI handle再取得・転記負担、途中分岐理由の案内の効果も、AIや同じ人の一度の成功から一般化せず別に記録する。

## 判断と検証の範囲

今回の技術的な未確認経路では新しい製品不具合は見つからず、前回の「機能追加を増やさず実利用を続ける」判断を維持する。製品・SPEC・既存ガイド・前回証拠は無変更。固定版でinstall/build成功、実GUI往復と別processの公開CLI照合を実施した。前回の898テストを今回再実行したとは主張しない。
