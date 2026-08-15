import { openCatalogNode, type StacCatalogNode } from "./stac-api";
import { el } from "../panel-dom";

const ROW_CLASS = "geolibre-stac-tree-row";
const STYLE_ID = "geolibre-stac-tree-style";

/**
 * Selection is one attribute and one rule: `aria-selected` says what is chosen and the stylesheet
 * decides what that looks like. Painting a row by hand would hold the same fact in two places,
 * free to disagree, and a highlight left on a row nobody picked misreports the search's scope.
 */
const CSS = `
.${ROW_CLASS} {
  display: flex;
  gap: 4px;
  align-items: center;
  width: 100%;
  padding-block: 2px;
  padding-inline-end: 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.${ROW_CLASS}[aria-selected="true"] {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
`;

const style = {
  tree:
    "min-height:170px;max-height:340px;overflow:auto;resize:vertical;padding:4px;border-radius:5px;" +
    "border:1px solid hsl(var(--border));background:hsl(var(--background));",
  glyph: "width:10px;flex:0 0 auto;color:hsl(var(--muted-foreground));",
  empty: "font-size:10px;color:hsl(var(--muted-foreground));",
} as const;

const GLYPH = { open: "▾", leaf: "•", busy: "…" } as const;

/** A closed folder points the way the text runs, so it mirrors with the rest of the UI. */
function closedGlyph(): string {
  return typeof document !== "undefined" && document.documentElement.dir === "rtl" ? "◂" : "▸";
}

/** Adds the tree's one stylesheet, once per document. */
function ensureStyle(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const sheet = el("style");
  sheet.id = STYLE_ID;
  sheet.textContent = CSS;
  document.head.append(sheet);
}

export interface CatalogTree {
  element: HTMLElement;
  /** Replaces the tree with a new catalog's top-level children. */
  reset: (nodes: StacCatalogNode[]) => void;
  /** Documents of the collections the user has picked, as search entry points. */
  selection: () => string[];
}

/** One row of the tree, and the branch hanging off it. */
interface Row {
  element: HTMLButtonElement;
  box: HTMLDivElement;
  parent?: Row;
  children: Row[];
  open: boolean;
}

export interface CatalogTreeOptions {
  labels: { empty: string; openFailed: string };
  onError: (message: string) => void;
  /** A collection was double-clicked: search it, and go to it if its extent is known. */
  onActivate?: (href: string, bbox?: [number, number, number, number]) => void;
  signal?: AbortSignal;
  /** Reads one node. Injected so the tree can be driven without a network. */
  read?: typeof openCatalogNode;
}

