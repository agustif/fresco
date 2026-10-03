# Grok Markdown renderer provenance

The `xai-grok-markdown` and `xai-grok-markdown-core` source trees were copied from
`/Users/af/shuvgrok/crates/codegen/`, commit
`9d2374e004f135783df509daff827516615e2cb0`. Those source trees were clean at extraction.

Each crate retains the source repository's Apache-2.0 license and copyright notice.
Fresco remains GPL-3.0-or-later, inherited from Fresh. Preserve both license notices.

The terminal Mermaid implementation is
`xai-grok-markdown/src/mermaid.rs`; it is independent of Grok's SVG/PNG renderer.
It renders flowcharts, sequence, state, class and ER diagrams using Unicode text.
Unsupported or oversized diagrams fall back to a framed source representation.
The engine bounds nodes, edges, groups, nesting, and canvas allocation.

Adaptations: standalone manifests with explicit dependencies, Rust 2024 edition,
Ratatui 0.30 to share Fresco's terminal types, and no playground binaries or benches.
Removed one obsolete `Stylize` import for Ratatui 0.30 and adopted Clippy's equivalent `sort_by_key` expression; the width fallback now asks readers to widen the preview pane instead of opening an unavailable image. Remaining renderer source is retained. `fresh-plugin-runtime/src/markdown_preview.rs`
adapts its output to Fresco plugin spans and applies a 256 KiB document limit.
