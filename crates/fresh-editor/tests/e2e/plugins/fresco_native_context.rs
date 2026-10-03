//! Native menu and mouse routing against a plugin that observes the published target.
use crate::common::harness::EditorTestHarness;
use crossterm::event::{KeyCode, KeyModifiers};
use fresh::config::Config;
use fresh::input::keybindings::Action;
use std::fs;

const PROBE: &str = r#"
const editor = getEditor();
let source = 0;
function report(action: string): void {
    editor.setStatus(`native:${action}:buffer=${editor.getActiveBufferId()}:pane=${editor.getActiveSplitId()}`);
}
registerHandler("frescoMarkdownOpen", () => report("preview"));
registerHandler("frescoMarkdownSplit", () => report("split"));
registerHandler("frescoMarkdownReturnSource", () => {
    const buffer = editor.getActiveBufferId();
    const pane = editor.getActiveSplitId();
    const props = editor.getTextPropertiesAtCursor(buffer);
    const line = props.length ? props[0].sourceLine : "none";
    if (source) editor.showBuffer(source);
    editor.setStatus(`native:edit:buffer=${buffer}:pane=${pane}:line=${line}`);
});
registerHandler("nativeProbeReader", async () => {
    source = editor.getActiveBufferId();
    const result = await editor.createVirtualBuffer({name: "*native reader*", mode: "fresco-markdown-preview", readOnly: true});
    editor.setVirtualBufferContent(result.bufferId, [
        {text: "Reader first row\n", properties: {sourceLine: 3}},
        {text: "Reader second row\n", properties: {sourceLine: 19}},
    ]);
    editor.setStatus("native:reader-ready");
});
editor.registerCommand("Native preview", "Probe target", "frescoMarkdownOpen", null);
editor.registerCommand("Native split", "Probe target", "frescoMarkdownSplit", null);
editor.registerCommand("Native edit", "Probe target", "frescoMarkdownReturnSource", null);
editor.registerCommand("Native reader", "Create reader", "nativeProbeReader", null);
"#;

fn harness() -> (EditorTestHarness, tempfile::TempDir) {
    let temp = tempfile::tempdir().unwrap();
    let plugins = temp.path().join("plugins");
    fs::create_dir(&plugins).unwrap();
    fs::write(plugins.join("native_probe.ts"), PROBE).unwrap();
    crate::common::harness::copy_plugin_lib(&plugins);
    fs::write(
        temp.path().join("target.md"),
        "# Target source\nsecond source line\n",
    )
    .unwrap();
    fs::write(temp.path().join("other.txt"), "Other pane text\n").unwrap();
    let mut config = Config::default();
    config.editor.double_click_time_ms = 2000;
    config.markdown.default_view = serde_json::from_str("\"edit\"").unwrap();
    let mut h =
        EditorTestHarness::with_config_and_working_dir(120, 40, config, temp.path().to_path_buf())
            .unwrap();
    h.run_palette_command("Native preview").unwrap();
    (h, temp)
}

fn choose(h: &mut EditorTestHarness, label: &str) {
    let (x, y) = h
        .find_text_on_screen(label)
        .unwrap_or_else(|| panic!("missing {label}: {}", h.screen_to_string()));
    h.mouse_click(x + 1, y).unwrap();
}

fn assert_target(
    h: &mut EditorTestHarness,
    action: &str,
    buffer: fresh_core::BufferId,
    pane: fresh_core::SplitId,
) {
    let expected = format!("native:{action}:buffer={}:pane={}", buffer.0, pane.0);
    h.wait_until(|h| h.screen_to_string().contains(&expected))
        .unwrap();
    h.assert_no_plugin_errors();
}

#[test]
fn markdown_tab_menu_uses_clicked_tab_instead_of_active_buffer() {
    let (mut h, temp) = harness();
    h.open_file(&temp.path().join("target.md")).unwrap();
    let source = h.editor().active_buffer();
    let pane = h.editor().effective_active_split().0;
    h.open_file(&temp.path().join("other.txt")).unwrap();
    let other = h.editor().active_buffer();
    let (x, y) = h.find_text_on_screen("target.md").unwrap();
    h.mouse_right_click(x + 1, y).unwrap();
    assert_eq!(h.editor().active_buffer(), other);
    choose(&mut h, "Preview Markdown");
    assert_target(&mut h, "preview", source, pane);
    assert_eq!(h.editor().active_buffer(), source);
}

