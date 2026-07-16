import type {
  Diagnostic,
  Document,
  NavTarget,
  Overlay,
  Span,
  StateWrite,
  Transition,
} from '@shitae/ast';

// ──────────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────────

/** 画面位置。module=null は同一ファイル内 */
export interface Location {
  module: string | null;
  component: string;
  variant: string | null;
}

/** present/dismiss 由来（無名）は name=null */
export interface SessionMarker {
  name: string | null;
}

/** フレームの製法。root はエントリの無名フレームのみが持つ（SPEC「フレーム木」） */
export type FrameOrigin = 'root' | 'push' | 'present' | 'switch';

/**
 * フレーム木の1ノード。
 * stack は (component, variant) の列（下→上、最後が現在の姿）。
 * id は作成順序も兼ねる（switch resume-or-create・遠隔破棄の「最も新しいフレーム」判定に使う）。
 */
export interface Frame {
  id: number;
  parentId: number | null;
  stack: Location[];
  /** push→false / present・switch→true（back の壁）*/
  barrier: boolean;
  /** この遷移が begin したセッション（root フレームのみ null） */
  beginsSession: SessionMarker | null;
  origin: FrameOrigin;
}

/** runtime 実行状態。frames は木を平坦化したもの。activeFrameId は必ず frames 内に存在する。 */
export interface RuntimeState {
  frames: Frame[];
  activeFrameId: number;
  nextFrameId: number;
  /** 掲示中 component → 掲示エントリ。SPEC「オーバーレイ」ADR-0009。
   *  フレーム木の走査対象には入らない。ID は component 名が兼ねる。
   *  module は掲示時に解決した正準モジュール（singleton の共有解決に使う。ADR-0017） */
  overlays: ReadonlyMap<string, OverlayEntry>;
  /** singleton component キーの集合（`#!`。定義ファイル内で単一インスタンス）。SPEC「singleton component」ADR-0011/0013。
   *  キーは `singletonKey(module, name)` — module=null は素の name。 */
  singletons: ReadonlySet<string>;
  /** singleton の共有 variant レジストリ（singletonKey → 現在 variant。null は initial の含意）。
   *  singleton の variant は常にここへの参照であり、frame stack・overlays に snapshot を作らない（ADR-0011）。 */
  sharedVariants: ReadonlyMap<string, string | null>;
}

/** singleton の参照（ADR-0013: 共有スコープは定義ファイル＝モジュール単位） */
export interface SingletonRef {
  module: string | null;
  name: string;
}

/** 掲示エントリ（ADR-0009 の (component, 表示 variant) + ADR-0017 の module） */
export interface OverlayEntry {
  module: string | null;
  /** 表示 variant（null は initial の含意）。singleton は無視され共有レジストリが優先 */
  variant: string | null;
}

/** (module, component) → レジストリキー。module=null は素の name（従来キーと後方互換）。
 *  module 語彙（alias か ファイル名か）の正規化は呼び手の責任（ADR-0013 の実装詳細）。 */
export function singletonKey(module: string | null, name: string): string {
  return module == null ? name : `${module}\u0000${name}`;
}

export interface ReduceResult {
  state: RuntimeState;
  diagnostics: Diagnostic[];
}

// ──────────────────────────────────────────────────
// initialState
// ──────────────────────────────────────────────────

/** エントリ画面から初期状態を構築する。起点は呼び手が決める（SPEC 未規定）。
 *  singletons は singleton component の参照（文字列は module=null の name として扱う——後方互換）。 */
export function initialState(
  entry: Location,
  singletons: Iterable<string | SingletonRef> = []
): RuntimeState {
  const root: Frame = {
    id: 0,
    parentId: null,
    stack: [entry],
    barrier: false,
    beginsSession: null,
    origin: 'root',
  };
  const singletonSet = new Set(
    [...singletons].map((s) => (typeof s === 'string' ? s : singletonKey(s.module, s.name)))
  );
  const sharedVariants = new Map<string, string | null>();
  // entry 自身が singleton かつ variant 明示なら共有レジストリを seed する（ADR-0011）。
  const entryKey = singletonKey(entry.module, entry.component);
  if (singletonSet.has(entryKey) && entry.variant != null) {
    sharedVariants.set(entryKey, entry.variant);
  }
  return {
    frames: [root],
    activeFrameId: 0,
    nextFrameId: 1,
    overlays: new Map(),
    singletons: singletonSet,
    sharedVariants,
  };
}

