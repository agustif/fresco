use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Which Markdown documents automatically open a rendered reader.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AutoPreview {
    /// Open a reader for every Markdown document.
    #[default]
    All,
    /// Open a reader only for documents containing Mermaid fences.
    Mermaid,
    /// Open readers only through the Markdown preview command.
    Off,
}
