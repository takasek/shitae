<!-- 評価時メモの公開保存版。リンクと保存状況のみ調整。 -->

# shitae の実使用から得た改善候補

優先したいのは生成結果を確実に受け取れることと、試行の記録を再現できること。
レイアウト・寸法・条件式を言語に追加する提案はしない。
以下は評価時のローカルメモを保存したもの。起票状況は[候補対応表](../candidates.md)を参照。採用決定や製品コードの修正は今回の範囲に含めない。

## 1 出力完了を待ってCLIを終了する

種類は既存機能の不具合修正候補で、優先度は高い。
simulateのstdoutをpipeで捕捉した3回すべてで、exit 0だが65,536 bytes、HTML終端なしになった。
同じモデルを通常ファイルへ直接出した出力は完全で、終端とJS構文を確認できた。
[今回の再検証](../evidence/validation.json)と[再実行手順](../README.md)を参照。原ローカル成果物も保持している。

指定版の [CLI 127〜128行](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/packages/cli/src/index.ts#L127) はprocess.stdout.writeの直後にprocess.exit(0)を呼ぶ。
pipe出力が完了する前の終了が原因候補である。
ファイルへ直接出す使い方は利用できるが、pipeでの利用を禁止する設計意図は仕様で確認できなかった。
修正案は出力の完了を待つ、または自然終了を使うこと。
受入条件は、ファイルとpipeのバイト列が一致し、stdoutを低速で読む場合も完全なHTMLを得ること。

## 2 シナリオを保存し再生する

種類はsimulatorまたはCLIの補助機能で、優先度は中程度。
復旧通知を開く、比較を開く、キャンセルする、最後の文書を閉じる試行を、現状は画面・DOM・手順の記録でしか引き継げなかった。

既存の統合ログと巻戻しは実際に表示され、 [simulator 286行付近](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/packages/simulator/src/simulator.ts#L286) に実装されている。
「設定を保存」は [buildSimConfigJson](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/packages/simulator/src/simulator.ts#L1375) でgraph.splitだけを保存し、操作列を保存しない。
したがってログや巻戻しそのものの新設ではなく、操作・分岐選択・手動variant切替・モデルhashをJSONとしてexport/importする案とする。
未知の条件を自動推定せず、condition labelを手で選んだ事実を記録する。
初版は再生と最終表示の照合に限定し、存在／不在や戻り先の期待を別のシナリオファイルで指定する拡張を検討する。
モデルが変わった場合には再生不一致を伝え、古い操作を黙って別の行へ結び直さない。

## 3 包含階層に解決後の部品とvariantを表示する

種類はsimulatorの任意のデバッグ表示で、優先度は中程度。
proposalでDocumentStatusの状態を切り替えた後も、包含階層にはstatusとstateというaliasだけが表示され、現在のvariantをその場で照合しづらかった。
統合ログにはsetが出るが、部品の現在の状態を別の場所で推測する必要がある。

既存の包含階層は [renderElementNode](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/packages/simulator/src/simulator.ts#L881) にあり、member gateのバッジとvariant selectも [renderGateInlineControls](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/packages/simulator/src/simulator.ts#L783) にある。
不足は、gate対象以外の入れ子部品にも解決後のcomponent名、現在variant、singletonかどうかを任意表示すること。
初期表示を複雑にせず、検討者用の切替で見られる案とする。
これは一般インスタンスへ任意の共有状態を導入する提案ではない。

## 4 AIガイドにsingletonとsetを案内する

種類は文書の補完で、優先度は中程度。
最初に読んだAI_GUIDEには、指定版のSPECに存在する `#!` と `set` の説明がなかった。
GlobalMessageや代表文書の状態を画面遷移なしで変える記述で、SPECを探す必要があった。
[SPECのsingleton節](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/docs/SPEC.md#L302) が正本であることを保ち、AI_GUIDEには短い入口と注意点を追加する。
一つの代表文書をsingletonにしたモデルを、複数文書の共有状態設計と誤認しない例も有用である。
新しい状態管理の機能を要求するものではない。

## 5 意図した空の末端部品を識別できる診断補助

種類はcheckerの利用補助の候補で、優先度は低い。
三つの最終モデルに計70件のW103が出て、すべて空の末端部品だった。
未定義参照を許すラフさや、空bodyを警告する既存の設計は保つ。
言語へleaf型やプロパティ定義を持ち込む前に、外部の検査設定で承知した警告をモデルhash・行番号と共に記録し、新しい警告と区別する方法を検討する。
globでW103を一律非表示にすると本当の記述漏れも隠すため、初期案にはしない。
小さな検討モデルで未定義の葉を使う運用の方がよい場合もあり、実例を増やしてから機能化を判断する。

## 6 包含部品のaliasを使うmember gateの解決

種類はsimulatorの仕様・実装の不一致候補で、優先度は高い。
今回のモデルでは `diagram: DiagramView` と置き、同じbodyに `NodeDoubleClick(diagram.graph?)` を記述したが、図のError状態でもgateがalways-onになった。
独立レビューで指定版の生成JSを実行し、未解決のtargetComponentがdiagramとなり、図の不在を見ずに操作が有効になることを確認した。
最終モデルでは `DiagramView.graph?` と実在component名で参照し、Error中のgate off、復帰後の操作成立をブラウザと生成JSで確認した。

[SPEC 118〜122行](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/docs/SPEC.md#L118) は包含部品をインスタンスと要素aliasで参照でき、aliasを優先して解決すると記す。
presence gateも解決先インスタンスの実効bodyを判定する意図である。
一方、[extract 287行](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/packages/simulator/src/extract.ts#L287) は参照名をtargetComponentへそのまま入れ、[simulator 439〜440行](https://github.com/takasek/shitae/blob/a3ebaedbd5d452c99093a949bbaf94508da43ab4/packages/simulator/src/simulator.ts#L439) は未定義ならtrueにする。
未定義のラフな部品のalways-onは仕様にあるので、その振る舞い全体を厳格化する案ではない。
定義済みaliasは適切なcomponentへ解決し、未定義の参照と区別する修正候補である。
受入条件は、同じbodyのaliasとcomponent名の参照が同じvariantで有効・利用不能となることと、ラフな未定義参照の既存挙動を保つこと。
今回の成果物は不一致候補の記録であり、上流の修正・採用判断は別作業とする。

## 今回は追加しないもの

包含関係、inline grouping、variant、presence gate、singleton、set、overlay、モーダルのpresent/dismiss、タブのswitchは既存機能である。
マップのvariant分割と統合、simconfig保存、統合ログと巻戻しも既存である。
これらを追加機能として重ねて提案しない。
寸法、色、文字スタイル、図の位置、ファイルのrevision、データの条件式はshitaeの境界の外へ置き、実画面、デザインツール、実装テストで扱う。
