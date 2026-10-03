use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Initial presentation of Markdown documents eligible for automatic preview.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DefaultView {
    /// Open a reader in the same pane; double-click or Insert returns to editable source.
    #[default]
    Preview,
    /// Show a reader alongside the editable source.
    Split,
    /// Start editing; the preview remains available from menus and commands.
    Edit,
}
