export function Tabs<T extends string>({
  value, onChange, options, labelOf,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
  labelOf?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded border transition-colors ${
            value === opt
              ? "border-cyan-700 text-cyan-300 bg-cyan-950/30"
              : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
          }`}
        >
          {labelOf ? labelOf(opt) : opt}
        </button>
      ))}
    </div>
  );
}
