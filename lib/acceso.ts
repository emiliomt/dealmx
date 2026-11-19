/**
 * ¿Debe la interfaz mostrar la sección confidencial (y el data room)? Es una decisión de PRESENTACIÓN:
 * los datos reales los filtra RLS (cada consulta solo devuelve filas autorizadas), así que equivocarse aquí
 * nunca expone nada; solo cambiaría qué panel se pinta.
 *
 * Importante: NO depende de que exista la fila `deal_private` (un vendedor puede publicar sin haberla creado), porque
 * las políticas de `deal_documents` autorizan por NDA de forma independiente.
 */
export function puedeVerPrivado(a: { esDueno: boolean; esAdmin: boolean; ndaEstado: string | null | undefined; tienePrivado: boolean }): boolean {
  return a.esDueno || a.esAdmin || a.ndaEstado === "aprobado" || a.tienePrivado;
}
