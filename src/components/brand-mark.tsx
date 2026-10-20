import { Layers3 } from "lucide-react";
import { brand } from "@/lib/brand";

export function BrandMark({ size = 34 }: { size?: number }) {
  return <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true"><Layers3 size={Math.round(size * 0.55)} strokeWidth={2.25}/></span>;
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return <span className={`brand-lockup${compact ? " compact" : ""}`}><BrandMark size={compact ? 30 : 36}/><span>{brand.wordmark}<span className="brand-period">.</span></span></span>;
}