/** 掲示中 component の表示 variant を返す（未掲示なら null。SPEC「オーバーレイ」ADR-0009）。
 *  singleton は掲示中に限り共有レジストリの現在値へ解決する（ADR-0011。initial 上書き規則は不適用）。
 *  singleton 解決には掲示時に解決した module を使う（ADR-0017）。 */
export function overlayVariant(state: RuntimeState, name: string): string | null {
  const entry = state.overlays.get(name);
  if (entry === undefined) return null;
  const key = singletonKey(entry.module, name);
  if (state.singletons.has(key)) return state.sharedVariants.get(key) ?? null;
  return entry.variant;
}

/** singleton の Location を共有レジストリの現在値へ解決する（スナップショットを作らない。ADR-0011）。
 *  singleton でなければそのまま返す。frame stack・overlays に載る singleton を読む唯一の口。 */
export function resolveLocation(state: RuntimeState, loc: Location): Location {
  const key = singletonKey(loc.module, loc.component);
  if (!state.singletons.has(key)) return loc;
  return { ...loc, variant: state.sharedVariants.get(key) ?? null };
}

/** 便宜ヘルパ: Document の最初の component をエントリとする Location を返す。
 *  コアの initialState とは分離して提供する。 */
export function entryFromDocument(doc: Document): Location {
  const comp = doc.components[0];
  if (!comp) throw new Error('Document に component が存在しない');
  return { module: null, component: comp.name, variant: null };
}

/** 便宜ヘルパ: Document 内の singleton component 名を集める（`initialState(entry, ...)` に渡す）。
 *  CLI/simulator が document 境界で singleton 集合を注入する口（ADR-0011）。 */
export function singletonNames(doc: Document): string[] {
  return doc.components.filter((c) => c.singleton).map((c) => c.name);
}

// ──────────────────────────────────────────────────
// 検査用の最小ヘルパ（テスト表明・デバッグ用に export）
// ──────────────────────────────────────────────────

export function getFrame(state: RuntimeState, id: number): Frame {
  const f = state.frames.find((fr) => fr.id === id);
  if (!f) throw new Error(`frame ${id} が state.frames に存在しない（内部不変条件違反）`);
  return f;
}

/** 現在アクティブなフレームオブジェクト */
export function activeFrame(state: RuntimeState): Frame {
  return getFrame(state, state.activeFrameId);
}

/** 現在アクティブな画面の Location（アクティブフレームの stack 最上段。singleton は共有解決） */
export function activeLocation(state: RuntimeState): Location {
  const f = activeFrame(state);
  return resolveLocation(state, f.stack[f.stack.length - 1]!);
}

/** 木を人間可読な文字列にする（デバッグ・テスト表明用）。
 *  記法は docs/stress-test/oracle/frame-tree-cases.md に合わせる:
 *  名前[製法,barrier,@session]{stack}。`*` はアクティブフレーム。 */
export function formatTree(state: RuntimeState): string {
  const children = (id: number) => state.frames.filter((f) => f.parentId === id);
  // singleton は共有現在値へ解決して描画する（stored variant は snapshot でない。ADR-0011）。
  const fmtLoc = (l0: Location) => {
    const l = resolveLocation(state, l0);
    return l.variant ? `${l.component}##${l.variant}` : l.component;
  };
  const fmtFrame = (f: Frame): string => {
    const stackStr = f.stack.map(fmtLoc).join(',');
    const sess = f.beginsSession ? `@${f.beginsSession.name ?? '(無名)'}` : '-';
    const bar = f.barrier ? 'barrier' : 'no-barrier';
    const active = f.id === state.activeFrameId ? '*' : '';
    return `F${f.id}${active}[${f.origin},${bar},${sess}]{${stackStr}}`;
  };
  const lines: string[] = [];
  const walk = (id: number, depth: number) => {
    lines.push('  '.repeat(depth) + fmtFrame(getFrame(state, id)));
    for (const c of children(id)) walk(c.id, depth + 1);
  };
  const root = state.frames.find((f) => f.parentId === null);
  if (root) walk(root.id, 0);
  return lines.join('\n');
}

