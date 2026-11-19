export const AVISO_LEGAL =
  "DealMX es una plataforma de contacto: no es asesor de inversiones. Las cifras las proporciona el vendedor y no están verificadas por DealMX.";

export function LegalFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-muted px-4 py-6 text-sm text-muted-foreground">
      <div className="mx-auto max-w-6xl space-y-2">
        <p role="note"><strong>Aviso legal:</strong> {AVISO_LEGAL}</p>
        <nav className="flex gap-4">
          <a className="underline" href="/legal/aviso-legal">Aviso legal</a>
          <a className="underline" href="/legal/privacidad">Aviso de privacidad</a>
        </nav>
      </div>
    </footer>
  );
}
