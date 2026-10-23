# 総合再評価の結果

#63〜#68 の修正後、元の反例・対照と今回選んだ組合せ経路では、新たな処理系の不具合・回帰を確認しなかった。AI が新しい題材を作成し、状態の寿命を検討し、モデル変更後に新規記録し、別の AI が操作列なしで受け取って継続する仕事は CLI で完遂した。GUI の通常保存→CLI 再生と、CLI 保存→GUI 読込、不一致拒否後の状態保持・継続も確認した。結果途中へ戻った GUI の再保存ファイルは未回収であり、この範囲を完遂とはしない。

## 1. 元の反例と対照

元パックの79ファイルの SHA256 を全件照合し一致。元の13例を変更せず、新版公開 CLI で再実行し **13/13 SPEC_PASS**。旧版で不一致だった19・20・38・49・50も成功し、8対照を維持した。[summary](evidence/minimal/summary.json) に終了値・E028・W106・現在地・共有値の期待と実際を保存した。これは全60プローブの再実行ではない。

overlay 別枠4例も成功した（[結果](evidence/overlay-results.json)）。54は未掲示 b の hide 後も a を保持。58は a::Controller の無修飾 hide が b::Notice を消さない。55は同fileの別 alias が一枚を指し HideX で消え、56は異名の Banner が残る。操作ごとの JSONL と最終 state は evidence/overlay-*。

実ブラウザーでは ShowA → HideB → Both → Again で a::Notice Ready と b::Notice Idle が共存し、aだけに Check(signal) が表示された。Controller の HideA 後は b と Controller が残り、BackFlow → ReturnA で a の ALabel の Home に戻った。[二枚の画面](evidence/browser/module-both.png)、[復帰時の表示](evidence/browser/module-return.txt)。素名を一意に変える回避策は不要だった。

## 2. 11 module の二予約模型

実行前の期待は #68 の契約と各模型の work/nav/booking 定義から定め、実行スクリプトの assertion に固定した。元の操作 descriptor を新 engine に移植せず、公開操作名を照会して新規記録した。

