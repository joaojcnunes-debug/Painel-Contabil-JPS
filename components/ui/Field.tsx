import { type ReactNode } from "react";

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-alert">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </label>
  );
}

const INPUT_CLS =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-verde-primary text-sm";

export const inputClass = INPUT_CLS;
