# 保存済みモデルの操作前の問いと予想

操作前に、モデル本文と SPEC の一般規則（singleton の共有、switch によるスタック保持、present/dismiss の寿命、result の実行順）から立てた。処理系のソースは読んでいない。

## Astra proposed（docs/dogfooding/2026-10-13-standalone/astra/models/proposed.shitae）

経路: 開く(開始ボタン) → 編集 → 切替(B) → 編集 → 切替(A) → 保存[外部変更] → 外部変更確認 → 取込(UseDisk)[再確認一致]。

| 問い | 予想 | 根拠 |
| --- | --- | --- |
| Q1 A を編集して B へ切り替え、B を編集して A へ戻ると、保存状態はどこに属するか | 状態A=未保存、状態B=未保存のまま。A に戻っても B の未保存は消えない | 状態A/状態B は別 singleton（proposed.shitae:50-64）、switch は各タブを保持 |
| Q2 保存[外部変更]→外部変更確認で何が見えるか | 状態A=外部変更（Changed on disk・Review・SaveCopy）、比較が overlay で開く | proposed.shitae:24,27,55-58 |
| Q3 取込(UseDisk)[再確認一致] の結果の途中はどう見えるか | 結果1は自由文 effect で状態を変えない。結果2で状態A=保存済になるが比較はまだ開いている。結果3で比較が閉じる | proposed.shitae:92。result は書いた順に実行される |
| Q4 結果2の直後（保存済・比較が開いたまま）へ操作位置を移し、取消(KeepEditing) を選ぶと何が残るか | 状態A=保存済のまま比較が閉じる。後の dismiss は ghost から破棄に変わる。モデル上は「取込で保存済になったが、置換を取り消した」ように読める中間状態が作れてしまう | result の観測点は実装上の原子性を表さない |
| Q5 文書A を表示中に GUI の読込要約は状態B を含むか | 含まない（文書A の root が参照しない）。画面外の状態B は CLI の state 照会で確かめる案内が出る | docs/design/gui-history-contract.md「読込要約と画面外の状態」 |
| Q6 GUI で履歴の画面を見るだけで、操作位置・保存内容が変わるか | 変わらない。「この時点から続ける…」の確認後だけ位置が変わる | gui-history-contract.md「閲覧と再開」 |

## Sol recovery（docs/dogfooding/2026-10-13-standalone/sol/models/recovery.shitae）

経路: ExternalChange → ReviewAndSaveHere → ChooseAnotherFile[ExistingDifferentTarget] → ChangedAgain[NewRevision] → SaveAs[Cancelled]。前回は CLI でのみ確認された復旧経路を、実ブラウザで追う。

| 問い | 予想 | 根拠 |
| --- | --- | --- |
| S1 上書き確認から別の既存ファイルを選ぶと、確認画面は何枚重なるか | dismiss の後に present するので OverwriteReview は 1 枚のまま、下は Conflict | recovery.shitae:25、SPEC の present/dismiss |
| S2 確認中にディスクが再変更されたら、どこへ戻るか | 確認画面が閉じて Conflict に戻る。Editing には戻らない（保存も採用もしていない） | recovery.shitae:27 |
| S3 SaveAs[Cancelled] で何が変わるか | 画面は Conflict のまま。自由文 effect が記録されるだけで遷移はない | recovery.shitae:16 |
