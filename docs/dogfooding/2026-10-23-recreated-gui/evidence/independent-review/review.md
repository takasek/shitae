# 独立レビュー

重要な指摘なし。記録本文・同梱説明・公開保存契約に対して、対象範囲の主張を裏づける一次資料と再実行結果を確認した。

## 実行した検証

- 受領ZIPのSHA-256 `4cc3c5a624e554c25d332e5906e1741a1d5106e8a0084c809624863e5026f8d7` とmanifestが一致。全28ファイルをZIPメンバーから直接読み、保存コピーとのbytes一致およびmanifest各ハッシュを確認した。
- 22モデルと2HTMLを既存の2026-10-23-end-to-end/source-pack/workshopの対応版と直接比較し、全件bytes一致。
- 原版scenarioの先頭38stepを以前のhandoff-38-gui.scenario.jsonと直接比較し、command/afterDigest/outputDigestが全件一致。
- 全59stepのsource module/lineを入力モデルに対応させ、OPERATIONS-ja.mdの操作名と分岐（原版22 accepted、28 rejected、保守版9 rejected）に一致することを確認。
- 旧版checkoutのHEADが0e49fc7e8bebf9b49c4533c2532ec0ee32037ad5、git statusがcleanであることを確認。提供されたbuild済の公開CLIを各scenarioについて別processで起動。
- 検証scriptを読んで公開query/dispatch/exportScenarioのみを使うことを確認し、別の出力先replay/で再実行。48/11dispatchの再生、全JSON再export一致、期待location・共有値・overlay・継続を確認。両processともexit0。
- 現行CLIでは両scenarioともexit1、stdout空、ENGINE_MISMATCH。
- 新たに得たresults.jsonと、両scenarioの再export/継続保存物は記録済の対応結果と構造的に全体一致。

## 限界

GUIで実行・download回収したとの経緯は提供者のREADMEによる申告であり、今回こちらがGUI操作を再実行した証拠ではない。再作成ファイルの保全・CLI再生が検証対象である。当時の旧GUI原物を回収した証明やbytes同一性の証明にはならない。原版/保守版の有限の経路と継続各1操作を確認したもので、全状態の同値やすべての戻り先・通知寿命を保証しない。READMEはこれらの区別を明記している。

出力: static-results.json、operation-lines.txt、replay/results.json、replay配下の全要求応答・再export・継続保存物。
