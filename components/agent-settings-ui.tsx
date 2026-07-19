import { Info, Save } from "lucide-react";

export const inputClasses =
  "w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100";

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-700">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-600">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  tooltip,
  valueLabel,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  valueLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
      <div className="sm:col-span-1">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</label>
          {tooltip && (
            <span title={tooltip} className="inline-flex cursor-help">
              <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
            </span>
          )}
          {valueLabel && (
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{valueLabel}</span>
          )}
        </div>
        {hint && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
      </div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-zinc-900 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100"
    />
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-indigo-600 dark:bg-zinc-500"
      />
      <span className="w-16 shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-center font-mono text-xs tabular-nums text-zinc-700 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
        {value}
        {suffix}
      </span>
    </div>
  );
}

// Grey + disabled with nothing to save, blue the moment something changes,
// green right after a successful save — so the button's color always
// reflects whether there's unsaved work, instead of staying blue regardless.
export function SaveButton({
  isDirty,
  saving,
  saved,
  onClick,
}: {
  isDirty: boolean;
  saving: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || !isDirty}
      className={`inline-flex items-center gap-2 self-start rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed sm:self-auto ${
        saved
          ? "bg-emerald-600"
          : isDirty
            ? "bg-indigo-600 hover:bg-indigo-500"
            : "bg-zinc-300 dark:bg-zinc-600"
      }`}
    >
      <Save className="h-4 w-4" />
      {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  tooltip,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  tooltip?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-600">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-600 dark:text-zinc-400">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
            {tooltip && (
              <span title={tooltip} className="inline-flex cursor-help">
                <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-500"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
