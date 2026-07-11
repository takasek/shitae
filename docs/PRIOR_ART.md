# shitae — 先行技術と位置づけ（Prior Art）

shitae の概念の多くは新規ではない。画面・表示要素・インタラクション・遷移という分節は、UI 記述において繰り返し再発見されてきた構造である。この文書は、shitae が依拠・参照する先行技術を整理し、shitae との差分を記録する。

要約すると、shitae の構成要素（UI の概念、LLM 向けの設計原理、ナビゲーションの語彙、テキスト作図、UX フロー記述）はいずれも既存技術に対応物がある。一方で、それらを「コード生成ではなくラフスケッチ」「ビジュアルではなくテキスト」「LLM の出力先ではなく人間と AI の協働の媒体」という方向で組み合わせた例は、調査の範囲では見当たらなかった。

---

## 全体比較

各系譜を主要な観点で並べる（`—` は、その観点がその系譜の関心事ではなく評価が当てはまらないことを示す）。

| 観点 | shitae | A. IFML系 | B. LLM向けDSL | C. 実装ナビ | D. 作図DSL | E. UXツール |
|---|---|---|---|---|---|---|
| 代表例 | — | IFML, BESSER | Anka, grammar prompting, DSL Assistant | GoRouter, Expo | Mermaid, D2 | FlowMapp, Overflow |
| 一次形式 | テキスト | ビジュアル＋メタモデル | テキスト | コード（API） | テキスト | ビジュアルGUI |
| git 管理 | 前提 | XMI/モデル | 可 | コードの一部 | 可 | 不可 |
| 主目的 | AI と協働する下絵 | コード生成 | LLM にコードを書かせる | アプリ実装 | 作図 | UX フロー可視化 |
| UI遷移の語彙 | あり | あり | なし | あり | なし | あり |
| 表示要素の概念 | あり | あり | なし | なし | なし | 限定的 |
| ラフさ/穴を許容 | 中核 | 不可（形式仕様） | 不可 | — | 一部 | 一部 |
| 人間とAIの協働 | 中核 | 認識補助のみ(BESSER) | LLMが書く側 | なし | なし | なし |
| レイアウト/スタイル | 持たない | 持つ(BESSER) | — | — | 一部 | 持つ |
| コード生成 | しない | する | する | — | しない | しない |
| 形式検証 | しない | する(PCN) | — | — | しない | しない |

shitae の列を縦に読むと、「テキスト・git 前提・UI 遷移と表示要素の語彙を持つ・ラフさと AI 協働が中核・コード生成と形式検証はしない」という組み合わせになる。各行を単独で満たす既存技術はあるが、この組み合わせ全体に一致するものは、上の表のいずれの系譜にもない。

---

## 5 つの系譜

### A. UI フロー記述・モデリング

WebML（2000 年代, Politecnico di Milano）→ IFML（2013, OMG 標準）→ ASL（2014）→ IFMLEdit.org（2017）→ BESSER / B-UML（2023–2026, Luxembourg Institute of Science and Technology）。

UI の構造と遷移をプラットフォーム非依存に記述する系譜。**IFML** の概念は shitae と対応が深い。

| shitae | IFML |
|---|---|
| component（`#`） | ViewContainer（ネスト可） |
| 表示要素 | ViewComponent（Details / List / Form） |
| 集合（`*`） | List |
| 行動 | Event |
| 遷移 | Interaction flow |
| 副作用 | Action |
| モジュール（`import` / `::`） | Modularization |

「UI フローを component / 要素 / event / flow で構造化する」という分節は IFML が、遡れば WebML が確立済みであり、shitae の独自の着想ではない。

ただしこの系譜の目的は一貫して **Model-Driven Development（モデルからアプリを生成すること）** であり、網羅性・形式性・型・レイアウトを足す方向に進化している。

- IFML は MOF メタモデル・UML プロファイル・XMI を持ち、一次的な構文はビジュアル（図）。ツールは Enterprise Architect、WebRatio、Eclipse。
- IFML は front-end の形式仕様を目的とし、Petri Net 変種（PCN）へのマッピングで到達不能状態・競合状態を形式検証する（IFMLEdit.org）。
- 最新の後継 **BESSER / B-UML** は IFML 由来の GUI メタモデルを持ち、LLM を統合する。ただし LLM の用途は「モックアップから正確なモデルを起こしてコードを生成する」ことである。GUI モデルは Button・InputField・Form・Menu・Chart 等の組み込みコンポーネント型、LayoutType・Position・Size・Style 等のレイアウトとスタイルを持つ（React / Django / Flutter のコード生成のため）。

BESSER が持つ要素（組み込み型・レイアウト・スタイル・コード生成・形式検証）は、shitae が持たないと決めた要素とほぼ一致する。系譜 A は網羅性のためにこれらを足し、shitae は速さのために持たない。

### B. LLM のために設計された DSL

grammar prompting（2023, MIT 系）、DSL Assistant（2024）、Anka（2025）。

「LLM が読み書きする前提で記法を設計する」問題意識は 2024–2025 に複数立ち上がった。最も近い **Anka**（2025, arXiv）は、設計原理を shitae と共有する——「従来の DSL が人間のエルゴノミクスを優先するのに対し、Anka は LLM のエラーを減らす特徴（明示的な命名、冗長なキーワード、正準形）を優先する」。仮説は「LLM のエラーは汎用言語の柔軟性に起因する（複数の有効な書き方を許し、暗黙の状態管理を要求するため）」。

shitae で行った判断（構文のゆらぎを削る、一つの意図に一つの書き方、未定を自然文に一本化、`*` の前置で曖昧性を排除）は、この原理と同型である。

