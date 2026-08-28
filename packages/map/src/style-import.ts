/**
 * Reading symbology authored elsewhere — QGIS, GeoServer, another map, or a style GeoLibre itself
 * exported — off a piece of text.
 *
 * Its own subpath (`@geolibre/map/style-import`) rather than the package index, for two reasons.
 * The index reaches MapLibre's stylesheet, which `node --test` cannot load, so a test for the
 * format detection would need a browser; and `packages/plugins` cannot import from `apps/`, so
 * anything living in the desktop app is out of reach of the STAC and PMTiles doors that need to
 * apply a catalog's published style. The three parsers below pull only `@geolibre/core`,
 * `fast-xml-parser` and sibling pure modules — no `maplibre-gl` — so this entry stays resolvable
 * under the test runner.
 *
 * `StyleManagerPanel` still sniffs formats itself. It routes JSON to `parseStyleLibrary` rather
 * than `parseMapboxStyle`, so folding it in here is a behaviour change, not a move.
 */

import type { LayerStyle } from "@geolibre/core";
import { applyMapboxStyleImport, parseMapboxStyle } from "./mapbox-style-import";
import { applySldImport, parseSld } from "./sld-import";
import { applyQmlImport, parseQml } from "./qml-import";

/**
 * Whether an XML style document is a QGIS QML (as opposed to an OGC SLD): a QML has a `<qgis>` or
 * `<renderer-v2>` root element.
 *
 * Exported because the Style Manager's library import sniffs the same way and the two must not
 * drift on the heuristic.
 *
 * @param text - The file content (already known to be XML).
 * @returns True for QGIS QML, false for other XML dialects (e.g. SLD).
 */
export function isQmlStyleXml(text: string): boolean {
  return /<qgis[\s>]|<renderer-v2[\s>]/.test(text);
}

/** A style that was read, and what it does to a layer's existing symbology. */
export interface ImportedStyle {
  ok: true;
  /** Merged onto the layer's current style rather than replacing it wholesale. */
  apply: (base: LayerStyle) => LayerStyle;
  /** What the style asked for that GeoLibre could not represent. Surfaced, never dropped. */
  warnings: string[];
}

/**
 * `invalid` — the text is not a style in any format read here, so there is nothing to report but
 * that. `no-match` — it parsed, but nothing in it describes symbology this layer can wear, and the
 * parser usually said why.
 */
export type ImportedStyleError =
  | { ok: false; reason: "invalid" }
  | {
      ok: false;
      reason: "no-match";
      /** The parser's own words, when it had any; better than a generic message. */
      warning?: string;
    };

/**
 * Read a style from text.
 *
 * The format comes from the content rather than a file extension, since a `.xml` can hold either
 * XML dialect: a QGIS QML has a `<qgis>`/`renderer-v2` root, an SLD a `StyledLayerDescriptor` root,
 * and everything else — including a `.geolibre.style.json` export — is Mapbox GL style JSON. A
 * Mapbox style's source binding is deliberately ignored: importing dresses the chosen layer,
 * wherever the style's author happened to point it.
 */
export function importStyleText(text: string): ImportedStyle | ImportedStyleError {
  // Only the first non-whitespace character decides. A Mapbox style is free to carry `<` inside a
  // label expression, and reading that as XML would hand the document to the wrong parser. Matched
  // rather than `trimStart().startsWith("<")` so a multi-megabyte catalog style is not copied whole
  // to look at one character.
  const isXml = /^\s*</.test(text);

  /** One shape for all three formats: nothing matched, or a patch and whatever went unread. */
  const read = (
    result: { warnings: string[] },
    matched: number,
    apply: (base: LayerStyle) => LayerStyle,
  ): ImportedStyle | ImportedStyleError =>
    matched === 0
      ? {
          ok: false,
          reason: "no-match",
          ...(result.warnings[0] ? { warning: result.warnings[0] } : {}),
        }
      : { ok: true, apply, warnings: result.warnings };

  if (isXml && isQmlStyleXml(text)) {
    const result = parseQml(text);
    return read(result, result.matchedRuleCount, (base) => applyQmlImport(base, result));
  }

  if (isXml) {
    const result = parseSld(text);
    return read(result, result.matchedRuleCount, (base) => applySldImport(base, result));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const result = parseMapboxStyle(parsed);
  return read(result, result.matchedLayerCount, (base) => applyMapboxStyleImport(base, result));
}
