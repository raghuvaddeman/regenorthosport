// components/time-range-filter.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { RANGE_LABELS, type TimeRange } from "@/lib/time-range";

/* Custom dropdown, not a native <select> — a native select's popup opens around
   whichever option is currently selected, so with 8 options it can open upward
   and obscure the page. This always opens directly below the trigger button. */
export function TimeRangeFilter({
  range,
  onRangeChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
}: {
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
  customFrom: string;
  onCustomFromChange: (v: string) => void;
  customTo: string;
  onCustomToChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Time range"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700"
        >
          {RANGE_LABELS[range]}
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-700">
            {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  onRangeChange(r);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-600 ${
                  range === r
                    ? "font-medium text-indigo-600 dark:text-indigo-400"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>
      {range === "custom" && (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            aria-label="Custom range start date"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700"
          />
          <span className="text-sm text-zinc-400">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            aria-label="Custom range end date"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-700"
          />
        </>
      )}
    </div>
  );
}
