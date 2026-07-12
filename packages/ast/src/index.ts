export interface Span {
  offset: number;
  length: number;
  line: number;
  col: number;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  span: Span;
}

export interface Document {
  imports: Import[];
  /** 最初の "#" より前の要素行・インタラクション行（全 component に共通。SPEC「document common」） */
  common: Body;
  components: Component[];
}

export interface Import {
  module: string;
  alias: string;
  span: Span;
}

export interface Component {
  name: string;
  /** "#!" 宣言なら true（document 内で単一インスタンス。variant 状態を共有。SPEC「singleton component」） */
  singleton: boolean;
  common: Body;
  variants: Variant[];
  span: Span;
}

export interface Variant {
  name: string;
  body: Body;
  span: Span;
}

export interface Body {
  elements: ElementLine[];
  interactions: Interaction[];
}

export interface ElementLine {
  collection: boolean;
  alias: string | null;
  value: Ref | Inline;
  span: Span;
}

export interface Ref {
  kind: 'ref';
  name: string;
  span: Span;
}

export interface Inline {
  kind: 'inline';
  elements: ElementLine[];
  span: Span;
}

export interface Interaction {
  action: Action;
  results: Result[];
  span: Span;
}

export interface Action {
  text: string;
  target: Reference | null;
  span: Span;
}

export interface Reference {
  module: string | null;
  name: string;
  member: string | null;
  existsGated: boolean;
  /** 先頭の "*"（collection 全体への参照。宣言側の "*" と対称。「collection」参照） */
  collection: boolean;
  span: Span;
}

export interface Result {
  label: string | null;
  body: Transition | Overlay | Effect;
  span: Span;
}

export type TransitionWord = 'push' | 'back' | 'goto' | 'exit' | 'present' | 'dismiss' | 'switch';

export const TRANSITION_WORDS: readonly TransitionWord[] = [
  'push',
  'present',
  'goto',
  'back',
  'exit',
  'dismiss',
  'switch',
];

export type OverlayVerb = 'show' | 'hide';

export const OVERLAY_VERBS: readonly OverlayVerb[] = ['show', 'hide'];

export interface Transition {
  kind: 'transition';
  word: TransitionWord;
  target: NavTarget | null;
  session: Session | null;
  span: Span;
}

export interface Effect {
  kind: 'effect';
  text: string;
  span: Span;
}

export type NavTarget =
  | { kind: 'component'; module: string | null; name: string; variant: string | null }
  | { kind: 'variant'; name: string };

export interface Session {
  name: string | null;
  span: Span;
}

/**
 * オーバーレイ（show / hide）。フレーム木を操作しない別カテゴリ（SPEC「オーバーレイ」）。
 * show は [module::] name [##variant]、hide は [module::] name のみ
 * （hide への ##variant 指定は構文エラー。パーサが検出する）。
 */
export interface Overlay {
  kind: 'overlay';
  verb: OverlayVerb;
  target: OverlayTarget;
  span: Span;
}

export interface OverlayTarget {
  module: string | null;
  name: string;
  variant: string | null;
}
