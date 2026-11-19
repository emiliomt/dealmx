import { AVISO_LEGAL } from "@/components/layout/legal-banner";
export default function AvisoLegal() {
  return (
    <article className="prose max-w-none space-y-3">
      <h1 className="text-2xl font-bold">Aviso legal</h1>
      <p>{AVISO_LEGAL}</p>
      <p className="text-sm text-muted-foreground">PLACEHOLDER: este texto requiere revisión de un abogado antes de producción.</p>
    </article>
  );
}
