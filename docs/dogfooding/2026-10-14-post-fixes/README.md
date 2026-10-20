# 修正後の再ドッグフーディング（2026-10-14）

対象は `takasek/shitae` main の **e985f4ee58ab76339df5b0f59144e1f1a5da91c8**。評価・記録のみ。製品、仕様、旧モデル・Mermaid・証拠を変更せず、commit・push・issue書込みを行っていない。

- [再評価レポート](report.md)
- [ブラウザ操作列・予測・実際・参照戻り](browser-paths.md)
- [機械検証](evidence/validation.json) / [モデル SHA256](models.md)
- [独立ガイド評価](guide-evaluation/report.md) / [独立再現の試行](guide-evaluation/replay.md)
- [原資料の保全台帳](evidence/original-sha256.json) / [最終保全確認](evidence/preservation.json)
- [今回追加したファイル](files.txt)

## 対象版と環境

primary は main だが `.agents/` と `.worktrees/` が未追跡だったため更新せず保持。origin fetch 後、固定 SHA から detached worktree を作成した。取得時 main の HEAD を固定しており、その後の origin の移動には追随していない。評価は `/private/tmp/shitae-post-fixes-20261014` で開始し、成果物を永続保存するため、checkout 全体を `/Users/m5/works/shitae/.worktrees/post-fixes-20261014` へ Git の worktree move で移した。実行ログに残る旧絶対パスは実行時の位置を示す。モデル・target SHA・生成物のバイト列は移動で変わらない。

| 修正 | 関連 PR / merge | 対象版への包含 |
| --- | --- | --- |
| #13 | [#15](https://github.com/takasek/shitae/pull/15) / `57e6deed5bd87fa39b8bc3a06839bdbacba81a78` | ガイド変更 `4b56240` が祖先 |
| #8 | [#16](https://github.com/takasek/shitae/pull/16) / `1487bbf6bde0cb38d32ed5e219f907050b74d487` | CLI変更 `9f47b1f` が祖先 |
| #10・#9 | [#17](https://github.com/takasek/shitae/pull/17) / `e985f4ee58ab76339df5b0f59144e1f1a5da91c8` | `e92e543` / `3844800` が祖先 |

GitHub の取得した本文・状態・PRメタデータは `evidence/issue-{8..13}.json` と `pr-{15..17}.json`。#8/#9/#10/#13 は CLOSED、#11/#12 は OPEN。重複照合には全状態一覧 `issues-all.json` を使った。

OS は macOS 27.0.1 arm64、Node v26.5.0、pnpm 10.33.2。lockfile SHA256 は `ae2f99eb35c4b144537e9087f3350d603892411d2be85c465f3d497007b8b8c1`。`pnpm install --frozen-lockfile` と全9 package build を新しい worktree で実施。古い dist/HTML をコピーしていない。ログは `evidence/install.log` と `build.log`。

主操作は **Codex In-app Browser**。自身が表示したUser-Agentは `Chrome/155.0.0.0`（縮約表記のためpatch版は未確認）。初回の制限された読取APIにはnavigatorがなかったため、評価用 `evidence/browser-version.html` をブラウザで開き、通常のDOM表示から取得した。ホスト ChatGPT.app は26.1007.30912 / build 20156。主操作画像は768×1034、環境確認用の別タブは1280×720だった。独立再現の試行は Google Chrome 155.0.8059.40。ブラウザの別方式・別OSへの一般化はしない。詳細は `evidence/environment.json`、`browser-user-agent.json` と独立再現記録。

## 再実行

この SHA の checkout に今回の記録ディレクトリを置き、root で実行する。

```sh
pnpm install --frozen-lockfile
pnpm build
python3 docs/dogfooding/2026-10-14-post-fixes/revalidate.py
python3 docs/dogfooding/2026-10-14-post-fixes/derive.py
python3 docs/dogfooding/2026-10-14-post-fixes/compare-replays.py
python3 -m http.server 8768 --bind 127.0.0.1 --directory docs/dogfooding/2026-10-14-post-fixes
```

ブラウザで `http://127.0.0.1:8768/generated/` の対象 HTML を開き、[操作列](browser-paths.md)を実行する。初期化はページ再読込。timeline の起動点への巻戻しも使えるが、完全な再実行では再読込を選んだ。

`revalidate.py` は旧 runner の check、Mermaid照合、通常ファイル生成、pipe 3回、UTF-8・終端・JS構文、旧限定VM probe を再利用する。出力は今回の `evidence/validation.json` と `generated/` のみ。評価 SHA を HEAD から取得して固定 SHA と照合し、pipe の**バイト一致**と修正後の gate/inline の期待値を assert する。旧 `verify.py` は実行していない。

`derive.py` は Sol proposed から回避策を外した alias 例と、状態説明だけを変更した比較例を作る。原本と派生 SHA、差分、目的、生成時の診断を `derived/` に残す。独立評価モデルはrootで次のコマンドを使って再生成する。過去の出力は `guide-evaluation/verification.json`、操作手順は `guide-evaluation/report.md` を参照。

```sh
node packages/cli/dist/index.js check docs/dogfooding/2026-10-14-post-fixes/guide-evaluation/initial.shitae
node packages/cli/dist/index.js check docs/dogfooding/2026-10-14-post-fixes/guide-evaluation/receiver-probe.shitae
node packages/cli/dist/index.js simulate docs/dogfooding/2026-10-14-post-fixes/guide-evaluation/initial.shitae > docs/dogfooding/2026-10-14-post-fixes/guide-evaluation/initial.html
node packages/cli/dist/index.js simulate docs/dogfooding/2026-10-14-post-fixes/guide-evaluation/receiver-probe.shitae > docs/dogfooding/2026-10-14-post-fixes/guide-evaluation/receiver-probe.html
```

負例の `ordinary-set-negative.shitae` と `singleton-collection-negative.shitae` も同じcheckコマンドで検査できる。期待する終了はexit 1、それぞれE030・E028であり、成功終了を期待しない。

保存 HTML は今回の固定版で生成した成果物。将来の再評価ではその版から再 build・再生成する。condition label は手動選択、自由記述 effect は意図の出力であり実処理を実行しない。

`compare-replays.py` は保存したブラウザDOM snapshotのmain節（遷移マップ以前）を、空白を正規化せず抽出して比較する。比較対象文字列とUTF-8 SHA256もJSONへ記録する。ブラウザ再操作の代わりではなく、既存の実操作記録の照合用。
