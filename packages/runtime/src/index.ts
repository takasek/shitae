import type { Diagnostic, Document, NavTarget, Span, Transition, TransitionWord } from '@shitae/ast';

// ──────────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────────

/** 画面位置。module=null は同一ファイル内 */
export interface Location {
  module: string | null;
  component: string;
  variant: string | null;
}

/** present/dismiss 由来は name=null（無名セッション） */
export interface SessionMarker {
  name: string | null;
}

/** 画面スタックの1フレーム */
export interface Frame {
  location: Location;
  /** push→false / present→true（back の壁）*/
  wall: boolean;
  /** この遷移が begin したセッション（SPEC:219）*/
  beginsSession: SessionMarker | null;
  /** 振る舞い正規化後も元語を保持 */
  word: TransitionWord;
}

/** runtime 実行状態。frames 末尾 = 現在地。空禁止 */
export interface RuntimeState {
  frames: Frame[];
}

export interface ReduceResult {
  state: RuntimeState;
  diagnostics: Diagnostic[];
}

// ──────────────────────────────────────────────────
// initialState
// ──────────────────────────────────────────────────

/** エントリ画面から初期状態を構築する。起点は呼び手が決める（SPEC 未規定）。 */
export function initialState(entry: Location): RuntimeState {
  return {
    frames: [
      {
        location: entry,
        wall: false,
        beginsSession: null,
        word: 'push',
      },
    ],
  };
}

/** 便宜ヘルパ: Document の最初の component をエントリとする Location を返す。
 *  コアの initialState とは分離して提供する。 */
export function entryFromDocument(doc: Document): Location {
  const comp = doc.components[0];
  if (!comp) throw new Error('Document に component が存在しない');
  return { module: null, component: comp.name, variant: null };
}

// ──────────────────────────────────────────────────
// 内部ユーティリティ
// ──────────────────────────────────────────────────

function warn(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'warning', code, message, span };
}

// ADR-0006 B4: named session の exit(@S)/dismiss(@S) は開始 verb（push/present/switch）を
// 問わず同義 —— 開始・終了 verb を比較してのねじれ警告（旧 R001）は撤去した。
function closeSession(
  frames: Frame[],
  state: RuntimeState,
  sessionName: string | null,
  closerLabel: string,
  span: Span,
  diags: Diagnostic[],
): ReduceResult {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (f.beginsSession !== null && f.beginsSession.name === sessionName) {
      return { state: { frames: frames.slice(0, i) }, diagnostics: diags };
    }
  }
  const label = sessionName !== null ? `@${sessionName}` : '(無名セッション)';
  diags.push(warn('R002', `${closerLabel} 対象セッション ${label} がスタックに不在`, span));
  return { state, diagnostics: diags };
}

/** NavTarget を現在の Location を踏まえて Location へ正規化する */
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

// ──────────────────────────────────────────────────
// reduce — 純粋スタックマシン
// ──────────────────────────────────────────────────

export function reduce(state: RuntimeState, transition: Transition): ReduceResult {
  const { word, target, session, span } = transition;
  const frames = state.frames;
  const current = frames[frames.length - 1]!.location;
  const diags: Diagnostic[] = [];

  switch (word) {
    case 'push': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      return {
        state: {
          frames: [
            ...frames,
            {
              location: loc,
              wall: false,
              beginsSession: session ? { name: session.name } : null,
              word: 'push',
            },
          ],
        },
        diagnostics: diags,
      };
    }

    case 'present': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      return {
        state: {
          frames: [
            ...frames,
            {
              location: loc,
              wall: true,
              beginsSession: session ? { name: session.name } : { name: null },
              word: 'present',
            },
          ],
        },
        diagnostics: diags,
      };
    }

    case 'goto': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      const top = frames[frames.length - 1]!;
      // SPEC 対応表 goto 行（ADR-0006 B2）— ##姿 に限らず component への goto も
      // 最上段の location だけを置き換える（積まない）。wall・beginsSession（begin 地点であること自体）は保存する。
      const newTop: Frame = { ...top, location: loc };
      return {
        state: { frames: [...frames.slice(0, -1), newTop] },
        diagnostics: diags,
      };
    }

    case 'back': {
      if (!target) {
        // back() — 壁を越えずに1段 pop
        if (frames.length <= 1) {
          // 最小スタック維持
          return { state, diagnostics: diags };
        }
        const top = frames[frames.length - 1]!;
        if (top.wall) {
          // 壁の内側: no-op + R003
          diags.push(warn('R003', 'back() が壁に阻まれ no-op', span));
          return { state, diagnostics: diags };
        }
        return { state: { frames: frames.slice(0, -1) }, diagnostics: diags };
      } else {
        // back(X) — 明示先まで pop。ADR-0001: barrier は越えられない。
        // 末尾から targetComponent を探しつつ、target に当たる前に wall に阻まれたら no-op。
        const targetLoc = navTargetToLocation(target, current);
        for (let i = frames.length - 1; i >= 0; i--) {
          const f = frames[i]!;
          if (f.location.component === targetLoc.component) {
            return { state: { frames: frames.slice(0, i + 1) }, diagnostics: diags };
          }
          if (f.wall) {
            // target に届く前に barrier に当たった → 越えられず no-op
            diags.push(warn('R003', `back(${targetLoc.component}) が壁に阻まれ no-op`, span));
            return { state, diagnostics: diags };
          }
        }
        // barrier に阻まれずスタック全体を探しても見つからない → R004
        diags.push(warn('R004', `back 対象 "${targetLoc.component}" がスタックに不在`, span));
        return { state, diagnostics: diags };
      }
    }

    case 'exit':
      // named session なので開始 verb（push/present/switch）を問わず dismiss(@S) と同義（ADR-0006 B4）
      return closeSession(frames, state, session?.name ?? null, 'exit', span, diags);

    case 'dismiss':
      // 無名セッションは常に present 由来。named session は exit(@S) と同義（ADR-0006 B4）
      return closeSession(frames, state, session?.name ?? null, 'dismiss', span, diags);
  }
}
