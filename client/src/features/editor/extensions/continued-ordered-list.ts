import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Node as PmNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Keeps a numbered list counting across the things written inside it.
 *
 * ProseMirror stores a numbered list as one node, and a node ends where
 * something that is not part of it begins. So writing
 *
 *     1. Ship the blog post
 *        - proof-read it
 *        - check the grammar
 *     1. Harden the lookup tool          <- wanted: 2.
 *
 * leaves two separate lists, each numbered from one, because the bullets in
 * between closed the first. The document is not wrong, but the page reads
 * as though the writer lost count.
 *
 * Rather than rewrite the document, this renders it differently: a run of
 * numbered lists separated only by sub-material gets a `start` attribute so
 * the browser keeps counting. Nothing is saved, nothing syncs to anyone
 * else's editor, and the fix disappears cleanly if this extension is removed.
 *
 * Writing it into the document was the other option and a worse one: every
 * page would be rewritten the moment it was opened, which marks it changed,
 * pushes an edit to everyone with it open, and buries a real change in the
 * history behind a cosmetic one.
 */

/** What may sit between two numbered lists without breaking the count. */
function isSubMaterial(node: PmNode): boolean {
  const name = node.type.name;
  // Bullets and tick boxes under a numbered point belong to that point.
  if (name === "bulletList" || name === "taskList") return true;
  // A blank line is how people space a list out; it says nothing.
  if (name === "paragraph" && node.content.size === 0) return true;
  return false;
}

export type OrderedListStart = { pos: number; start: number };

/**
 * Where each numbered list should start counting.
 *
 * Only lists that continue a previous one are returned; a list that starts
 * a fresh count is left out, since one is already its default.
 *
 * Anything that carries words of its own ends the run: a heading, a
 * paragraph with text, a quote, a table. Those mark a new topic, and a list
 * after a new topic starts at one.
 */
export function computeOrderedListStarts(doc: PmNode): OrderedListStart[] {
  const out: OrderedListStart[] = [];

  const scan = (parent: PmNode, contentStart: number) => {
    let counted = 0;
    let inRun = false;

    parent.forEach((child, offset) => {
      const pos = contentStart + offset;
      const name = child.type.name;

      if (name === "orderedList") {
        if (inRun && counted > 0) out.push({ pos, start: counted + 1 });
        counted += child.childCount;
        inRun = true;
      } else if (!isSubMaterial(child)) {
        counted = 0;
        inRun = false;
      }

      // A list nested inside another list counts on its own, so each parent
      // is scanned separately rather than one running count for the page.
      if (child.childCount) scan(child, pos + 1);
    });
  };

  scan(doc, 0);
  return out;
}

export const ContinuedOrderedList = Extension.create({
  name: "continuedOrderedList",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("continuedOrderedList"),
        props: {
          decorations(state) {
            const starts = computeOrderedListStarts(state.doc);
            if (!starts.length) return DecorationSet.empty;

            return DecorationSet.create(
              state.doc,
              starts.map(({ pos, start }) =>
                Decoration.node(pos, pos + state.doc.nodeAt(pos)!.nodeSize, {
                  start: String(start),
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});

export default ContinuedOrderedList;
