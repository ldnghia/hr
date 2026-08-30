'use client';

import { useRouter } from 'next/navigation';
import { Clock3, CalendarPlus, FileEdit } from 'lucide-react';

const ACTIONS = [
  { href: '/attendance', label: 'Chấm công', icon: Clock3, color: 'text-indigo-600 bg-indigo-50' },
  { href: '/leave', label: 'Xin nghỉ phép', icon: CalendarPlus, color: 'text-emerald-600 bg-emerald-50' },
  { href: '/corrections', label: 'Xin điều chỉnh', icon: FileEdit, color: 'text-amber-600 bg-amber-50' },
] as const;

export function QuickActions() {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ACTIONS.map(({ href, label, icon: Icon, color }) => (
        <button
          key={href}
          type="button"
          onClick={() => router.push(href)}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
            <Icon size={18} />
          </span>
          <span className="text-sm font-semibold text-gray-800">{label}</span>
        </button>
      ))}
    </div>
  );
}
