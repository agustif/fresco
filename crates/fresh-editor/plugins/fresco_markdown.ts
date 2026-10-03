/// <reference path="./lib/fresh.d.ts" />
// Fresco's read-only live Markdown reader. Source buffers remain the editing authority.
const editor = getEditor();
editor.exportPluginApi("fresco-markdown", { defaultCompose: true });
editor.defineConfigBoolean("autoPreviewMermaid", {
  default: true,
  description: "Automatically open the live preview when first viewing a Markdown file containing Mermaid diagrams.",
});

interface Preview {
  source: number;
  buffer: number;
  split: number;
  revision: number;
  width: number;
}
const previews = new Map<number, Preview>();
const opening = new Set<number>();
const autoConsidered = new Set<number>();
const dirty = new Set<number>();
const MAX_BYTES = 256 * 1024;
let timer: number | null = null;

function previewWidth(preview: Preview): number {
  const split = editor.listSplits().find((item) => item.splitId === preview.split);
  return Math.max(20, Math.min(240, (split?.viewport.width ?? 80) - 2));
}

async function refresh(preview: Preview): Promise<void> {
  const revision = ++preview.revision;
  try {
    const info = editor.getBufferInfo(preview.source);
    if (!info || !editor.getBufferInfo(preview.buffer)) return;
    if (info.length > MAX_BYTES) throw new Error("Preview is limited to 256 KiB; use compose mode for larger files.");
    const source = await editor.getBufferText(preview.source);
    if (revision !== preview.revision || previews.get(preview.source) !== preview) return;
    preview.width = previewWidth(preview);
    const entries = editor.renderMarkdownPreview(source, preview.width);
    editor.setVirtualBufferContent(preview.buffer, entries);
  } catch (error) {
    editor.debug(`Fresco Markdown preview failed: ${String(error)}`);
    if (revision === preview.revision && previews.get(preview.source) === preview) {
      editor.setVirtualBufferContent(preview.buffer, [{ text: `Preview unavailable\n\n${String(error)}\n` }]);
      editor.setStatus(`Fresco Markdown: ${String(error)}`);
    }
  }
}

async function flush(): Promise<void> {
  timer = null;
  const sources = [...dirty];
  dirty.clear();
  for (const source of sources) {
    const preview = previews.get(source);
    if (preview) await refresh(preview);
  }
}
registerHandler("frescoMarkdownRefresh", flush);

function schedule(source: number): void {
  const preview = previews.get(source);
  if (!preview) return;
  // Invalidate any pending asynchronous buffer read before scheduling its replacement.
  preview.revision++;
  dirty.add(source);
  if (timer !== null) editor.clearInterval(timer);
  timer = editor.setTimeout(180, "frescoMarkdownRefresh");
}

async function openPreview(): Promise<void> {
  const active = editor.getActiveBufferId();
  const existing = previews.get(active) ?? [...previews.values()].find((p) => p.buffer === active);
  if (existing && editor.getBufferInfo(existing.buffer)) {
    editor.focusSplit(existing.split);
    await refresh(existing);
    return;
  }
  const info = editor.getBufferInfo(active);
  if (!info || !/\.(md|markdown|mdown)$/i.test(info.path)) {
    editor.setStatus("Open a Markdown file, then run Fresco Markdown: Open Live Preview.");
    return;
  }
  if (info.length > MAX_BYTES) {
    editor.setStatus("Preview is limited to 256 KiB; compose mode remains available.");
    return;
  }
  if (opening.has(active)) return;
  opening.add(active);
  try {
    const result = await editor.createVirtualBufferInSplit({
      name: `Preview: ${info.path.split(/[\\/]/).pop()}`,
      direction: "vertical", ratio: 0.5,
      readOnly: true, editingDisabled: true, showLineNumbers: false,
      showCursors: false, lineWrap: true,
      entries: [{ text: "Rendering Markdown…\n" }],
    });
    if (result.splitId === null) throw new Error("Could not create preview split");
    const preview: Preview = { source: active, buffer: result.bufferId, split: result.splitId, revision: 0, width: 0 };
    previews.set(active, preview);
    await refresh(preview);
  } catch (error) {
    editor.setStatus(`Fresco Markdown: ${String(error)}`);
    editor.debug(`Fresco Markdown could not open preview: ${String(error)}`);
  } finally {
    opening.delete(active);
  }
}
registerHandler("frescoMarkdownOpen", openPreview);
editor.registerCommand(
  "Fresco Markdown: Open Live Preview",
  "Read Markdown with styled headings, tables, math, and Mermaid text diagrams; updates as you edit",
  "frescoMarkdownOpen",
);

// Consider each source once. Closing its preview is a deliberate choice and
// returning to the source pane must never reopen it or steal editing focus.
async function autoPreview(bufferId: number): Promise<void> {
  const settings = editor.getPluginConfig() as { autoPreviewMermaid?: boolean } | null;
  if (settings?.autoPreviewMermaid === false || autoConsidered.has(bufferId)) return;
  if (editor.getActiveBufferId() !== bufferId || previews.has(bufferId)) return;
  const info = editor.getBufferInfo(bufferId);
  if (!info || !/\.(md|markdown|mdown)$/i.test(info.path) || info.length > MAX_BYTES) return;
  autoConsidered.add(bufferId);
  try {
    const source = await editor.getBufferText(bufferId);
    if (editor.getActiveBufferId() !== bufferId) {
      autoConsidered.delete(bufferId);
      return;
    }
    if (!editor.getBufferInfo(bufferId) || previews.has(bufferId)) return;
    if (/^ {0,3}(?:`{3,}|~{3,})mermaid\b/im.test(source)) await openPreview();
  } catch (error) {
    autoConsidered.delete(bufferId);
    editor.debug(`Fresco Markdown automatic preview failed: ${String(error)}`);
  }
}
registerHandler("frescoMarkdownAutoOpen", () => autoPreview(editor.getActiveBufferId()));
editor.on("buffer_activated", (event) => autoPreview(event.buffer_id));
editor.on("after_file_open", (event) => autoPreview(event.buffer_id));
editor.on("config_changed", () => {
  autoConsidered.clear();
  return autoPreview(editor.getActiveBufferId());
});
// Covers a file already active when the plugin loads, including session restore.
editor.setTimeout(0, "frescoMarkdownAutoOpen");

editor.on("after_insert", (event) => schedule(event.buffer_id));
editor.on("after_delete", (event) => schedule(event.buffer_id));
editor.on("buffer_modified", (event) => schedule(event.buffer_id));
editor.on("after_file_save", (event) => schedule(event.buffer_id));
editor.on("after_file_revert", (event) => schedule(event.buffer_id));
editor.on("viewport_changed", (event) => {
  const preview = [...previews.values()].find((p) => p.buffer === event.buffer_id);
  if (preview && previewWidth(preview) !== preview.width) schedule(preview.source);
});
editor.on("buffer_closed", (event) => {
  autoConsidered.delete(event.buffer_id);
  for (const [source, preview] of previews) {
    if (source === event.buffer_id || preview.buffer === event.buffer_id) {
      preview.revision++;
      previews.delete(source);
      dirty.delete(source);
      if (source === event.buffer_id && editor.getBufferInfo(preview.buffer)) {
        editor.setVirtualBufferContent(preview.buffer, [{ text: "Source closed. Reopen the Markdown file to start a new live preview.\n" }]);
      }
    }
  }
});
