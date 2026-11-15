export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  duration: number; // seconds (images: 0)
  width: number;
  height: number;
  thumb?: string; // small data URL
}

export type TrackKind = 'video' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export type ClipType = 'video' | 'image' | 'audio' | 'text' | 'shape';

/** A named curve from EASINGS, or a custom cubic-bezier [x1, y1, x2, y2]. */
export type Easing = string | [number, number, number, number];

export interface Keyframe {
  t: number; // seconds, relative to clip start
  v: number;
  ease: Easing;
}

export type AnimProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
export const ANIM_PROPS: AnimProp[] = ['x', 'y', 'scale', 'rotation', 'opacity'];

export interface Transform {
  x: number; // offset from center, fraction of canvas width
  y: number; // offset from center, fraction of canvas height
  scale: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  flipH: boolean;
  flipV: boolean;
}

export interface Filters {
  brightness: number; // 1 = neutral
  contrast: number;
  saturation: number;
  hue: number; // degrees
  blur: number; // px at 1080p
  grayscale: number; // 0..1
  sepia: number; // 0..1
  invert: number; // 0..1
  vignette: number; // 0..1
}

export interface ChromaKey {
  enabled: boolean;
  color: string;
  similarity: number; // 0..1
  smoothness: number; // 0..1
}

export type AnimationType =
  | 'none'
  | 'fade'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'spin'
  | 'wipe'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown'
  | 'iris'
  | 'flipX'
  | 'flipY'
  | 'bounce'
  | 'drop'
  | 'swing'
  | 'blur';

export const ANIMATION_TYPES: AnimationType[] = ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 'zoomIn', 'zoomOut', 'spin', 'wipe', 'wipeRight', 'wipeUp', 'wipeDown', 'iris', 'flipX', 'flipY', 'bounce', 'drop', 'swing', 'blur'];

export type EffectType = 'motionBlur' | 'shake' | 'pulse' | 'wobble' | 'float' | 'strobe' | 'flash' | 'rgbSplit' | 'glitch' | 'pixelate' | 'mirror' | 'grain' | 'scanlines' | 'hueCycle' | 'zoomPunch';
export const EFFECT_TYPES: EffectType[] = ['motionBlur', 'shake', 'pulse', 'wobble', 'float', 'zoomPunch', 'strobe', 'flash', 'rgbSplit', 'glitch', 'pixelate', 'mirror', 'grain', 'scanlines', 'hueCycle'];

export interface ClipEffect {
  type: EffectType;
  amount: number; // 0..1
}

export interface ClipAnimation {
  type: AnimationType;
  duration: number;
}

export interface TextStyle {
  content: string;
  font: string;
  size: number; // px at 1080p canvas height
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  stroke: string;
  strokeWidth: number;
  background: string; // '' = none
  shadow: number; // blur radius, 0 = none
  glow: number; // glow radius, 0 = none
  glowColor: string;
  lineHeight: number;
  typewriter: boolean;
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'heart' | 'arrow' | 'diamond' | 'hexagon' | 'line' | 'bubble' | 'ring' | 'frame' | 'letterbox' | 'vignette' | 'scanlines' | 'grain';
export const SHAPE_KINDS: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'star', 'heart', 'arrow', 'diamond', 'hexagon', 'line', 'bubble', 'ring', 'frame'];

export interface ShapeStyle {
  kind: ShapeKind;
  fill: string;
  /** Second colour: when set the fill is a linear gradient from fill to fill2. */
  fill2?: string;
  gradientAngle?: number;
  width: number; // fraction of canvas width
  height: number; // fraction of canvas height
  radius: number; // fraction of the shorter side, rect only
}

export type BlendMode = 'source-over' | 'screen' | 'multiply' | 'overlay' | 'lighten' | 'darken' | 'difference' | 'color-dodge' | 'hard-light' | 'soft-light';

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  assetId?: string;
  name: string;
  start: number; // timeline seconds
  duration: number; // timeline seconds
  offset: number; // source in-point seconds
  speed: number;
  volume: number; // 0..2
  fadeIn: number; // audio fade seconds
  fadeOut: number;
  transform: Transform;
  filters: Filters;
  chroma: ChromaKey;
  blend: BlendMode;
  animIn: ClipAnimation;
  animOut: ClipAnimation;
  keyframes: Partial<Record<AnimProp, Keyframe[]>>;
  effects: ClipEffect[];
  text?: TextStyle;
  shape?: ShapeStyle;
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  assets: MediaAsset[];
  tracks: Track[]; // index 0 = top-most layer
  clips: Clip[];
  updatedAt: number;
  thumb?: string;
}

export const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipH: false, flipV: false };
export const DEFAULT_FILTERS: Filters = { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, vignette: 0 };
export const DEFAULT_CHROMA: ChromaKey = { enabled: false, color: '#00ff00', similarity: 0.35, smoothness: 0.1 };
export const DEFAULT_TEXT: TextStyle = {
  content: 'Text',
  font: 'Heebo, Arial, sans-serif',
  size: 96,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
  stroke: '#000000',
  strokeWidth: 0,
  background: '',
  shadow: 8,
  glow: 0,
  glowColor: '#19d3c5',
  lineHeight: 1.2,
  typewriter: false,
};

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (+c ^ ((Math.random() * 16) >> (+c / 4))).toString(16),
      );

export const isVisual = (t: ClipType) => t !== 'audio';
export const clipEnd = (c: Clip) => c.start + c.duration;
export const projectDuration = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