#[test]
fn markdown_text_menu_uses_clicked_pane_instead_of_active_pane() {
    let (mut h, temp) = harness();
    h.open_file(&temp.path().join("target.md")).unwrap();
    let source = h.editor().active_buffer();
    let pane = h.editor().effective_active_split().0;
    h.editor_mut()
        .dispatch_action_for_tests(Action::SplitVertical);
    h.open_file(&temp.path().join("other.txt")).unwrap();
    assert_ne!(h.editor().effective_active_split().0, pane);
    let (x, y) = h.find_text_on_screen("Target source").unwrap();
    h.mouse_right_click(x, y).unwrap();
    choose(&mut h, "Preview in Split");
    assert_target(&mut h, "split", source, pane);
    assert_eq!(h.editor().effective_active_split().0, pane);
}

#[test]
fn reader_double_click_publishes_clicked_line_and_pane_before_returning_source() {
    let (mut h, temp) = harness();
    h.open_file(&temp.path().join("target.md")).unwrap();
    let source = h.editor().active_buffer();
    h.run_palette_command("Native reader").unwrap();
    h.wait_until(|h| h.screen_to_string().contains("Reader second row"))
        .unwrap();
    let reader = h.editor().active_buffer();
    let pane = h.editor().effective_active_split().0;
    h.editor_mut()
        .dispatch_action_for_tests(Action::SplitVertical);
    h.open_file(&temp.path().join("other.txt")).unwrap();
    let (x, y) = h.find_text_on_screen("Reader second row").unwrap();
    h.mouse_click(x + 2, y).unwrap();
    h.mouse_click(x + 2, y).unwrap();
    assert_target(&mut h, "edit", reader, pane);
    h.assert_screen_contains(":line=19");
    assert_eq!(h.editor().active_buffer(), source);
    assert_eq!(h.editor().effective_active_split().0, pane);
    assert!(!h.editor().is_active_buffer_read_only());
    h.send_key(KeyCode::Char('X'), KeyModifiers::NONE).unwrap();
    assert!(h.get_buffer_content().unwrap().contains('X'));
}

#[test]
fn explorer_preview_explicitly_dispatches_for_clicked_markdown_file() {
    let (mut h, temp) = harness();
    h.open_file(&temp.path().join("other.txt")).unwrap();
    let other = h.editor().active_buffer();
    let pane = h.editor().effective_active_split().0;
    h.editor_mut().focus_file_explorer();
    h.wait_for_file_explorer().unwrap();
    h.render().unwrap();
    let (x, y) = h.find_text_on_screen("target.md").unwrap();
    h.mouse_right_click(x + 1, y).unwrap();
    choose(&mut h, "Preview Markdown");
    let source = h.editor().active_buffer();
    assert_ne!(source, other);
    assert_target(&mut h, "preview", source, pane);
    assert!(h.get_buffer_content().unwrap().contains("Target source"));
}

#[test]
fn non_markdown_text_has_no_markdown_menu() {
    let (mut h, temp) = harness();
    h.open_file(&temp.path().join("other.txt")).unwrap();
    let (x, y) = h.find_text_on_screen("Other pane text").unwrap();
    h.mouse_right_click(x, y).unwrap();
    assert!(!h.screen_to_string().contains("Preview Markdown"));
}

#[test]
fn reader_text_menu_offers_edit_for_the_clicked_reader() {
    let (mut h, temp) = harness();
    h.open_file(&temp.path().join("target.md")).unwrap();
    let source = h.editor().active_buffer();
    h.run_palette_command("Native reader").unwrap();
    h.wait_until(|h| h.screen_to_string().contains("Reader second row"))
        .unwrap();
    let reader = h.editor().active_buffer();
    let pane = h.editor().effective_active_split().0;
    let (x, y) = h.find_text_on_screen("Reader first row").unwrap();
    h.mouse_right_click(x, y).unwrap();
    assert!(!h.screen_to_string().contains("Preview Markdown"));
    choose(&mut h, "Edit Markdown");
    assert_target(&mut h, "edit", reader, pane);
    assert_eq!(h.editor().active_buffer(), source);
}

#[test]
fn markdown_menu_requires_registered_plugin_commands() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("unavailable.md");
    fs::write(&path, "# No reader plugin\n").unwrap();
    let mut h = EditorTestHarness::new(100, 30).unwrap();
    h.open_file(&path).unwrap();
    let (x, y) = h.find_text_on_screen("No reader plugin").unwrap();
    h.mouse_right_click(x, y).unwrap();
    assert!(!h.screen_to_string().contains("Preview Markdown"));
    let (x, y) = h.find_text_on_screen("unavailable.md").unwrap();
    h.mouse_right_click(x, y).unwrap();
    h.assert_screen_contains("Close Others");
    assert!(!h.screen_to_string().contains("Preview Markdown"));
}