/** A catalog rendered as a tree, reading each node's children only when it is opened. */
export function buildCatalogTree(options: CatalogTreeOptions): CatalogTree {
  const { labels, onError, onActivate, signal, read = openCatalogNode } = options;
  ensureStyle();
  const element = el("div");
  element.style.cssText = style.tree;
  element.setAttribute("role", "tree");
  element.setAttribute("aria-multiselectable", "true");
  // Keyed by row, not by document: the same collection is often linked from two branches, and
  // keying by document would let a click on one row cancel the other.
  const selected = new Map<HTMLElement, string>();
  // A catalog the user has left must not keep writing into the tree that replaced it.
  let generation = 0;
  // Ties each row to the group it opens, which the markup cannot: the group is its sibling.
  let rowCount = 0;

  // The tree built every row, so it keeps its own shape rather than reading it back out of the
  // DOM — and the arrows can then move by parent and child instead of by selector.
  const roots: Row[] = [];

  const everyRow = (within: Row[] = roots): Row[] =>
    within.flatMap((row) => [row, ...everyRow(row.children)]);

  /** The rows a reader can reach: a closed folder hides everything under it. */
  const reachable = (within: Row[] = roots): Row[] =>
    within.flatMap((row) => (row.open ? [row, ...reachable(row.children)] : [row]));

  /** One tab stop for the whole tree: a catalog of hundreds of rows is not hundreds of stops. */
  const focusRow = (row: Row | undefined): void => {
    if (!row) return;
    for (const other of everyRow()) other.element.tabIndex = other === row ? 0 : -1;
    row.element.focus();
  };

  const mark = (row: HTMLElement, on: boolean): void => {
    row.setAttribute("aria-selected", String(on));
  };

  /** Drops the choices inside a subtree being hidden: nothing on screen would show them. */
  const forget = (box: HTMLElement): void => {
    for (const [row] of selected) {
      if (!box.contains(row)) continue;
      selected.delete(row);
      mark(row, false);
    }
  };

  const select = (href: string, row: HTMLElement, additive: boolean): void => {
    // Ctrl/Cmd-click toggles, and so does clicking the one row already chosen — without it a
    // touch user could never undo a choice. Clicking one of several chosen rows narrows to it.
    const toggles = additive || (selected.has(row) && selected.size === 1);
    if (toggles && selected.delete(row)) return mark(row, false);
    if (!additive) {
      for (const [other] of selected) mark(other, false);
      selected.clear();
    }
    selected.set(row, href);
    mark(row, true);
  };

  const addNode = (node: StacCatalogNode, parent: Row | undefined, depth: number): void => {
    const mine = generation;
    const row = el("button");
    row.type = "button";
    row.className = ROW_CLASS;
    row.style.paddingInlineStart = `${4 + depth * 12}px`;
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", "false");
    row.setAttribute("aria-level", String(depth + 1));
    row.tabIndex = roots.length ? -1 : 0;
    const glyph = el("span", node.kind === "collection" ? GLYPH.leaf : closedGlyph());
    glyph.style.cssText = style.glyph;
    row.append(glyph, el("span", node.title));
    const childrenBox = el("div");
    childrenBox.hidden = true;
    childrenBox.setAttribute("role", "group");
    rowCount += 1;
    childrenBox.id = `${ROW_CLASS}-group-${rowCount}`;
    row.setAttribute("aria-owns", childrenBox.id);
    (parent?.box ?? element).append(row, childrenBox);

    const self: Row = { element: row, box: childrenBox, parent, children: [], open: false };
    (parent?.children ?? roots).push(self);

    let kind = node.kind;
    let loaded = false;
    let busy = false;
    let bbox: [number, number, number, number] | undefined;
    if (kind !== "collection") row.setAttribute("aria-expanded", "false");

    const expand = (wanted: boolean): void => {
      if (!wanted) forget(childrenBox);
      self.open = wanted;
      childrenBox.hidden = !wanted;
      row.setAttribute("aria-expanded", String(wanted));
      glyph.textContent = wanted ? GLYPH.open : closedGlyph();
    };

    /**
     * Reads what is inside the node, and chooses it if it turns out to be a collection after all
     * — one that nests still shows what it holds, since the read has already been paid for.
     * A link ending in `collection.json` is taken at its word and never read: every collection in
     * the catalogs this was built against holds items rather than more collections, so a read per
     * row to prove it would cost a request each and show nothing. Such a collection is still
     * searched whole; only its shape stays out of the tree.
     */
    const reveal = async (additive: boolean): Promise<void> => {
      if (busy || loaded) return;
      busy = true;
      glyph.textContent = GLYPH.busy;
      try {
        const opened = await read(node.href, fetch, signal);
        // The catalog this row belongs to may have been replaced while the read was in flight.
        if (mine !== generation) return;
        kind = opened.kind;
        loaded = true;
        bbox = opened.bbox;
        for (const child of opened.children) addNode(child, self, depth + 1);
        if (kind === "collection") select(node.href, row, additive);
        if (opened.children.length) return expand(true);
        if (kind === "collection") {
          glyph.textContent = GLYPH.leaf;
          row.removeAttribute("aria-expanded");
          return;
        }
        const empty = el("div", labels.empty);
        empty.style.cssText = `${style.empty}padding-inline-start:${16 + depth * 12}px;`;
        childrenBox.append(empty);
        expand(true);
      } catch (error) {
        if (mine !== generation || signal?.aborted) return;
        glyph.textContent = closedGlyph();
        // The translated sentence carries the meaning; the raw text says which failure it was.
        const detail = error instanceof Error ? error.message : String(error);
        onError(`${labels.openFailed}: ${detail}`);
      } finally {
        busy = false;
      }
    };

    /** What a click or Space means: choose a collection, or open a folder. */
    const activate = (additive: boolean): void => {
      // Choosing a collection costs no read; only a container has to be opened to be useful.
      // A collection that turned out to hold collections is both, so it does both — otherwise a
      // row could be closed and never opened again, its children out of reach.
      if (kind === "collection") {
        select(node.href, row, additive);
        if (self.children.length) expand(!self.open);
        return;
      }
      if (loaded) return expand(!self.open);
      void reveal(additive);
    };

    row.addEventListener("click", (event) => {
      focusRow(self);
      activate(event.ctrlKey || event.metaKey);
    });

    /** "Show me this one": pick the collection if it is not picked, then ask for its items. */
    const show = (): void => {
      if (kind !== "collection") return;
      if (!selected.has(row)) select(node.href, row, false);
      onActivate?.(node.href, bbox);
    };

    // The second click of a double-click would otherwise toggle the choice back off, so the
    // selection is restored before the search is asked for.
    row.addEventListener("dblclick", show);

    // The arrows walk the tree and work its folders. Enter and Space are left to the button the
    // row is written on, which already chooses; asking for the items takes the modifier.
    row.addEventListener("keydown", (event) => {
      const step = (by: number): void => {
        const list = reachable();
        focusRow(list[list.indexOf(self) + by]);
      };
      const steps: Record<string, () => void> = {
        ArrowDown: () => step(1),
        ArrowUp: () => step(-1),
        ArrowRight: () => {
          if (kind === "collection" && !self.children.length) return;
          if (!self.open) return activate(false);
          focusRow(self.children[0]);
        },
        ArrowLeft: () => {
          if (self.open) return expand(false);
          focusRow(self.parent);
        },
        "Ctrl+Enter": () => (kind === "collection" ? show() : activate(false)),
        Home: () => focusRow(reachable()[0]),
        End: () => focusRow(reachable().at(-1)),
      };
      // A modifier only changes what a key means when there is something for it to mean; holding
      // Ctrl while arrowing should still walk the tree rather than swallow the press.
      const held = event.ctrlKey || event.metaKey;
      const take = (held ? steps[`Ctrl+${event.key}`] : undefined) ?? steps[event.key];
      if (!take) return;
      event.preventDefault();
      take();
    });
  };

  return {
    element,
    reset(nodes) {
      generation += 1;
      element.innerHTML = "";
      selected.clear();
      roots.length = 0;
      for (const node of nodes) addNode(node, undefined, 0);
    },
    selection: () => [...new Set(selected.values())],
  };
}
