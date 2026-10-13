# 検証と証拠の範囲

## 評価時の観察（2026-10-13）

| 評価者 | 観察した経路 | 証拠と限界 |
| --- | --- | --- |
| Astra | Aを編集・保存[成功]しBへ切替・編集、図中心→並列、外部変更確認→取消、正規化結果を閉じる、timeline巻戻し | [レポート](astra/report.md)のsimulator画像・表示記録。保存した画像は最後のコマンド名調整前。実ファイル処理や実フォーカスは証明しない |
| Sol | Split→Source→Diagram→Split、Conflict→Review→KeepEditing、NoDocument、current/proposedの診断・復帰、Error中member gate offと復帰後の操作 | [レポート](sol/shitae-payoff.md)のsimulator画像。通知が比較中に残る初版をhide追加で修正。PFDSL製品の同じ不具合を示す証拠ではない |
| Sol recovery | 静的検査・HTML/図生成 | ブラウザで復旧全経路やnative保存成立を確認したモデルではない |

作者の裸goto(##variant)の誤解、初版モデルの診断表示欠落、alias参照の代替は最終モデルで修正した。check成功だけでモデルと実装の一致を認定しない。Astraの2文書・Solの1代表文書をsingletonで表したのは有限例で、動的インスタンス設計の証明ではない。

原評価はそれぞれ一次コード・実画面を見てモデルを作成し、成果物を独立レビューしたもの。保存作業ではnative/webを再操作しておらず、下記の検証を追加した。原評価の所要時間、学習負担、操作成績、shitaeなしの対照群は測定していない。

## 保存作業の再検証

指定shitae版 `a3ebaedbd5d452c99093a949bbaf94508da43ab4` を起点に、固定lockfileでinstall・全package buildを実施した。[機械可読結果](evidence/validation.json)、[再実行入口](verify.py)、[限定VM probe](runtime-probes.mjs)、[ソース台帳](evidence/source-manifest.json)を保存する。

| 検査 | 結果 | 証明する範囲 |
| --- | --- | --- |
| 6保存モデル＋alias最小例のcheck | 全7本exit 0、error 0。Astra3本/aliasはwarning 0。SolはW103が30・31・9件（計70） | 構文と静的診断。空の葉を意図して保持 |
| Mermaid再生成 | 全7本exit 0、保存済み6本は元ファイルとバイト一致 | 遷移図テキストの再現。setや表示階層の完全な図ではない |
| 通常ファイルへのsimulate | 全7本exit 0、HTML終端あり、UTF-8読取、全埋込みJSの構文exit 0 | 完全な生成物。ブラウザでの全経路受入ではない |
| pipe捕捉 | Sol currentで3/3回exit 0、65,536 bytes、終端なし。通常ファイルは137,755 bytes | macOSのcapture_output経路の再現。早期exitの因果や他OSは未確定 |
| inline最小例 | VMの描画結果でinline群は名前のみ、名前付き群はNew/Save/Formatを表示 | 指定生成JSでの要素欠落。新しいブラウザ観察ではない |
| alias member gate最小例 | Readyではalias/nameともon。Errorではalias on/name off。Readyへ戻すと両方on。未定義Missingは常にon | 同じbody内で定義済みaliasが未定義扱いになる差。正常な未定義fallbackを対照に保持 |

VMはrepoのテストと同じ最小DOMスタブ方式で、生成JSの特定関数を実行した。描画・gateの限定観察であり、イベント到達性、アクセシビリティ、OSやブラウザの品質を保証しない。因果を確定する製品修正・TDDは今回行わない。

installではesbuildのbuild script無視の通知があったが、全package buildとモデル生成は成功した。[保存内容の独立レビュー](independent-review.md)では修正必須の不整合なし。固定URLの置換は公開前/公開後に別途照合する。

公開前に文書リンク・JSON/補助スクリプト構文・出典SHA256を確認した。通常の差分空白検査は、原生成物のastra/models/inline-repro.mmd末尾空行1件だけを検出する。元成果物とCLI再生成のバイト同一性を優先して保持し、同ファイル以外の差分空白検査は通過した。PFDSLの4固定commit URLはGitHub contents APIで読戻し確認した。
