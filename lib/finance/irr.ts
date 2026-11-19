/** TIR por bisección. Devuelve null si no hay cambio de signo (TIR indefinida). */
export function irr(flujos: number[]): number | null {
  const npv = (r: number) => flujos.reduce((acc, f, i) => acc + f / Math.pow(1 + r, i), 0);
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-9) return mid;
    if (fLo * fMid < 0) hi = mid;
    else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}
