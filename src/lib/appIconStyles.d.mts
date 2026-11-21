export interface IconStyle {
  id: string;
  label: string;
  bg: string;
  tile: string[];
  glyph: string[];
  stroke?: string;
  glow?: string;
  shadow?: string;
}
export const ICON_STYLES: IconStyle[];
export function iconSvg(style: IconStyle, fullBleed?: boolean): string;