差分は 2 点。これらは LLM が「書く」道具であり（Anka はデータ変換パイプラインを LLM に書かせる DSL で、人間の可読性は犠牲にしてよいとされる）、また UI を扱わない（Anka はデータ変換、grammar prompting は semantic parsing・PDDL・分子記述）。

### C. 実装フレームワークのナビゲーション

Flutter Navigator / GoRouter、React Navigation / Expo Router、SwiftUI NavigationStack。

shitae の transition verb は実装フレームワークのナビゲーション概念と一致する。

- `push` / `back` … stack の push / pop。
- `goto`（積まない置き換え）… GoRouter の `go`（対象へジャンプして前のルートを破棄。`push` は上に積む）と同じ区別。
- `present`（モーダル）… Expo Router の `presentation: modal`。
- `back(@S)`（特定地点まで）… Flutter の `popUntil` / `pushAndRemoveUntil`。
- セッションの begin 地点 … Expo Router の "anchor"（アンカーがないとモーダル背後の画面が失われる、という説明は shitae の `present(ホーム, @loggedIn)` の begin 地点と同概念）。

shitae はこれらの実装語彙を設計層に引き上げたもので、トランスパイルしやすさにもつながる。

### D. 汎用の作図 DSL

Mermaid、PlantUML（Salt）、Graphviz、D2（2022 OSS 化）。

「テキストを図に変換し git で管理する」点は共有するが、いずれも汎用作図言語で、画面遷移特有の語彙（画面・表示要素・インタラクション・遷移）を持たない。すべてをノードとエッジのラベルに収めることになり、表示要素とインタラクションが構造として分離されない。shitae の競合ではなく出力先候補（shitae → Mermaid / D2 へのトランスパイル）。

### E. UX フロー記述の実務ツール

FlowMapp、Overflow.io、Sketch.systems、code2flow。

UX フローの可視化と共有を目的とするデザイナー向けツール群。目的は重なるが、ほぼすべてビジュアル / GUI ツールであり、テキスト DSL を git で管理するものではない。code2flow は擬似コード起点だが汎用フローチャート生成で、UI・遷移に特化していない。

---

## shitae の位置

shitae は上記 5 領域の交点にある。

- A から：UI フローの概念（component / 要素 / event / flow）
- B から：LLM 協働の設計原理（明示・正準形・曖昧性の排除）
- C から：ナビゲーションの語彙（push / back / goto / present）と、セッションの begin 地点（Expo Router の anchor に相当する概念）
- D へ：出力先（Mermaid / D2 / XState へトランスパイル）
- E と：目的（UX フローの記述）を、テキスト・git・AI 協働で満たす

5 領域に共通して欠けているのが、shitae が中核に置く 3 点である。

1. **ラフさを許容する。** 未定・穴・自然文を許し、厳密な検証で弾かず警告にとどめる。系譜 A は形式仕様を目的とするため、この点で逆を向く。
2. **人間と AI の協働の媒体である。** 系譜 B が「LLM が書く道具」であるのに対し、shitae は人間が書き AI が補い人間が直す。人間の可読性と LLM の生成性の両立を狙う（自然文を許しつつ構文は絞る）。
3. **コードを生成しない下絵である。** 終着点は動くアプリではなくラフな設計を AI と往復で育てること。Mermaid / XState へのトランスパイルは可視化のためで、コード生成・形式検証は行わない。

---

## shitae が意図的に持たないもの

先行技術が網羅性・厳密性・コード生成のために持つが、shitae が持たないもの。

- コード生成（系譜 A の目的）
- 形式検証・状態機械（IFML → PCN、XState）。状態は variant の列挙で表し、遷移のガード（式を評価して可否を制御する仕組み）を持たない。操作の可否は variant の構造で決まり（対象が存在する variant でのみ成立）、分岐（`[成功]` 等）は評価せず注記に留めて選択は外部に委ねる。
- レイアウト・見た目・寸法・スタイル（BESSER、Figma）
- 組み込みコンポーネント型（BESSER の Button / InputField / Form …）。すべての名前は対等。
- 型・プロパティ・引数・データフロー（IFML の Parameter binding / Data flow）
- コンテキスト認識・形式制約（IFML の context awareness / OCL）
- ビジュアル編集（系譜 A・E のツール）。一次的な形式はテキスト、図はトランスパイル結果。

---

## 結論

UI フローの分節は IFML 系、LLM 向けの設計原理は Anka 系、ナビゲーションの語彙は GoRouter 系が先行して確立しており、shitae はそれらを独立に再発見して組み合わせた。系譜 A がコード生成へ向けて要素を足してきたのに対し、shitae は要素を持たない方向を取る。系譜 B が 2025 年に立ち上げた「LLM のための言語設計」を UI 遷移とラフスケッチに適用した例は、調査の範囲では見当たらない。

個々の構成要素は既存であり、新規性は組み合わせ方と適用方向にある。

---

## 参照

- IFML: https://www.ifml.org / OMG IFML Specification
- WebML: Ceri, Fraternali et al., *Designing Data-Intensive Web Applications*（2002）
- IFMLEdit.org: online MDD tool for IFML（IEEE/ACM, 2017）
- BESSER / B-UML: https://besser.readthedocs.io （Luxembourg Institute of Science and Technology, 2023–）
- ASL: ITLingo RSL と IFML を組み合わせた controlled natural language（2014）
- Anka: *A Domain-Specific Language for Reliable LLM Code Generation*（arXiv, 2025）
- Grammar prompting: Wang et al., *Grammar Prompting for Domain-Specific Language Generation with LLMs*（NeurIPS, 2023）
- GoRouter: Flutter declarative routing（`go` vs `push`）
- Expo Router: anchor / modal presentation
- D2: https://d2lang.com （Terrastruct, 2022）
- uiflow: hirokidaichi/uiflow（shitae の出発点となった記法）