// ──────────────────────────────────────────────────
// 内部ユーティリティ
// ──────────────────────────────────────────────────

function warn(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'warning', code, message, span };
}

/** R005: アクティブパス上に生存する同名 @S があるのに再 begin した（ADR-0016 B4）。
 *  対象は push/present の named begin のみ——switch は木全体の resume-or-create のため
 *  新規作成時にアクティブパス上に同名が残ることは論理的にない（整合レビュー G6）。 */
function warnDuplicateSessionBegin(
  state: RuntimeState,
  name: string | null,
  span: Span,
  diags: Diagnostic[]
): void {
  if (name == null) return; // 無名 present の多段は想定内（LIFO dismiss の設計どおり）
  for (let f: Frame | null = activeFrame(state); f; f = f.parentId != null ? getFrame(state, f.parentId) : null) {
    if (f.beginsSession?.name === name) {
      diags.push(
        warn(
          'R005',
          `@${name} は生存中に再 begin された（同名セッションが入れ子になり、exit/dismiss は直近の 1 つしか畳まない。フロー全体をまとめたいなら begin は入口の 1 回だけ。「セッション」参照）`,
          span
        )
      );
      return;
    }
  }
}

/**
 * NavTarget を現在の Location を踏まえて Location へ正規化する。
 * module 解決は呼び手（simulator extract）の責務（ADR-0018）——無修飾参照は
 * extract がその interaction を書いたファイル（sourceModule）へレキシカルに
 * 正規化してから渡してくる想定であり、`?? current.module` は extract を経由しない
 * 呼び出し（テストの直接呼び出し等）に対する最後の防衛としてのみ残す。
 */
function navTargetToLocation(target: NavTarget, current: Location): Location {
  if (target.kind === 'variant') {
    // ##姿 — 同一 component 内の姿切替
    return { module: current.module, component: current.component, variant: target.name };
  }
  return {
    module: target.module ?? current.module,
    component: target.name,
    variant: target.variant ?? null,
  };
}

/** 明示 variant 付き singleton 遷移なら共有レジストリを書き換えた新 map を返す（ADR-0011）。
 *  loc は navTargetToLocation 正規化後。variant!=null が明示指定（X##v / ##v）を表す。 */
function writeShared(state: RuntimeState, loc: Location): ReadonlyMap<string, string | null> {
  const key = singletonKey(loc.module, loc.component);
  if (loc.variant != null && state.singletons.has(key)) {
    const m = new Map(state.sharedVariants);
    m.set(key, loc.variant);
    return m;
  }
  return state.sharedVariants;
}

/** 指定フレームの stack だけを差し替えた新 state を返す */
function updateFrameStack(state: RuntimeState, id: number, stack: Location[]): RuntimeState {
  return {
    ...state,
    frames: state.frames.map((f) => (f.id === id ? { ...f, stack } : f)),
  };
}

/** 新規フレームを追加した新 state を返す（nextFrameId も進む） */
function addFrame(state: RuntimeState, frame: Frame): RuntimeState {
  return {
    ...state,
    frames: [...state.frames, frame],
    nextFrameId: state.nextFrameId + 1,
  };
}

/** rootId とその子孫フレームを全部破棄した新 state を返す（activeFrameId は呼び手が設定し直す） */
function removeSubtree(state: RuntimeState, rootId: number): RuntimeState {
  const toRemove = new Set<number>();
  const collect = (id: number) => {
    toRemove.add(id);
    for (const f of state.frames) {
      if (f.parentId === id) collect(f.id);
    }
  };
  collect(rootId);
  return { ...state, frames: state.frames.filter((f) => !toRemove.has(f.id)) };
}

