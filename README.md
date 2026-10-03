# Fresco

A Rust terminal IDE, forked from [Fresh](https://github.com/sinelaw/fresh), with
beautiful Markdown and native Mermaid text diagrams powered by the extracted
Grok Markdown renderer.

```sh
cargo install --path crates/fresh-editor --bin fresco --locked
fresco README.md
```

The build embeds all plugins. No Node.js, browser, image protocol, or external
Mermaid executable is needed at runtime. Rust 1.95 and a C compiler are required
when building from source.

## Markdown

Markdown now has native settings, menus, compose mode, and a rendered reader.
Documents open in the read-only preview by default. **Ctrl+P** contains
**Markdown: Open Preview**, **Markdown: Open Split Preview**, **Markdown: Edit
Source**, **Markdown: Toggle Preview**, **Markdown: Toggle Large Headings**,
and **Markdown: Settings**. Right-click Markdown in a pane, tab, or file explorer
to preview or edit that exact document.

The reader updates while the source changes. Double-click rendered text or press
**Escape**, **i**, or **Insert** to edit at the corresponding source line. Split
mode keeps the source and reader visible together. Choose the layout, default
view, compose behavior, automatic-preview rule, and heading size under
**Settings → Markdown**.

```json
{
  "markdown": {
    "auto_preview": "all",
    "default_view": "preview",
    "preview_layout": "auto",
    "heading_style": "large",
    "compose": true
  }
}
```

`preview_layout: "auto"` places both panes side by side when each can fit
60 columns; otherwise it stacks them. Use `"split"` for a visible editable
source by default, or `"edit"` to open source directly. Set `auto_preview` to
`"mermaid"` or `"off"` when you want fewer automatic readers. Set
`heading_style` to `"compact"` for normal-sized headings. Compose mode formats
the editable source pane; large preview headings use the `tui-big-text` 8×8
font as four-row Unicode glyphs. Unsupported or too-wide headings stay readable
as ordinary styled text.

The live reader renders flowcharts, sequences, states, classes, and ER diagrams
as native terminal text. It uses the Grok-derived parser and runs without a
browser, image protocol, or Node.js. Unsupported diagrams retain their source;
large diagrams fall back when they exceed the layout limits or available width.
Preview input is limited to 256 KiB.

Run `fresco /Users/af/fresh/docs/fresco-showcase.md` to see the 24-diagram
gallery. See [renderer provenance](vendor/PROVENANCE.md) for the vendored
library and its licenses.

## Fork identity and compatibility

- Executable: `fresco`.
- GitHub: [agustif/fresco](https://github.com/agustif/fresco).
- Config: `~/.config/fresco/` on macOS and Linux; platform data/cache directories
  also use `fresco`. Run `fresco --cmd config paths` for this machine's exact paths.
- Upstream self-update and automatic update checks are disabled in the default
  build. Update by pulling this repository and repeating the install command.
- Internal `fresh-*` crate names and TypeScript plugin APIs remain compatible
  with upstream. Existing Fresh plugin documentation applies.
- Upstream release/package workflows are retained as historical infrastructure;
  they are not Fresco release automation.

See [Fresh's documentation](https://getfresh.dev) for editing, LSP, terminals,
remote files, sessions, and plugin authoring. See
[renderer provenance](vendor/PROVENANCE.md) for the extracted library and licenses.

## Validation

```sh
cargo test -p fresh-plugin-runtime markdown_preview --lib
cargo test -p xai-grok-markdown --lib
bun test crates/fresh-editor/plugins/tests/fresco_markdown.test.ts
cargo build -p fresh-editor --bin fresco --release --locked
```

Fresco inherits Fresh's GPL-3.0-or-later license. The vendored Grok renderer
retains its Apache-2.0 license and attribution.
