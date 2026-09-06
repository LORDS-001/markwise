import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  TextareaHTMLAttributes,
} from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Categorical colour for a cluster, driven by the token ramp. */
export function toneColor(tone: number) {
  return `var(--c${tone})`;
}

/* ---------------------------------- Button --------------------------------- */

export type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
export type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover border border-[var(--primary-line)]",
  secondary: "bg-surface text-ink border border-border hover:border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-crit border border-crit-line hover:bg-crit-soft",
  quiet: "bg-surface-2 text-ink border border-transparent hover:bg-surface-3",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-9 px-3.5 py-2 text-[13px] gap-1.5 rounded-[12px]",
  md: "min-h-10 px-4.5 py-2.5 text-[14px] gap-2 rounded-[12px]",
  lg: "min-h-11 px-5 py-3 text-[14px] gap-2 rounded-[14px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex max-w-full min-w-0 items-center justify-center text-center font-medium leading-snug transition-colors select-none [&>svg]:shrink-0",
    "disabled:opacity-45 disabled:pointer-events-none whitespace-normal",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      data-variant={variant}
      data-size={size}
      className={buttonClass(variant, size, className)}
      {...props}
    />
  );
}

/* ----------------------------------- Card ---------------------------------- */

export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const customBackground = className?.split(/\s+/).some((name) => name.startsWith("bg-"));
  const customBorder = className?.split(/\s+/).some((name) =>
    /^border-(?:brand|warn|crit|ok)-line$|^border-border-strong$/.test(name),
  );
  return (
    <div
      className={cn(
        "min-w-0 border rounded-[var(--r-card)]",
        !customBackground && "bg-surface",
        !customBorder && "border-border",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 px-5 py-5 border-b border-border sm:px-6",
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_12rem]">
        <h2 className="font-display text-[18px] font-bold leading-snug">{title}</h2>
        {hint ? <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">{hint}</p> : null}
      </div>
      {action ? <div className="min-w-0 max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------- Badge ---------------------------------- */

type Tone = "neutral" | "brand" | "warn" | "crit" | "ok";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-border",
  brand: "bg-brand-soft text-brand border-brand-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  crit: "bg-crit-soft text-crit border-crit-line",
  ok: "bg-ok-soft text-ok border-ok-line",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 border rounded-full px-2.5 py-1 text-[12px] font-medium leading-[1.4] whitespace-normal [&>svg]:shrink-0",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- Stat tile -------------------------------- */

export function Stat({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "warn" | "plain";
}) {
  return (
    <div className={cn("min-w-0 rounded-[var(--r-card)] border border-border p-5", tone === "brand" ? "bg-brand-soft" : "bg-surface")}>
      {icon ? <div className="mb-4 grid h-9 w-9 place-items-center rounded-[12px] bg-surface-2 text-ink" aria-hidden>{icon}</div> : null}
      <div className="text-[13px] font-medium leading-snug text-ink-2">{label}</div>
      <div
        className={cn(
          "font-display mt-2 break-words text-[26px] font-bold leading-tight tnum sm:text-[28px]",
          tone === "brand" && "text-brand",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-[12px] leading-relaxed text-ink-2">{sub}</div> : null}
    </div>
  );
}

/* --------------------------------- Progress -------------------------------- */

export function Progress({
  value,
  label,
  tone = "brand",
  className,
}: {
  value: number;
  label: string;
  tone?: "brand" | "ok" | "warn";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const bg = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-brand";
  return (
    <div
      className={cn("h-1.5 w-full rounded-full bg-surface-3 overflow-hidden", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full transition-[width] duration-300", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* -------------------------------- Segmented -------------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + options.length) % options.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % options.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = options.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    );
    radios?.[nextIndex]?.focus();
    onChange(options[nextIndex].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap bg-surface-2 border border-border rounded-[16px] p-1 gap-1"
    >
      {options.map((o, index) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(event) => moveSelection(event, index)}
            className={cn(
              "min-h-9 px-3 py-1.5 text-[13px] font-medium rounded-[12px] transition-colors",
              active
                ? "bg-surface text-ink border border-brand"
                : "text-ink-2 hover:text-ink border border-transparent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Fields --------------------------------- */

export function Field({
  label,
  hint,
  required,
  htmlFor,
  children,
  counter,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  counter?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
          {label}
          {required ? <span className="text-crit ml-1" aria-hidden>*</span> : null}
          {required ? (
            <>
              {" "}
              <span className="sr-only">(required)</span>
            </>
          ) : null}
        </label>
        {counter ? <span className="text-[12px] text-ink-3 tnum">{counter}</span> : null}
      </div>
      {hint ? <p className="text-[13px] text-ink-2 -mt-0.5">{hint}</p> : null}
      {children}
    </div>
  );
}

const inputBase =
  "w-full min-w-0 bg-surface border border-control-border rounded-[var(--r-input)] px-3.5 py-3 text-[14px] text-ink " +
  "placeholder:text-ink-3 transition-colors hover:border-brand focus:border-brand focus:outline-none " +
  "focus:ring-2 focus:ring-[var(--brand-line)]";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, "leading-relaxed resize-y", className)} {...props} />;
}

/* --------------------------------- Sundries -------------------------------- */

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border", className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-12 px-6">
      {icon ? <div className="text-ink-3">{icon}</div> : null}
      <h3 className="font-display text-[17px] font-bold">{title}</h3>
      {body ? <p className="text-[14px] text-ink-2 max-w-[46ch]">{body}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const low = value < 0.7;
  return (
    <span className="inline-flex items-center gap-2" aria-label={"Confidence " + pct + "%"}>
      <span className="w-12 h-1.5 rounded-full bg-surface-3 overflow-hidden shrink-0" aria-hidden>
        <span
          className={cn("block h-full", low ? "bg-warn" : "bg-brand")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={cn("tnum text-[13px]", low ? "text-warn font-semibold" : "text-ink-2")}>
        {pct}%
      </span>
    </span>
  );
}
