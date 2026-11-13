import { useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useStore } from '../store';

/** Range + number pair. History is recorded once per gesture (on pointer/key down). */
export function Slider(props: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Multiplier for display, e.g. 100 to show a 0..1 value as percent. */
  display?: number;
  unit?: string;
  extra?: ReactNode;
}) {
  const { label, value, min, max, step = 0.01, onChange, display = 1, unit = '', extra } = props;
  const snapshot = useStore((s) => s.snapshot);
  const digits = step * display >= 1 ? 0 : step * display >= 0.1 ? 1 : 2;
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {extra}
      </span>
      <span className="field-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={snapshot}
          onKeyDown={snapshot}
          onChange={(e) => onChange(+e.target.value)}
        />
        <input
          className="num"
          type="number"
          step={step * display}
          value={+(value * display).toFixed(digits)}
          onFocus={snapshot}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v / display);
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

export function Section(props: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; action?: ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section className={'section' + (open ? ' open' : '')}>
      <header onClick={() => setOpen(!open)}>
        <ChevronDown size={14} className="chev" />
        <span>{props.title}</span>
        <span className="spacer" />
        <span onClick={(e) => e.stopPropagation()}>{props.action}</span>
      </header>
      {open && <div className="section-body">{props.children}</div>}
    </section>
  );
}

export function Dialog(props: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={'dialog' + (props.wide ? ' wide' : '')} role="dialog" aria-modal="true">
        <header>
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} aria-label="close">
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body">{props.children}</div>
      </div>
    </div>
  );
}

export function Toggle(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}
