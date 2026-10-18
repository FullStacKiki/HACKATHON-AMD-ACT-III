import { PRODUCT_NAME } from "../brand";

export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="12.5" stroke="var(--text)" strokeWidth="2.4" strokeDasharray="3 3.2" />
      <path d="M16 16 L22 9.5" stroke="var(--lime)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.6" fill="var(--text)" />
    </svg>
  );
}

export default function Logo({ sub }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-lg font-medium tracking-tight text-zinc-100">{PRODUCT_NAME}</span>
        {sub && <span className="mt-1 text-[11px] text-zinc-500">{sub}</span>}
      </span>
    </span>
  );
}