// ──────────────────────────────────────────────────
// back(X) — アクティブパスを走査し、barrier なしのフレーム境界は越えて遡る
// ──────────────────────────────────────────────────

type BackSearchResult =
  | { kind: 'found'; frameId: number; index: number; crossed: number[] }
  | { kind: 'blocked' }
  | { kind: 'not-found' };

function findBackTarget(state: RuntimeState, targetComponent: string): BackSearchResult {
  const crossed: number[] = [];
  let frameId = state.activeFrameId;
  for (;;) {
    const f = getFrame(state, frameId);
    let index = -1;
    for (let i = f.stack.length - 1; i >= 0; i--) {
      if (f.stack[i]!.component === targetComponent) {
        index = i;
        break;
      }
    }
    if (index !== -1) return { kind: 'found', frameId, index, crossed };
    if (f.barrier) return { kind: 'blocked' };
    if (f.parentId === null) return { kind: 'not-found' };
    crossed.push(frameId);
    frameId = f.parentId;
  }
}

// ──────────────────────────────────────────────────
// exit / dismiss 共通: アクティブパス「新しい方から最初の @S」→ 無ければ遠隔破棄
// ──────────────────────────────────────────────────

function closeSession(
  state: RuntimeState,
  sessionName: string | null,
  closerLabel: string,
  span: Span,
  diags: Diagnostic[],
): ReduceResult {
  // アクティブパスを現在フレームから祖先方向へ走査。
  // sessionName === null（dismiss()）は「直近の無名セッション」を探し、
  // named session（beginsSession.name !== null）は素通りする。
  let frameId: number | null = state.activeFrameId;
  while (frameId !== null) {
    const f = getFrame(state, frameId);
    if (f.beginsSession !== null) {
      const matches = sessionName === null ? f.beginsSession.name === null : f.beginsSession.name === sessionName;
      if (matches) {
        const parentId = f.parentId; // root は beginsSession=null なので必ず非 null
        const newState = removeSubtree(state, f.id);
        return { state: { ...newState, activeFrameId: parentId! }, diagnostics: diags };
      }
    }
    frameId = f.parentId;
  }

  // アクティブパスで見つからない: named session のみ木全体から遠隔破棄を試みる
  if (sessionName !== null) {
    const candidates = state.frames.filter((f) => f.beginsSession?.name === sessionName);
    if (candidates.length > 0) {
      const target = candidates.reduce((a, b) => (b.id > a.id ? b : a));
      const newState = removeSubtree(state, target.id);
      // 遠隔破棄: アクティブフレームは動かない
      return { state: newState, diagnostics: diags };
    }
  }

  const label = sessionName !== null ? `@${sessionName}` : '(無名セッション)';
  diags.push(warn('R002', `${closerLabel} 対象セッション ${label} がスタックに不在`, span));
  return { state, diagnostics: diags };
}

/**
 * switch でフレームを新規作成するときの親フレーム ID を決める（ADR-0008 補正）。
 * 現在フレームから祖先方向に辿り、最初に見つかった switch 製 or present 製フレームを基準に:
 * - switch 製 → その兄弟（= その親の子）
 * - present 製（タブ群 anchor）→ その子
 * - どちらも無ければ現在フレームの子。
 */
function switchParentId(state: RuntimeState, cur: Frame): number {
  let f: Frame | null = cur;
  while (f !== null) {
    if (f.origin === 'switch') return f.parentId!;
    if (f.origin === 'present') return f.id;
    f = f.parentId !== null ? getFrame(state, f.parentId) : null;
  }
  return cur.id;
}

// ──────────────────────────────────────────────────
// reduce — フレーム木マシン
// ──────────────────────────────────────────────────

export function reduce(
  state: RuntimeState,
  action: Transition | Overlay | StateWrite
): ReduceResult {
  if (action.kind === 'overlay') {
    return reduceOverlay(state, action);
  }
  if (action.kind === 'state') {
    return reduceStateWrite(state, action);
  }
  return reduceTransition(state, action);
}

