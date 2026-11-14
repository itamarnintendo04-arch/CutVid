export const ASPECTS = [
  { label: '16:9', w: 1920, h: 1080 },
  { label: '9:16', w: 1080, h: 1920 },
  { label: '1:1', w: 1080, h: 1080 },
  { label: '4:5', w: 1080, h: 1350 },
  { label: '4:3', w: 1440, h: 1080 },
  { label: '3:4', w: 1080, h: 1440 },
  { label: '21:9', w: 2520, h: 1080 },
];

/** Aspect ratios drawn as what they are: a black frame of that shape with a white outline. */
export function AspectPicker({ width, height, onPick }: { width: number; height: number; onPick: (w: number, h: number) => void }) {
  const current = width / height;
  return (
    <div className="aspects" dir="ltr">
      {ASPECTS.map((a) => {
        const r = a.w / a.h;
        const box = 38;
        const style = r >= 1 ? { width: box, height: box / r } : { width: box * r, height: box };
        return (
          <button key={a.label} className={'aspect' + (Math.abs(r - current) < 0.01 ? ' active' : '')} onClick={() => onPick(a.w, a.h)} aria-label={a.label}>
            <span className="aspect-frame">
              <span className="aspect-shape" style={style} />
            </span>
            <small>{a.label}</small>
          </button>
        );
      })}
    </div>
  );
}
