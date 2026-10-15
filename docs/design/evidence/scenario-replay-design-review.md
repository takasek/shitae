# #11 保存・再生設計の独立レビュー

2026-10-15。[設計案](../scenario-replay-contract.md) の文書レビュー記録。調査基準は `da4457a229aba9a80004fae0e611f68d7827ef56`、作業branchは `codex/issue-11-replay-design`。productionコード・モデル・既存受入記録は変更していない。

## レビュー条件

実装会話を引き継がない別agent `review_replay_contract` に、要求と設計案、Session・metadata・engine生成・CLI loader/protocol・ADR-0023・既存契約/受入記録の一次資料を渡した。依頼範囲は契約内部の矛盾、再現不能条件、照合抜け、scope超過。編集・commit・push・外部書込みを禁止した。

## 指摘と再確認

P2が一件。metadataのmodelIdはmodule順に整列して作る一方、StateViewのcomponentValues/sharedVariants/testVariants/gateTargetsはdocumentsのMap挿入順に依存する。同じモデルを逆順Mapで準備すると、モデル照合を通過しても初期digestで拒否され得る。

親側でも `packages/session/src/model.ts` のmanifest整列と `packages/session/src/index.ts` のallComponentValues・gateTargets・projectStateを確認した。設計に集合配列とmanifestの整列・重複キー拒否を追記し、意味を持つtimeline/stack/配置/操作順と区別した。受入R02にもMap順反例を追加した。

併せて、観測参照の例をresultIndexと混同しない表現へ修正し、ghostの所有者をSessionとした。manifestからfileを除くこと、reset前のeffect/診断を保持するoutput本体とdigest、receiptがないreset/seekのoutput:null、SPECに基づく独立期待を明記した。

同じreviewerが最終本文全体を読戻し、取得済み一次資料と再照合した。P2解消、残るactionable findingなし。descriptor/branch、手動試験、seek/resetとghost参照失効、失敗Sessionの隔離について、既存コードとの設計上の不整合なしという判断だった。

## 検証と限界

設計本文と本記録の相対リンク、末尾改行・余分な空白、受入表の11項目を機械確認し、Gitの差分検査と本文読戻しを行った。新しい保存schemaや再生APIを実装・実行した検証ではない。依存準備・build・productionテスト・別process再生・実ブラウザ操作は実施していない。R01–R11はこれからの実装受入条件であり、通過済みとはしない。

#12の完了整理は、GitHubのPR #20マージ・#18 completedと、版固定の既存受入/実ブラウザ/独立レビュー記録を照合したもの。#12本文へ根拠を追記し、completedでclose後に読戻した。今回新たにブラウザ受入を実行したとは扱わない。