/** set（state verb。ADR-0014）— 共有レジストリだけを書き換える。フレーム木・掲示は不変。
 *  対象が singleton でなければ no-op（E030 は checker が静的に検出する）。
 *  module 解決は呼び手責務（ADR-0018）——`?? current.module` は extract を経由しない
 *  呼び出しに対する最後の防衛。 */
function reduceStateWrite(state: RuntimeState, action: StateWrite): ReduceResult {
  const current = activeLocation(state);
  const module = action.target.module ?? current.module;
  const key = singletonKey(module, action.target.name);
  if (!state.singletons.has(key)) {
    return { state, diagnostics: [] };
  }
  const sharedVariants = new Map(state.sharedVariants);
  sharedVariants.set(key, action.target.variant);
  return { state: { ...state, sharedVariants }, diagnostics: [] };
}

function reduceOverlay(state: RuntimeState, overlay: Overlay): ReduceResult {
  const name = overlay.target.name;
  if (overlay.verb === 'show') {
    // 掲示 / 再掲示とも表示 variant を上書き（ADR-0009。省略時は null = initial の含意）。
    // singleton は overlays の値を読まず共有解決される（overlayVariant 参照）ため、ここでの
    // 省略形 show は共有を initial に戻さない。明示 X##v のみ writeShared で共有書換（ADR-0011）。
    // module 省略はアクティブフレームの module を継承（nav の相対解決と同じ規約。ADR-0017）。
    // module 解決は呼び手責務（ADR-0018）——この fallback は extract を経由しない
    // 呼び出しに対する最後の防衛。
    const module = overlay.target.module ?? activeLocation(state).module;
    const overlays = new Map(state.overlays);
    overlays.set(name, { module, variant: overlay.target.variant ?? null });
    const loc: Location = { module, component: name, variant: overlay.target.variant ?? null };
    const sharedVariants = writeShared(state, loc);
    return { state: { ...state, overlays, sharedVariants }, diagnostics: [] };
  }
  // hide
  if (!state.overlays.has(name)) {
    return { state, diagnostics: [] };
  }
  const overlays = new Map(state.overlays);
  overlays.delete(name);
  return { state: { ...state, overlays }, diagnostics: [] };
}

