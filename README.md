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

Markdown files open in compose mode: centered text, hidden formatting markers,
styled headings, framed code blocks, and table borders. Open the command palette
with **Ctrl+P**, then choose **Markdown: Toggle Compose/Preview** to switch back
to source mode. The all-files toggle persists your compose preference.

For a live reader alongside the editable source, choose
**Fresco Markdown: Open Live Preview** in the command palette. This bundled
plugin renders the whole document, including Mermaid fences, into a read-only
pane. It refreshes after edits, undo/redo, saves, disk reloads, and pane resizes.
Running the command again reuses the existing preview.

```mermaid
flowchart LR
    A[Markdown source] --> B[Grok renderer]
    B --> C[Fresco live preview]
```

Supported diagrams include flowcharts, sequences, states, classes, and entity
relationships. They render as Unicode box-drawing text in ordinary terminals.
Unsupported diagrams retain their source in a frame. Large diagrams fall back
when they exceed the engine's layout limits or available width. Preview input
is limited to 256 KiB; the editor and compose mode remain available for larger files.

Try [the Markdown showcase](docs/fresco-showcase.md).

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
