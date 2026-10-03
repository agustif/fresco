/// <reference path="./lib/fresh.d.ts" />
// Native Markdown preferences own behavior; source buffers own editable content.
const editor = getEditor();
const READER_MODE = "fresco-markdown-preview";
const MAX_BYTES = 256 * 1024;
interface MarkdownSettings {
  auto_preview: "all" | "mermaid" | "off";
  default_view: "preview" | "split" | "edit";
  preview_layout: "auto" | "side_by_side" | "stacked";
  heading_style: "large" | "compact";
  compose: boolean;
}
function settings(): MarkdownSettings {
  const config = editor.getConfig() as { markdown?: Partial<MarkdownSettings> } | null;
  return { auto_preview: "all", default_view: "preview", preview_layout: "auto", heading_style: "large", compose: true, ...config?.markdown };
}
interface Preview {
  source: number;
  buffer: number;
  split: number;
  sourceSplit: number;
  revision: number;
  width: number;
}
const previews = new Map<number, Preview>();
const opening = new Set<number>();
const autoConsidered = new Set<number>();
const editing = new Set<number>();
const dirty = new Set<number>();
let timer: number | null = null;
let appliedSettings = settings();
const isMarkdown = (path: string): boolean => /\.(md|markdown|mdown)$/i.test(path);
const isInsertMode = (): boolean => /(^|[-_])insert$/.test(editor.getInputMode() ?? "");
function activePreview(): Preview | undefined {
  const active = editor.getActiveBufferId();
  return previews.get(active) ?? [...previews.values()].find((item) => item.buffer === active);
}
function publishApi(): void {
  editor.exportPluginApi("fresco-markdown", {
    defaultCompose: settings().compose,
    isSourceEditing: (id: number) => editing.has(id),
    setComposeDefault: (value: boolean) => savePreference("compose", value),
  });
}
function updateContext(): void {
  const info = editor.getBufferInfo(editor.getActiveBufferId());
  editor.setContext("fresco-markdown", !!activePreview() || (!!info && isMarkdown(info.path)));
  editor.setContext("fresco-markdown-reader", [...previews.values()].some((item) => item.buffer === editor.getActiveBufferId()));
}
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
    editor.setVirtualBufferContent(preview.buffer, editor.renderMarkdownPreview(source, preview.width, settings().heading_style));
  } catch (error) {
    editor.debug(`Markdown preview failed: ${String(error)}`);
    if (revision === preview.revision && previews.get(preview.source) === preview) {
      editor.setVirtualBufferContent(preview.buffer, [{ text: `Preview unavailable\n\n${String(error)}\n` }]);
      editor.setStatus(`Markdown: ${String(error)}`);
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
  preview.revision++;
  dirty.add(source);
  if (timer !== null) editor.clearInterval(timer);
  timer = editor.setTimeout(180, "frescoMarkdownRefresh");
}
async function returnSource(): Promise<void> {
  const preview = activePreview();
  if (!preview) {
    const active = editor.getActiveBufferId();
    const info = editor.getBufferInfo(active);
    if (info && isMarkdown(info.path)) {
      editing.add(active);
      autoConsidered.add(active);
      editor.setViewMode(active, "source");
    }
    return;
  }
  if (!editor.getBufferInfo(preview.source)) return;
  const property = editor.getTextPropertiesAtCursor(preview.buffer).find((entry) => typeof entry.sourceLine === "number");
  editing.add(preview.source);
  autoConsidered.add(preview.source);
  const originalSplit = editor.listSplits().find((item) => item.splitId === preview.sourceSplit);
  const split = originalSplit?.splitId ?? preview.split;
  if (originalSplit) editor.setSplitBuffer(split, preview.source);
  else editor.moveBufferToSplit(preview.source, split);
  editor.focusSplit(split);
  editor.setViewMode(preview.source, "source");
  await editor.flush();
  if (editor.getActiveBufferId() !== preview.source) return;
  const line = property?.sourceLine;
  if (typeof line === "number" && Number.isSafeInteger(line) && line >= 0) {
    const position = await editor.getLineStartPosition(line);
    if (position !== null && editor.getActiveBufferId() === preview.source) editor.setBufferCursor(preview.source, position);
  }
  updateContext();
}
async function closePreview(): Promise<void> {
  const preview = activePreview();
  if (!preview) return;
  await returnSource();
  preview.revision++;
  previews.delete(preview.source);
  dirty.delete(preview.source);
  // Only remove a dedicated reader pane; other tabs in that pane belong to the user.
  const occupants = editor.listBuffers().filter((buffer) => buffer.splits.includes(preview.split));
  if (preview.split !== preview.sourceSplit && occupants.length === 1 && occupants[0].id === preview.buffer) editor.closeSplit(preview.split);
  editor.closeBuffer(preview.buffer);
  updateContext();
}
async function openPreview(forceSplit = false): Promise<void> {
  if (isInsertMode()) {
    await returnSource();
    editor.setStatus("Markdown: leave insert mode to open the reader.");
    return;
  }
  const active = editor.getActiveBufferId();
  const existing = activePreview();
  if (existing && editor.getBufferInfo(existing.buffer)) {
    const visible = editor.listSplits().find((split) => split.bufferId === existing.buffer);
    if (visible && !(forceSplit && existing.split === existing.sourceSplit)) {
      existing.split = visible.splitId;
      editor.focusSplit(existing.split);
      await refresh(existing);
      return;
    }
    // A hidden reader tab can be reopened in its original pane without duplicating it.
    const info = editor.getBufferInfo(existing.buffer);
    const owner = editor.listSplits().find((split) => info?.splits.includes(split.splitId));
    if (owner && !forceSplit) {
      existing.split = owner.splitId;
      editing.delete(existing.source);
      editor.setSplitBuffer(owner.splitId, existing.buffer);
      editor.focusSplit(owner.splitId);
      await refresh(existing);
      return;
    }
    if (active === existing.buffer) await returnSource();
    previews.delete(existing.source);
    editor.closeBuffer(existing.buffer);
    await editor.flush();
  }
  const source = existing?.source ?? active;
  const info = editor.getBufferInfo(source);
  if (!info || !isMarkdown(info.path)) {
    editor.setStatus("Open a Markdown file, then choose Markdown: Open Preview.");
    return;
  }
  if (info.length > MAX_BYTES) { editor.setStatus("Preview is limited to 256 KiB; compose mode remains available."); return; }
  if (opening.has(source)) return;
  opening.add(source);
  autoConsidered.add(source);
  editing.delete(source);
  const sourceSplit = editor.getActiveSplitId();
  try {
    const config = settings();
    const splitReader = forceSplit || config.default_view === "split";
    const base = { name: `Preview: ${info.path.split(/[\\/]/).pop()}`, mode: READER_MODE,
      readOnly: true, editingDisabled: true, showLineNumbers: false, showCursors: false,
      entries: [{ text: "Rendering Markdown…\n" }] };
    const horizontal = config.preview_layout === "stacked" || (config.preview_layout === "auto" && (editor.getViewport()?.width ?? 80) < 124);
    const result = splitReader
      ? await editor.createVirtualBufferInSplit({ ...base, direction: horizontal ? "horizontal" : "vertical", ratio: 0.5, lineWrap: true })
      : await editor.createVirtualBuffer({ ...base, splitId: sourceSplit, highlightCurrentLine: false });
    const split = result.splitId ?? sourceSplit;
    editor.setLineWrap(result.bufferId, split, true);
    const preview: Preview = { source, buffer: result.bufferId, split, sourceSplit, revision: 0, width: 0 };
    previews.set(source, preview);
    await refresh(preview);
    if (editing.has(source) || isInsertMode()) await returnSource();
    updateContext();
  } catch (error) {
    editor.setStatus(`Markdown: ${String(error)}`);
    editor.debug(`Markdown could not open preview: ${String(error)}`);
  } finally { opening.delete(source); }
}
async function autoPreview(bufferId: number): Promise<void> {
  const config = settings();
  if (config.auto_preview === "off" || config.default_view === "edit" || isInsertMode() || autoConsidered.has(bufferId)) return;
  if (editor.getActiveBufferId() !== bufferId || previews.has(bufferId)) return;
  const info = editor.getBufferInfo(bufferId);
  if (!info || !isMarkdown(info.path) || info.length > MAX_BYTES) return;
  autoConsidered.add(bufferId);
  try {
    const source = await editor.getBufferText(bufferId);
    if (editor.getActiveBufferId() !== bufferId) { autoConsidered.delete(bufferId); return; }
    if (!editor.getBufferInfo(bufferId) || previews.has(bufferId) || editing.has(bufferId) || isInsertMode()) return;
    if (config.auto_preview === "all" || /^ {0,3}(?:`{3,}|~{3,})mermaid\b/im.test(source)) await openPreview();
  } catch (error) {
    autoConsidered.delete(bufferId);
    editor.debug(`Markdown automatic preview failed: ${String(error)}`);
  }
}
async function applySettings(): Promise<void> {
  const next = settings();
  if (next.auto_preview !== appliedSettings.auto_preview || next.default_view !== appliedSettings.default_view) autoConsidered.clear();
  appliedSettings = next;
  publishApi();
  for (const source of previews.keys()) schedule(source);
  await autoPreview(editor.getActiveBufferId());
  updateContext();
}
function savePreference(key: keyof MarkdownSettings, value: unknown): boolean {
  const queued = editor.saveSetting(`markdown.${key}`, value);
  if (queued) editor.setTimeout(0, "frescoMarkdownApplySettings");
  return queued;
}
registerHandler("frescoMarkdownOpen", () => openPreview());
registerHandler("frescoMarkdownSplit", () => openPreview(true));
registerHandler("frescoMarkdownReturnSource", returnSource);
registerHandler("frescoMarkdownClose", closePreview);
registerHandler("frescoMarkdownToggle", () => [...previews.values()].some((p) => p.buffer === editor.getActiveBufferId()) ? returnSource() : openPreview());
registerHandler("frescoMarkdownToggleHeadings", () => savePreference("heading_style", settings().heading_style === "large" ? "compact" : "large"));
registerHandler("frescoMarkdownSettings", () => editor.executeAction("open_settings"));
registerHandler("frescoMarkdownApplySettings", applySettings);
registerHandler("frescoMarkdownAutoOpen", () => autoPreview(editor.getActiveBufferId()));
editor.defineMode(READER_MODE, [
  ["Escape", "frescoMarkdownReturnSource"], ["i", "frescoMarkdownReturnSource"],
  ["Insert", "frescoMarkdownReturnSource"], ["q", "frescoMarkdownClose"],
], true, false, true);
for (const [name, description, handler] of [
  ["Open Preview", "Read the active Markdown document", "frescoMarkdownOpen"],
  ["Open Split Preview", "Read Markdown beside its editable source", "frescoMarkdownSplit"],
  ["Edit Source", "Return to editable Markdown at the reader's current location", "frescoMarkdownReturnSource"],
  ["Toggle Preview", "Switch between Markdown reading and editing", "frescoMarkdownToggle"],
  ["Toggle Large Headings", "Persist large or compact Markdown headings", "frescoMarkdownToggleHeadings"],
  ["Settings", "Configure Markdown in the native Settings dialog", "frescoMarkdownSettings"],
]) editor.registerCommand(`Markdown: ${name}`, description, handler);
for (const [label, action, when] of [
  ["Markdown Preview", "frescoMarkdownOpen", "fresco-markdown"],
  ["Markdown Split Preview", "frescoMarkdownSplit", "fresco-markdown"],
  ["Edit Markdown Source", "frescoMarkdownReturnSource", "fresco-markdown-reader"],
  ["Markdown Heading Size", "frescoMarkdownToggleHeadings", "fresco-markdown"],
  ["Markdown Settings", "frescoMarkdownSettings", ""],
]) editor.addMenuItem({ menu: "View", label, action, ...(when ? { when } : {}) });
editor.on("buffer_activated", (event) => { updateContext(); return autoPreview(event.buffer_id); });
editor.on("after_file_open", (event) => autoPreview(event.buffer_id));
editor.on("config_changed", applySettings);
editor.on("input_mode_changed", () => isInsertMode() ? returnSource() : undefined);
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
  editing.delete(event.buffer_id);
  for (const [source, preview] of previews) {
    if (source === event.buffer_id || preview.buffer === event.buffer_id) {
      preview.revision++;
      previews.delete(source);
      dirty.delete(source);
      if (source === event.buffer_id && editor.getBufferInfo(preview.buffer)) editor.setVirtualBufferContent(preview.buffer, [{ text: "Source closed. Reopen the Markdown file to start a new reader.\n" }]);
    }
  }
  updateContext();
});
publishApi();
updateContext();
editor.setTimeout(0, "frescoMarkdownAutoOpen");