function reduceTransition(state: RuntimeState, transition: Transition): ReduceResult {
  const { word, target, session, span } = transition;
  const current = activeLocation(state);
  const diags: Diagnostic[] = [];

  switch (word) {
    case 'push': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      const sharedVariants = writeShared(state, loc);
      if (!session) {
        // セッションなし: 現在フレームのスタックに積む
        const cur = activeFrame(state);
        const newState = updateFrameStack(state, cur.id, [...cur.stack, loc]);
        return { state: { ...newState, sharedVariants }, diagnostics: diags };
      }
      // セッションあり: 現在フレームの子フレームを新規作成（barrier なし）
      warnDuplicateSessionBegin(state, session.name, span, diags);
      const child: Frame = {
        id: state.nextFrameId,
        parentId: state.activeFrameId,
        stack: [loc],
        barrier: false,
        beginsSession: { name: session.name },
        origin: 'push',
      };
      const newState = addFrame(state, child);
      return { state: { ...newState, activeFrameId: child.id, sharedVariants }, diagnostics: diags };
    }

    case 'present': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      const sharedVariants = writeShared(state, loc);
      if (session) warnDuplicateSessionBegin(state, session.name, span, diags);
      const child: Frame = {
        id: state.nextFrameId,
        parentId: state.activeFrameId,
        stack: [loc],
        barrier: true,
        beginsSession: session ? { name: session.name } : { name: null },
        origin: 'present',
      };
      const newState = addFrame(state, child);
      return { state: { ...newState, activeFrameId: child.id, sharedVariants }, diagnostics: diags };
    }

    case 'goto': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      const cur = activeFrame(state);
      const sharedVariants = writeShared(state, loc);
      // 最上段を置換するのみ。barrier・beginsSession（フレームの属性）は保存される（ADR-0006 B2）。
      const newStack = [...cur.stack.slice(0, -1), loc];
      const newState = updateFrameStack(state, cur.id, newStack);
      return { state: { ...newState, sharedVariants }, diagnostics: diags };
    }

    case 'back': {
      if (!target) {
        const cur = activeFrame(state);
        if (cur.stack.length > 1) {
          const newState = updateFrameStack(state, cur.id, cur.stack.slice(0, -1));
          return { state: newState, diagnostics: diags };
        }
        // これ以上フレーム内を降りられない
        if (cur.barrier) {
          diags.push(warn('R003', 'back() が壁に阻まれ no-op', span));
          return { state, diagnostics: diags };
        }
        if (cur.parentId === null) {
          // ルート最下段: no-op（SPEC「戻り先が無いとき」。警告は任意でここでは出さない）
          return { state, diagnostics: diags };
        }
        const parentId = cur.parentId;
        const newState = removeSubtree(state, cur.id);
        return { state: { ...newState, activeFrameId: parentId }, diagnostics: diags };
      }

      // back(X)
      const targetLoc = navTargetToLocation(target, current);
      const result = findBackTarget(state, targetLoc.component);
      if (result.kind === 'found') {
        let newState = state;
        for (const id of result.crossed) {
          newState = removeSubtree(newState, id);
        }
        const f = getFrame(newState, result.frameId);
        newState = updateFrameStack(newState, result.frameId, f.stack.slice(0, result.index + 1));
        newState = { ...newState, activeFrameId: result.frameId };
        return { state: newState, diagnostics: diags };
      }
      if (result.kind === 'blocked') {
        diags.push(warn('R003', `back(${targetLoc.component}) が壁に阻まれ no-op`, span));
        return { state, diagnostics: diags };
      }
      diags.push(warn('R004', `back 対象 "${targetLoc.component}" がスタックに不在`, span));
      return { state, diagnostics: diags };
    }

    case 'exit':
      // named session なので開始 verb（push/present/switch）を問わず dismiss(@S) と同義（ADR-0006 B4）
      return closeSession(state, session?.name ?? null, 'exit', span, diags);

    case 'dismiss':
      // 無名セッションは常に present 由来。named session は exit(@S) と同義（ADR-0006 B4）
      return closeSession(state, session?.name ?? null, 'dismiss', span, diags);

    case 'switch': {
      const sessionName = session?.name ?? null;
      if (sessionName === null) {
        // E019 により本来到達しない（session は必須）。防御的に no-op。
        return { state, diagnostics: diags };
      }
      const candidates = state.frames.filter((f) => f.beginsSession?.name === sessionName);
      if (candidates.length > 0) {
        // resume: 最も新しいフレームへ復帰（木の形は不変。target X の component は無視される）。
        // ただし明示 X##v は共有 variant 書換として働く（SPEC「singleton」— 全所在に即時反映。
        // resume でも target frame は変えないが副作用の書換だけは効く。設計者確定）。
        const resumeFrame = candidates.reduce((a, b) => (b.id > a.id ? b : a));
        const sharedVariants = target ? writeShared(state, navTargetToLocation(target, current)) : state.sharedVariants;
        return { state: { ...state, activeFrameId: resumeFrame.id, sharedVariants }, diagnostics: diags };
      }
      // create: 兄弟規則（ADR-0008 補正）。祖先方向に最も近い switch 製 or present 製
      // （タブ群 anchor）を基準に親を決める: switch 製ならその兄弟、present 製ならその子、
      // どちらも無ければ現在フレームの子。
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      const sharedVariants = writeShared(state, loc);
      const cur = activeFrame(state);
      const parentId = switchParentId(state, cur);
      const child: Frame = {
        id: state.nextFrameId,
        parentId,
        stack: [loc],
        barrier: true,
        beginsSession: { name: sessionName },
        origin: 'switch',
      };
      const newState = addFrame(state, child);
      return { state: { ...newState, activeFrameId: child.id, sharedVariants }, diagnostics: diags };
    }
  }
}
