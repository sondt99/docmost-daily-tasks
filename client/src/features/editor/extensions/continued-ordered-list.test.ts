import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import {
  ContinuedOrderedList,
  computeOrderedListStarts,
} from "./continued-ordered-list";

function docFrom(html: string) {
  const editor = new Editor({
    extensions: [StarterKit, TaskList, TaskItem, ContinuedOrderedList],
    content: html,
  });
  const doc = editor.state.doc;
  editor.destroy();
  return doc;
}

/** The start number each numbered list is rendered with, in document order. */
function starts(html: string): number[] {
  const doc = docFrom(html);
  const byPos = new Map(
    computeOrderedListStarts(doc).map(({ pos, start }) => [pos, start]),
  );

  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "orderedList") out.push(byPos.get(pos) ?? 1);
  });
  return out;
}

describe("a numbered list counting across what is written inside it", () => {
  it("keeps counting past bullets belonging to the point above", () => {
    expect(
      starts(`
        <ol><li><p>Ship the blog post</p></li></ol>
        <ul><li><p>proof-read it</p></li><li><p>check the grammar</p></li></ul>
        <ol><li><p>Harden the lookup tool</p></li></ol>
      `),
    ).toEqual([1, 2]);
  });

  it("keeps counting past a blank line", () => {
    expect(
      starts(`
        <ol><li><p>one</p></li></ol>
        <p></p>
        <ol><li><p>two</p></li><li><p>three</p></li></ol>
      `),
    ).toEqual([1, 2]);
  });

  it("counts every item of the earlier lists, not just the lists", () => {
    expect(
      starts(`
        <ol><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ol>
        <ul><li><p>note</p></li></ul>
        <ol><li><p>d</p></li></ol>
      `),
    ).toEqual([1, 4]);
  });

  it("keeps counting past tick boxes", () => {
    expect(
      starts(`
        <ol><li><p>one</p></li></ol>
        <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>sub</p></li></ul>
        <ol><li><p>two</p></li></ol>
      `),
    ).toEqual([1, 2]);
  });

  it("starts again after a heading, because that is a new topic", () => {
    expect(
      starts(`
        <ol><li><p>one</p></li></ol>
        <h2>Ghi chú</h2>
        <ol><li><p>one again</p></li></ol>
      `),
    ).toEqual([1, 1]);
  });

  it("starts again after a paragraph that says something", () => {
    expect(
      starts(`
        <ol><li><p>one</p></li></ol>
        <p>And separately:</p>
        <ol><li><p>one again</p></li></ol>
      `),
    ).toEqual([1, 1]);
  });

  it("does not let a list inside another list join the outer count", () => {
    // The inner list is a point's own sub-numbering and starts at one.
    const html = `
      <ol><li><p>outer one</p><ol><li><p>inner</p></li></ol></li></ol>
      <ul><li><p>note</p></li></ul>
      <ol><li><p>outer two</p></li></ol>
    `;
    expect(starts(html)).toEqual([1, 1, 2]);
  });

  it("leaves a document with one list alone", () => {
    expect(starts(`<ol><li><p>only</p></li></ol>`)).toEqual([1]);
    expect(computeOrderedListStarts(docFrom(`<p>no lists</p>`))).toEqual([]);
  });

  it("handles three runs in a row", () => {
    expect(
      starts(`
        <ol><li><p>a</p></li></ol>
        <ul><li><p>x</p></li></ul>
        <ol><li><p>b</p></li></ol>
        <ul><li><p>y</p></li></ul>
        <ol><li><p>c</p></li></ol>
      `),
    ).toEqual([1, 2, 3]);
  });

  it("renders the start attribute on the page", () => {
    const editor = new Editor({
      extensions: [StarterKit, TaskList, TaskItem, ContinuedOrderedList],
      content: `
        <ol><li><p>one</p></li></ol>
        <ul><li><p>note</p></li></ul>
        <ol><li><p>two</p></li></ol>
      `,
    });

    const lists = editor.view.dom.querySelectorAll("ol");
    expect(lists.length).toBe(2);
    expect(lists[1].getAttribute("start")).toBe("2");
    editor.destroy();
  });

  it("does not change the document it is numbering", () => {
    const html = `
      <ol><li><p>one</p></li></ol>
      <ul><li><p>note</p></li></ul>
      <ol><li><p>two</p></li></ol>
    `;
    const editor = new Editor({
      extensions: [StarterKit, TaskList, TaskItem, ContinuedOrderedList],
      content: html,
    });
    const before = JSON.stringify(editor.getJSON());

    // A render pass has happened by now; the stored document must be untouched,
    // or every page would be rewritten the moment someone opened it.
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(editor.getJSON().content?.[2]?.attrs?.start).toBe(1);
    editor.destroy();
  });
});
