import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const plugin = new Bun.Transpiler({ loader: "ts" }).transformSync(
  readFileSync(new URL("../fresco_markdown.ts", import.meta.url), "utf8"),
);

function setup(autoPreviewMermaid = true) {
  const handlers = new Map<string, Function>();
  const hooks = new Map<string, Function>();
  const buffers = new Map<number, { path: string; length: number }>([
    [1, { path: "/notes/design.md", length: 30 }],
  ]);
  let active = 1;
  let width = 80;
  let content = "# Hello";
  let creates = 0;
  let read: (() => Promise<string>) | undefined;
  const writes: Array<{ id: number; entries: Array<{ text: string }> }> = [];
  const renders: Array<{ source: string; width: number }> = [];
  const statuses: string[] = [];
  const editor = {
    getActiveBufferId: () => active,
    getBufferInfo: (id: number) => buffers.get(id) ?? null,
    getBufferText: () => read ? read() : Promise.resolve(content),
    listSplits: () => [{ splitId: 2, bufferId: 10, viewport: { width } }],
    renderMarkdownPreview: (source: string, width: number) => {
      renders.push({ source, width });
      return [{ text: `rendered:${source}` }];
    },
    createVirtualBufferInSplit: async (opts: any) => {
      expect(opts.readOnly).toBe(true);
      expect(opts.editingDisabled).toBe(true);
      creates++;
      buffers.set(10, { path: "", length: 0 });
      return { bufferId: 10, splitId: 2 };
    },
    setVirtualBufferContent: (id: number, entries: Array<{ text: string }>) => writes.push({ id, entries }),
    setStatus: (text: string) => statuses.push(text),
    debug: () => {},
    focusSplit: () => {},
    registerCommand: () => true,
    exportPluginApi: () => true,
    defineConfigBoolean: () => autoPreviewMermaid,
    getPluginConfig: () => ({ autoPreviewMermaid }),
    on: (name: string, callback: Function) => hooks.set(name, callback),
    setTimeout: () => 1,
    clearInterval: () => true,
  };
  new Function("getEditor", "registerHandler", plugin)(() => editor, (name: string, fn: Function) => handlers.set(name, fn));
  return {
    open: () => handlers.get("frescoMarkdownOpen")!(),
    autoOpen: () => handlers.get("frescoMarkdownAutoOpen")!(),
    flush: () => handlers.get("frescoMarkdownRefresh")!(),
    emit: (name: string, buffer_id = 1) => hooks.get(name)!({ buffer_id }),
    buffers, writes, renders, statuses,
    creates: () => creates,
    setActive: (value: number) => { active = value; },
    setWidth: (value: number) => { width = value; },
    setContent: (value: string) => { content = value; },
    setRead: (value: (() => Promise<string>) | undefined) => { read = value; },
  };
}

describe("Fresco live Markdown preview", () => {
  test("first viewing Mermaid opens its rendered preview without a command", async () => {
    const app = setup();
    app.setContent("# Diagram\n\n```mermaid\nflowchart TD\n A --> B\n```\n");
    await app.autoOpen();
    expect(app.creates()).toBe(1);
    expect(app.renders[0].source).toContain("flowchart TD");
    await app.emit("buffer_activated");
    expect(app.creates()).toBe(1);
  });

  test("ordinary Markdown and opted-out files stay in the source pane", async () => {
    const plain = setup();
    await plain.autoOpen();
    expect(plain.creates()).toBe(0);
    const disabled = setup(false);
    disabled.setContent("```mermaid\nflowchart TD\n A --> B\n```\n");
    await disabled.autoOpen();
    expect(disabled.creates()).toBe(0);
  });

  test("closing an automatic preview respects the choice to edit source", async () => {
    const app = setup();
    app.setContent("~~~mermaid\nflowchart TD\n A --> B\n~~~\n");
    await app.autoOpen();
    app.emit("buffer_closed", 10);
    app.buffers.delete(10);
    await app.emit("buffer_activated");
    expect(app.creates()).toBe(1);
  });

  test("a delayed automatic read cannot steal focus from another file", async () => {
    const app = setup();
    let resolveRead!: (text: string) => void;
    app.setRead(() => new Promise((resolve) => { resolveRead = resolve; }));
    const pending = app.autoOpen();
    app.setActive(2);
    resolveRead("```mermaid\nflowchart TD\n A --> B\n```\n");
    await pending;
    expect(app.creates()).toBe(0);
  });

  test("opens a read-only split and reuses it from source or preview", async () => {
    const app = setup();
    await app.open();
    await app.open();
    app.setActive(10);
    await app.open();
    expect(app.creates()).toBe(1);
    expect(app.renders[0]).toEqual({ source: "# Hello", width: 78 });
    expect(app.writes.every((write) => write.id === 10)).toBe(true);
  });

  test("refreshes edits, undo, reload and resize", async () => {
    const app = setup();
    await app.open();
    for (const event of ["after_insert", "after_delete", "buffer_modified", "after_file_revert", "after_file_save"]) {
      app.setContent(event);
      app.emit(event);
      await app.flush();
      expect(app.renders.at(-1)?.source).toBe(event);
    }
    app.setWidth(55);
    app.emit("viewport_changed", 10);
    await app.flush();
    expect(app.renders.at(-1)?.width).toBe(53);
  });

  test("rejects stale asynchronous reads after another edit", async () => {
    const app = setup();
    await app.open();
    let resolveRead!: (text: string) => void;
    app.setRead(() => new Promise((resolve) => { resolveRead = resolve; }));
    app.emit("after_insert");
    const pending = app.flush();
    app.emit("after_insert");
    resolveRead("stale");
    await pending;
    expect(app.renders.some((render) => render.source === "stale")).toBe(false);
    app.setRead(undefined);
    app.setContent("fresh");
    await app.flush();
    expect(app.renders.at(-1)?.source).toBe("fresh");
  });

  test("closing a source invalidates in-flight work and stops refresh", async () => {
    const app = setup();
    await app.open();
    app.emit("buffer_closed");
    app.emit("after_insert");
    await app.flush();
    expect(app.renders.length).toBe(1);
    expect(app.writes.at(-1)?.entries[0].text).toContain("Source closed");
  });

  test("blocks oversized documents before reading or opening a split", async () => {
    const app = setup();
    app.buffers.set(1, { path: "/big.md", length: 256 * 1024 + 1 });
    await app.open();
    expect(app.creates()).toBe(0);
    expect(app.statuses.at(-1)).toContain("256 KiB");
  });

  test("concurrent open commands create only one preview", async () => {
    const app = setup();
    await Promise.all([app.open(), app.open()]);
    expect(app.creates()).toBe(1);
  });
});
