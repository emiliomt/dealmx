"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import { formatMdp } from "@/lib/format";
import { SEGMENTOS, type SegmentoKey } from "@/lib/catalogos";

export interface Punto { id: string; titulo: string; lat: number; lng: number; precio: number | null; segmento: SegmentoKey }

/**
 * Estilo por defecto: mosaicos públicos de OpenStreetMap, SOLO para desarrollo/demos
 * (su política no permite tráfico de producción). En producción define NEXT_PUBLIC_MAP_STYLE_URL
 * con un style.json de un proveedor compatible con MapLibre.
 */
const ESTILO_DEV: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© Colaboradores de OpenStreetMap" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
const CENTRO_MTY: [number, number] = [-100.31, 25.67];

function geojson(puntos: Punto[]) {
  return {
    type: "FeatureCollection" as const,
    features: puntos.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id, titulo: p.titulo, precio: p.precio, segmento: p.segmento },
    })),
  };
}

/** Mapa de deals con clusters. Solo recibe coordenadas APROXIMADAS (públicas). */
export function MapaDeals({ puntos, className }: { puntos: Punto[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const puntosRef = useRef(puntos);
  puntosRef.current = puntos;

  const aplicar = (map: MLMap, ps: Punto[], ml: typeof import("maplibre-gl")) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map.getSource("deals") as any)?.setData(geojson(ps));
    if (ps.length > 0) {
      const b = new ml.LngLatBounds([ps[0].lng, ps[0].lat], [ps[0].lng, ps[0].lat]);
      ps.forEach((p) => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 50, maxZoom: 14, duration: 0 });
    }
  };

  useEffect(() => {
    let cancelado = false;
    let map: MLMap | undefined;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelado || !el.current) return;
      const container = el.current;
      map = new ml.Map({ container, style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || ESTILO_DEV, center: CENTRO_MTY, zoom: 9, attributionControl: { compact: true } });
      mapRef.current = map;
      if (process.env.NEXT_PUBLIC_E2E === "1") (window as unknown as { __map?: MLMap }).__map = map;
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        const m = map!;
        m.addSource("deals", { type: "geojson", data: geojson(puntosRef.current), cluster: true, clusterRadius: 45, clusterMaxZoom: 14 });
        m.addLayer({
          id: "clusters", type: "circle", source: "deals", filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"], "#3b82f6", 10, "#1d4ed8", 30, "#1e3a8a"],
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 20, 30, 28],
            "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
          },
        });
        m.addLayer({
          id: "puntos", type: "circle", source: "deals", filter: ["!", ["has", "point_count"]],
          paint: { "circle-color": "#1e3a8a", "circle-radius": 8, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
        });

        m.on("click", "clusters", async (e) => {
          const f = m.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
          if (!f) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const zoom = await (m.getSource("deals") as any).getClusterExpansionZoom(f.properties?.cluster_id);
          m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        });
        m.on("click", "puntos", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { id: string; titulo: string; precio: number | null; segmento: SegmentoKey };
          // DOM con textContent: el título lo escribe el vendedor, nunca se inyecta como HTML.
          const box = document.createElement("div");
          box.style.cssText = "font:13px system-ui;max-width:220px";
          const t = document.createElement("strong"); t.textContent = p.titulo;
          const s = document.createElement("div"); s.textContent = `${SEGMENTOS[p.segmento] ?? ""}${p.precio != null ? ` · ${formatMdp(Number(p.precio))}` : ""}`;
          const a = document.createElement("a"); a.href = `/deal/${encodeURIComponent(p.id)}`; a.textContent = "Ver ficha"; a.style.cssText = "color:#1d4ed8;text-decoration:underline";
          box.append(t, s, a);
          new ml.Popup({ offset: 12 }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setDOMContent(box).addTo(m);
        });
        for (const capa of ["clusters", "puntos"]) {
          m.on("mouseenter", capa, () => { m.getCanvas().style.cursor = "pointer"; });
          m.on("mouseleave", capa, () => { m.getCanvas().style.cursor = ""; });
        }
        aplicar(m, puntosRef.current, ml);
        container.dataset.ready = "true";
      });
    })();
    return () => { cancelado = true; mapRef.current = null; map?.remove(); };
  }, []);

  // Cambios de filtros: actualiza datos y encuadre sin recrear el mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getSource("deals")) import("maplibre-gl").then((ml) => aplicar(map, puntos, ml));
  }, [puntos]);

  return <div ref={el} className={className} role="region" aria-label={`Mapa con ${puntos.length} oportunidades`} data-points={puntos.length} />;
}
