'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CirclePlus, Search, X } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface FacetedFilterOption {
  value: string;
  label: string;
}

interface FacetedFilterProps {
  label: string;
  options: FacetedFilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Single-value filters (e.g. status) behave like a radio: picking an option replaces the selection and closes the panel. */
  singleSelect?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  clearLabel?: string;
  emptyLabel?: string;
  panelWidth?: number;
}

const MAX_INLINE_BADGES = 2;

export function FacetedFilter({
  label,
  options,
  selected,
  onChange,
  singleSelect = false,
  showSearch = true,
  searchPlaceholder,
  clearLabel = 'Bỏ chọn',
  emptyLabel = 'Không có kết quả',
  panelWidth = 240,
}: FacetedFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchText('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function toggle(value: string) {
    if (singleSelect) {
      onChange(selected.includes(value) ? [] : [value]);
      setOpen(false);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const selectedLabels = selected.map((v) => options.find((o) => o.value === v)?.label ?? v);
  const filteredOptions = searchText
    ? options.filter((o) => o.label.toLowerCase().includes(searchText.toLowerCase()))
    : options;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
      >
        <CirclePlus size={15} />
        {label}
        {selected.length > 0 && (
          <>
            <span className="mx-0.5 h-4 w-px bg-gray-200" />
            {selected.length > MAX_INLINE_BADGES ? (
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                {selected.length} đã chọn
              </span>
            ) : (
              selectedLabels.map((l) => (
                <span key={l} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                  {l}
                </span>
              ))
            )}
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-20 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{ width: panelWidth }}
        >
          {showSearch && (
            <div className="flex h-9 items-center gap-2 border-b border-gray-100 px-3">
              <Search size={14} className="shrink-0 text-gray-400" />
              <input
                autoFocus
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={searchPlaceholder ?? label}
                className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300',
                    )}
                  >
                    {checked && <Check size={12} className="text-white" />}
                  </span>
                  {option.label}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="px-2 py-1.5 text-center text-xs text-gray-400">{emptyLabel}</div>
            )}
          </div>
          {selected.length > 0 && (
            <>
              <div className="h-px bg-gray-100" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="p-2 text-center text-sm text-gray-500 hover:bg-gray-50"
              >
                {clearLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterResetButton({ show, onClick, label = 'Đặt lại' }: { show: boolean; onClick: () => void; label?: string }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-500 hover:bg-gray-50"
    >
      <X size={15} />
      {label}
    </button>
  );
}
