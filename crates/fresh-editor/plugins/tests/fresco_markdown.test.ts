import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const plugin = new Bun.Transpiler({ loader: "ts" }).transformSync(readFileSync(new URL("../fresco_markdown.ts", import.meta.url), "utf8"));
const mermaid = "# Diagram\n\n```mermaid\nflowchart TD\n A --> B\n```\n";
function setup(overrides: Record<string, unknown> = {}) {
  const handlers = new Map<string, Function>();
  const hooks = new Map<string, Function>();
  const buffers = new Map<number, any>([[1, { id: 1, path: "/notes/design.md", length: 30, splits: [1] }]]);
  const native = { auto_preview: "all", default_view: "preview", preview_layout: "auto", heading_style: "large", compose: true, ...overrides };
  const splits = new Map([[1, { splitId: 1, bufferId: 1, viewport: { width: 80 } }]]);
  let active = 1;
  let activeSplit = 1;
  let inputMode: string | null = null;
  let content = "# Hello";
  let read: (() => Promise<string>) | undefined;
  const creations: any[] = [];
  const writes: Array<{ id: number; entries: any[] }> = [];
  const renders: Array<{ source: string; width: number; heading: string }> = [];
  const statuses: string[] = [];
  const menus: any[] = [];
  const saved: any[] = [];
  const cursors: any[] = [];
  const modes: any[] = [];
  const create = async (opts: any, split: boolean) => {
    expect(opts.readOnly).toBe(true);
    expect(opts.mode).toBe("fresco-markdown-preview");
    creations.push({ ...opts, split });
    if (split) { activeSplit = 2; splits.set(2, { splitId: 2, bufferId: 10, viewport: { width: 60 } }); }
    else splits.get(activeSplit)!.bufferId = 10;
    buffers.set(10, { id: 10, path: "", length: 0, splits: [activeSplit] });
    active = 10;
    return { bufferId: 10, splitId: split ? 2 : null };
  };
  const editor = {
    getActiveBufferId: () => active,
    getActiveSplitId: () => activeSplit,
    getInputMode: () => inputMode,
    getConfig: () => ({ markdown: native }),
    getBufferInfo: (id: number) => buffers.get(id) ?? null,
    getBufferText: () => read ? read() : Promise.resolve(content),
    getViewport: () => splits.get(activeSplit)!.viewport,
    listSplits: () => [...splits.values()],
    listBuffers: () => [...buffers.values()],
    renderMarkdownPreview: (source: string, width: number, heading: string) => {
      renders.push({ source, width, heading }); return [{ text: `rendered:${source}` }];
    },
    createVirtualBufferInSplit: (opts: any) => create(opts, true),
    createVirtualBuffer: (opts: any) => create(opts, false),
    setVirtualBufferContent: (id: number, entries: any[]) => writes.push({ id, entries }),
    getTextPropertiesAtCursor: () => [{ sourceLine: 2 }],
    getLineStartPosition: async (line: number) => line * 10,
    setBufferCursor: (id: number, position: number) => cursors.push({ id, position }),
    setStatus: (text: string) => statuses.push(text),
    debug: () => {},
    setContext: () => true,
    focusSplit: (id: number) => { activeSplit = id; active = splits.get(id)!.bufferId; },
    setSplitBuffer: (id: number, buffer: number) => { splits.get(id)!.bufferId = buffer; if (activeSplit === id) active = buffer; },
    moveBufferToSplit: (buffer: number, id: number) => { splits.get(id)!.bufferId = buffer; active = buffer; },
    setViewMode: (id: number, mode: string) => { buffers.get(id).view_mode = mode; },
    closeBuffer: (id: number) => buffers.delete(id),
    closeSplit: (id: number) => splits.delete(id),
    setLineWrap: () => true,
    flush: async () => {},
    registerCommand: () => true,
    exportPluginApi: () => true,
    defineMode: (...args: any[]) => modes.push(args),
    addMenuItem: (item: any) => menus.push(item),
    saveSetting: (path: string, value: any) => { saved.push({ path, value }); native[path.slice(9)] = value; return true; },
    executeAction: () => true,
    on: (name: string, callback: Function) => hooks.set(name, callback),
    setTimeout: () => 1,
    clearInterval: () => true,
  };
  new Function("getEditor", "registerHandler", plugin)(() => editor, (name: string, fn: Function) => handlers.set(name, fn));
  return {
    run: (name: string) => handlers.get(name)!(),
    open: () => handlers.get("frescoMarkdownOpen")!(),
    autoOpen: () => handlers.get("frescoMarkdownAutoOpen")!(),
    flush: () => handlers.get("frescoMarkdownRefresh")!(),
    emit: (name: string, buffer_id = 1) => hooks.get(name)!({ buffer_id }),
    buffers, splits, writes, renders, statuses, creations, native, menus, saved, cursors, modes,
    active: () => active,
    setActive: (value: number) => { active = value; splits.get(activeSplit)!.bufferId = value; },
    setInputMode: (value: string) => { inputMode = value; },
    setWidth: (value: number) => { splits.get(activeSplit)!.viewport.width = value; },
    setContent: (value: string) => { content = value; },
    setRead: (value: (() => Promise<string>) | undefined) => { read = value; },
  };
}
describe("native Markdown reader", () => {
  test("defaults to a full-pane reader for ordinary Markdown", async () => {
    const app = setup(); await app.autoOpen();
    expect(app.creations[0].split).toBe(false);
    expect(app.renders[0]).toEqual({ source: "# Hello", width: 78, heading: "large" });
  });
  test("edit mode and automatic-preview off preserve editing", async () => {
    for (const config of [{ default_view: "edit" }, { auto_preview: "off" }]) {
      const app = setup(config); app.setContent(mermaid); await app.autoOpen(); expect(app.creations).toHaveLength(0);
    }
  });
  test("Mermaid-only preference ignores plain Markdown", async () => {
    const plain = setup({ auto_preview: "mermaid" }); await plain.autoOpen(); expect(plain.creations).toHaveLength(0);
    const diagram = setup({ auto_preview: "mermaid" }); diagram.setContent(mermaid); await diagram.autoOpen(); expect(diagram.creations).toHaveLength(1);
  });
  test("automatic split layout protects width in narrow panes", async () => {
    const narrow = setup({ default_view: "split" }); await narrow.open(); expect(narrow.creations[0].direction).toBe("horizontal");
    const wide = setup({ default_view: "split" }); wide.setWidth(160); await wide.open(); expect(wide.creations[0].direction).toBe("vertical");
  });
  test("returning to source restores editing at the mapped source line", async () => {
    const app = setup(); await app.autoOpen(); await app.run("frescoMarkdownReturnSource");
    expect(app.active()).toBe(1); expect(app.buffers.get(1).view_mode).toBe("source");
    expect(app.cursors.at(-1)).toEqual({ id: 1, position: 20 });
    await app.emit("buffer_activated"); expect(app.creations).toHaveLength(1);
    await app.open(); expect(app.active()).toBe(10); expect(app.creations).toHaveLength(1);
  });
  test("insert mode returns to source and prevents automatic reopening", async () => {
    const app = setup(); await app.open(); app.setInputMode("vi-insert"); await app.emit("input_mode_changed");
    expect(app.active()).toBe(1); await app.autoOpen(); expect(app.creations).toHaveLength(1);
    const already = setup(); already.setInputMode("vi-insert"); await already.autoOpen(); expect(already.creations).toHaveLength(0);
  });
  test("preview navigation bindings and View menu actions are registered", () => {
    const app = setup();
    expect(app.modes[0][1]).toContainEqual(["Insert", "frescoMarkdownReturnSource"]);
    expect(app.menus.some((m) => m.menu === "View" && m.action === "frescoMarkdownOpen")).toBe(true);
    expect(app.menus.some((m) => m.action === "frescoMarkdownSettings")).toBe(true);
  });
  test("heading preferences persist and repaint existing readers", async () => {
    const app = setup(); await app.open(); app.run("frescoMarkdownToggleHeadings"); await app.run("frescoMarkdownApplySettings"); await app.flush();
    expect(app.saved).toContainEqual({ path: "markdown.heading_style", value: "compact" });
    expect(app.renders.at(-1)?.heading).toBe("compact");
  });
  test("explicit split command converts a full-pane reader", async () => {
    const app = setup(); await app.open(); await app.run("frescoMarkdownSplit");
    expect(app.creations).toHaveLength(2); expect(app.creations[1].split).toBe(true);
  });
  test("explicit Edit cancels a pending automatic reader before one exists", async () => {
    const app = setup(); let resolveRead!: (text: string) => void;
    app.setRead(() => new Promise((resolve) => { resolveRead = resolve; }));
    const pending = app.autoOpen(); await app.run("frescoMarkdownReturnSource"); resolveRead(mermaid); await pending;
    expect(app.creations).toHaveLength(0); expect(app.buffers.get(1).view_mode).toBe("source");
  });
  test("live edits, undo, reload and resize refresh the existing reader", async () => {
    const app = setup(); await app.open();
    for (const event of ["after_insert", "after_delete", "buffer_modified", "after_file_revert", "after_file_save"]) {
      app.setContent(event); app.emit(event); await app.flush(); expect(app.renders.at(-1)?.source).toBe(event);
    }
    app.setWidth(55); app.emit("viewport_changed", 10); await app.flush(); expect(app.renders.at(-1)?.width).toBe(53);
  });
  test("stale asynchronous reads cannot overwrite a newer edit", async () => {
    const app = setup(); await app.open(); let resolveRead!: (text: string) => void;
    app.setRead(() => new Promise((resolve) => { resolveRead = resolve; }));
    app.emit("after_insert"); const pending = app.flush(); app.emit("after_insert"); resolveRead("stale"); await pending;
    expect(app.renders.some((render) => render.source === "stale")).toBe(false);
    app.setRead(undefined); app.setContent("current"); await app.flush(); expect(app.renders.at(-1)?.source).toBe("current");
  });
  test("a delayed automatic read cannot steal focus", async () => {
    const app = setup(); let resolveRead!: (text: string) => void;
    app.setRead(() => new Promise((resolve) => { resolveRead = resolve; }));
    const pending = app.autoOpen(); app.setActive(2); resolveRead(mermaid); await pending; expect(app.creations).toHaveLength(0);
  });
  test("closed readers stay closed when the source is activated", async () => {
    const app = setup(); await app.open(); await app.run("frescoMarkdownClose"); await app.emit("buffer_activated");
    expect(app.creations).toHaveLength(1); expect(app.buffers.has(10)).toBe(false);
  });
  test("closing the source stops refreshes and explains the stale reader", async () => {
    const app = setup(); await app.open(); app.emit("buffer_closed"); app.emit("after_insert"); await app.flush();
    expect(app.renders).toHaveLength(1); expect(app.writes.at(-1)?.entries[0].text).toContain("Source closed");
  });
  test("oversized input is refused before allocation", async () => {
    const app = setup(); app.buffers.get(1).length = 256 * 1024 + 1; await app.open(); expect(app.creations).toHaveLength(0);
  });
  test("concurrent commands reuse one reader", async () => {
    const app = setup(); await Promise.all([app.open(), app.open()]); expect(app.creations).toHaveLength(1);
  });
});
