# #44 人がCLIで操作するときの負担を確かめる

利用者の判断で人による評価は保留。実施前の課題として保存する。AI用のCLI利用評価は別記録へ分け、AIによる実行を人の利用結果へ換算しない。GUIの受取評価とは別の課題であり、実施をまとめて依頼しない。

## 課題

端末で次を実行し、同じprocessを開いたまま、操作の照会と実行を3回程度続ける。架空の試験用カードで実通信・実保存はしない。

```sh
cd /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae
node packages/cli/dist/index.js session docs/design/session-fixtures/trial-values.shitae
```

1. `{"id":"q1","command":"query","select":["actions"]}` を入力し、有効な操作を一つ選ぶ。
2. その応答のhandleをコピーし、`{"id":"d1","command":"dispatch","handle":"ここに応答のhandleを入れる"}` を入力する。分岐がある場合は応答にあるbranch IDも指定する。
3. 受理されたら `q2` / `d2` のように新しいidで再照会し、その時点のhandleを使って次を実行する。前のhandleを意図的に使う試験は不要。
4. Ctrl-Dでprocessを終了する。

## 記録すること

- 実際に選んだ操作名と回数。
- handleを写すための再照会・コピー・手入力の手間、迷った箇所。
- 意図しない入力誤り、拒否、やり直し、追加質問があればその内容。
- 操作名や短い番号で選べれば十分か、別の不足があるか。

成功速度や改善率を推測しない。回答が無い項目は未測定とする。画面の理解・操作実行・転記負担を区別する。受取課題と同じ人が順に試す場合、説明を読んだ経験の影響を残す。
