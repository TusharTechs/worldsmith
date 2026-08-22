import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef } from "react";

const BASE = "w-full bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-700 transition-colors";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref
) {
  return <input ref={ref} className={`${BASE} p-3 text-sm ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = "", ...rest },
  ref
) {
  return <textarea ref={ref} className={`${BASE} p-3 text-sm resize-none ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", children, ...rest },
  ref
) {
  return (
    <select ref={ref} className={`${BASE} p-2 text-xs ${className}`} {...rest}>
      {children}
    </select>
  );
});

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">{children}</span>;
}
