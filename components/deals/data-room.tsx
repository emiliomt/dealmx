export function DataRoom({ dealId, docs }: { dealId: string; docs: { id: string; nombre: string; tipo: string | null }[] }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Data room</h3>
      {docs.length === 0 ? <p className="text-sm text-muted-foreground">El vendedor aún no ha subido documentos.</p> : (
        <ul className="space-y-1 text-sm">
          {docs.map((d) => (
            <li key={d.id}>
              {/* La descarga pasa por una ruta que valida con RLS y entrega una URL firmada de 60 s */}
              <a className="underline" href={`/api/deals/${dealId}/documentos/${d.id}`} rel="noopener">{d.nombre}</a>
              {d.tipo ? <span className="text-xs text-muted-foreground"> · {d.tipo}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
