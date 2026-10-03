use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Typography for headings in the rendered Markdown reader.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HeadingStyle {
    /// Render H1/H2 with four-row terminal glyphs when they fit; retain readable text otherwise.
    #[default]
    Large,
    /// Keep all headings at the terminal's normal character size.
    Compact,
}
