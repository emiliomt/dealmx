import Link from "next/link";
import { Money } from "@/components/money-provider";
import { SEGMENTOS, TIPOS_OPERACION, fotoUrl, type SegmentoKey, type TipoOperacionKey } from "@/lib/catalogos";
import { formatM2, formatPct } from "@/lib/format";

export interface DealResumen {
  id: string; titulo: string; segmento: SegmentoKey; tipo_operacion: TipoOperacionKey;
  municipio_nombre?: string; estado_nombre?: string;
  precio: number | null; cap_rate: number | null; m2_construccion: number | null; m2_terreno: number | null;
  monto_capital_buscado: number | null; es_ejemplo: boolean; foto?: string | null;
}

export function BadgeEjemplo() {
  return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">EJEMPLO · FICTICIO</span>;
}

export function DealCard({ d }: { d: DealResumen }) {
  return (
    <Link href={`/deal/${d.id}`} className="block overflow-hidden rounded-lg border border-border hover:shadow-md">
      <div className="flex h-36 items-center justify-center bg-muted text-sm text-muted-foreground">
        {d.foto ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={fotoUrl(d.foto)} alt="" className="h-full w-full object-cover" /> : "Sin foto"}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-muted px-2 py-0.5">{SEGMENTOS[d.segmento]}</span>
          <span className="rounded bg-muted px-2 py-0.5">{TIPOS_OPERACION[d.tipo_operacion]}</span>
          {d.es_ejemplo && <BadgeEjemplo />}
        </div>
        <h3 className="font-semibold leading-tight">{d.titulo}</h3>
        <p className="text-sm text-muted-foreground">{[d.municipio_nombre, d.estado_nombre].filter(Boolean).join(", ")}</p>
        <p className="text-lg font-bold">
          {d.precio != null ? <Money value={d.precio} abreviado /> : d.monto_capital_buscado != null ? <>Busca <Money value={d.monto_capital_buscado} abreviado /></> : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          {d.cap_rate != null && <>Cap rate {formatPct(d.cap_rate)} · </>}{formatM2(d.m2_construccion ?? d.m2_terreno)}
        </p>
      </div>
    </Link>
  );
}
