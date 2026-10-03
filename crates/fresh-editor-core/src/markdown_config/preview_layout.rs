use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Arrangement of editable source and rendered Markdown.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PreviewLayout {
    /// Use side-by-side panes when each can fit 60 columns; otherwise stack them.
    #[default]
    Auto,
    /// Put the reader beside the source.
    SideBySide,
    /// Put the reader below the source.
    Stacked,
}
