import type { Location, RuntimeState } from '@shitae/runtime';
import type { DetailedActions, Source } from './index.js';
export type ValueOrigin = 'initial' | 'dsl' | 'manual-test';
export interface VariantValue {
  variant: string | null;
  singleton: boolean;
  scope: 'frame-location' | 'overlay-entry' | 'singleton-shared' | 'inclusion-initial' | 'component-test';
  origin: ValueOrigin;
}
export interface ComponentValue extends VariantValue { module: string; component: string }
export interface InclusionNode {
  kind: 'component' | 'inline' | 'unresolved'; name: string; root: string; path: number[];
  source: Source; collection: boolean; reference?: { module: string; component: string };
  componentSource?: Source; value?: VariantValue; cycle?: boolean; children: InclusionNode[];
}
export interface InclusionRoot extends ComponentValue { root: string; source: Source | null; children: InclusionNode[] }
export interface StateView {
  frames: Array<Omit<RuntimeState['frames'][number], 'stack'> & { stack: Array<ComponentValue> }>;
  activeFrameId: number; nextFrameId: number; activePath: number[];
  overlays: Array<ComponentValue>;
  sharedVariants: ComponentValue[]; testVariants: ComponentValue[]; componentValues: ComponentValue[];
  gateTargets: Array<ComponentValue & { variants: string[] }>;
  inclusion: { main: InclusionRoot; overlays: InclusionRoot[] };
}
export interface HistoryItem {
  id: number; operationId: number | null; resultIndex: number | null; source: Source | null;
  kind: 'transition' | 'event'; label: string; location: Location; ghost: boolean;
}
export type HistoricalActions = {
  items: Array<Omit<DetailedActions['items'][number], 'handle'>>;
  controls: { back: Omit<DetailedActions['controls']['back'], 'handle'> };
};
export interface ObservationView extends HistoryItem {
  view: { location: Location; state: StateView; actions: HistoricalActions };
}
export interface QueryOptions {
  select?: string[];
  history?: { after?: number; limit?: number; operationId?: number };
  observationId?: number;
  handle?: string;
}
