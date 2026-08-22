'use client';

import { ReactNode } from "react";

/** Shared modal chrome — the dim/blur backdrop + centered panel every modal in the app re-implements. */
export function Modal({ onClose, children, maxWidth = "max-w-sm" }: { onClose: () => void; children: ReactNode; maxWidth?: string }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className={`w-full ${maxWidth} bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4 fade-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex justify-between items-center">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-white">{title}</h3>
      <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
    </div>
  );
}
