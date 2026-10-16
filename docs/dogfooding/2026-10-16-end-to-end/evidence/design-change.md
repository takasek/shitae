# 一件の要件変更（操作前の期待）
Sol案の比較取消後、編集を続ける目的に合わせてソース単独表示に戻す。通知とConflict状態は残す。初回操作でSplit全体が再表示されたことから選んだ設計比較で、製品の不具合修正ではない。
原本は models/sol-original/proposed.shitae（全bytes一致）、派生は models/sol-source-cancel/proposed.shitae。変更はKeepEditingの一行へ goto(Workspace##Source) を挿入するだけ。
旧scenarioは同じmodule名でもsource hash/modelIdが異なるため拒否される期待。元モデルへ戻せば再開できる。新案ではConflict→Review→KeepEditingの3操作を手で選び直し、Source、通知あり、DocumentStatus=Conflictを確認して再保存する。条件の自動移行はしない。