| 版・経路 | 期待と観測 | 証拠 |
| --- | --- | --- |
| r2：古い A 確認を残し、A を局所破棄、B を開始、古い確認を確定 | B の実作業は残るのに Bookings復帰 が B変更→通常へ戻る。旧反例を再現。模型の誤りであり runtime 回帰ではない | evidence/workshop-r2/before-stale-confirmation.json と after-stale-confirmation.json |
| r2_1 / refactor_candidate の同じ経路 | 確定操作は無効。拒否後も公開 state 全体が一致し、B変更を保持。その後 B に復帰できる | evidence/workshop-r2_1 と workshop-refactor_candidate、integrated-results.json |
| 両対策版：A を終了後、Rooms から新しい A を開始 | Bookings 用の古い確認は無効。Rooms の A、索引、行を保持 | evidence/*-other-origin、exploration-results.json |
| 両対策版：A を終了後、Bookings から新しい A を開始 | 古い確認から新しい A を破棄できる。進行A はなしになる。採用政策「現在の予約＋起点」に一致し、世代保護ではない | evidence/*-same-origin、exploration-results.json |

各版の新規 scenario は別 process で再生した。対策版と保守版では再開後に B の代替枠→レビュー→accepted を選び、予約B=代替枠、Bookings復帰=通常を確認して再保存した。旧反例の再生成功は、模型の不変条件の成功とは別である。

GUI へ対策版の新規14 dispatch記録を実ファイル選択で読込し、照合14件・Bの原枠・Bookings復帰 B変更が表示された。進行中タブへ戻ると古いA確定は無効で、`進行A / なし` と「画面上の可視性ではなく構造を判定」という理由が読めた。[読込](evidence/browser/workshop-loaded.txt)、[無効理由](evidence/browser/workshop-blocked.txt)、[画面](evidence/browser/workshop-blocked.png)。共通操作が先に長く並び、業務の本文は下方に置かれる構成も残る。これは作者の配置も寄与し、この結果だけで言語へ layout を追加する理由にはしない。

対策の効果は予約・起点の一致を検査する範囲で確認できた。一般の frame 生存 API や世代固定、索引自動同期の保証は得られない。固定経路の成功を全状態の同値証明にしない。

## 3. 保存・共有・変更後の再検討

GUI の module 模型を7操作の地点で実保存し、Downloads のファイル本体を回収した。別 CLI process の replay で a::Home を照合し、Close で b::Notice だけを消して再保存した。元 GUI のメモリ・handleを流用していない。[実保存](scenarios/module-gui.scenario.json)、[別 process の応答](evidence/module-gui-replay/responses.jsonl)。元パックの旧 engine scenario は exit1、stdout空、ENGINE_MISMATCH で拒否した（evidence/old-engine.stderr.txt）。照合を緩めていない。

別コンテキストの作者は見学予約の v1 を作成し、取消する案内方法を通常確認画面、確定予約を singleton に分けた。通知を追加した v2 でも、取消で入力だけを捨て、再入場は現地案内、確定予約は一覧へ戻っても残り、通知を閉じても予約済を保持した。v1=8 dispatch、v2=9 dispatch。両版 check 診断なし、HTML生成、同版別 process再生成功。v1をv2へ渡すとMODEL_MISMATCH（[作者報告](author/report.md)）。

独立受取担当には問い・期待・版と保存物の対応だけを渡し、作者の会話・操作列・補助 script は渡さなかった。受取側は検討内容、現在状態、入力を捨てた経路を説明し、v2へ9操作を追加して新しい18 dispatch記録を保存し、さらに別processで再生成功した。作者への追加質問なし。公開CLIの応答形式はsession-usageを参照した（[受取報告](recipient/assessment.md)、[照合](recipient/verification.json)）。全状態や分岐の初見理解、人間の理解度の証拠にはしない。

GUI でも新しい見学予約を一覧→詳細→確認→オンライン案内まで操作し、v1ファイルをv2へ読み込ませた。MODEL_MISMATCH後も記録3・オンライン案内・未予約・同じ履歴を保持し、取消→再入場で現地案内→確定→通知を閉じるまで続行できた。[拒否前](evidence/browser/visit-before-mismatch.txt)、[拒否後](evidence/browser/visit-mismatch.txt)、[最終](evidence/browser/visit-final.txt)。今回確認したのは source bytes 不一致の一経路であり、全読込失敗への一般化はしない。

## 4. 結果途中からの分岐と未回収物

module GUI の記録6 BackFlow を開き、結果1 push(a::Home) の「この時点から続ける…」で変更前後を確認し、確定した。画面は a::Home、現在まで8地点・後の履歴3地点となり、残る結果は自動実行されなかった。Close を選ぶと新しい点ができ、後の点は文章のみへ変わった（[ghost](evidence/browser/module-ghost.txt)、[別操作後](evidence/browser/module-branched.txt)）。これはテスト用に分岐して b へ進む残りの結果を実行しない位置を作ったもので、通常利用者の経路とは区別する。

途中の地点で再度「操作の再生ファイルを保存」を押し、GUIは作成通知を出したが、新しい実ファイルは回収できていない。初回の7操作ファイルしか取得できず、通知だけで保存成功と判定しなかった。保存ダイアログ確認のためのCodexネイティブアプリ取得はComputer Useの安全制約で拒否され、その経路は使用していない。内部SessionのexportやDOMへの注入に切り替えていない。したがって **ghostを含む実保存物の読込・別操作・再保存・再開は今回未確認**。操作上のghost/破棄表示は確認したが、別のCLI記録でこの不足を埋めない。

ファイル選択・初回保存のブラウザーツール呼出しには長い待機が発生した。製品側の読込速度とは切り分けられないため、性能不具合や改善率は主張しない。少なくともGUIの通常保存とCLI再生、CLI保存物のGUI読込、不一致読込後のSession保持は、この版で新規に確認できた。

## 5. 次の判断

当面は言語・保存基盤への機能追加を止め、現在の版で実利用を続ける。確認した修正は組合せ利用でも維持され、古い確認の問題は模型の同期責任と「現在の予約＋起点」政策で説明できた。新しいID・一般変数・条件式・自動索引同期・scenario移行を追加する証拠はない。

#69には、残るGUIのghost保存物を回収して別process再生する確認を残す。元レポートの48操作地点と保守版11操作地点のGUI実保存物は今回も回収していない。今回の新規経路をそれらと同一の証拠とは扱わない。#27/#35の人による正式評価、#44の人によるCLI負担、途中分岐の理由説明の効果は継続。#51は現在closedであり、古い修正バッチを再実装しない。

未確認は人間の初見作者・受取人、支援技術・キーボード・IME、Windows/Linux、file URL、元全60プローブ、二予約の全受入・全状態同値、一般の予約ID・世代固定・実通信と永続保存。今回の有限経路に新しい処理系不具合を見つけなかったことと、全範囲の正しさは分ける。
