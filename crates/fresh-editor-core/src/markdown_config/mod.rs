//! Native Markdown preferences, shared by Settings, config files, and plugins.
mod auto_preview;
mod default_view;
mod heading_style;
mod preview_layout;

pub use auto_preview::AutoPreview;
pub use default_view::DefaultView;
pub use heading_style::HeadingStyle;
pub use preview_layout::PreviewLayout;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Markdown reading, editing, layout, and typography.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(default)]
#[schemars(title = "Markdown")]
pub struct MarkdownConfig {
    /// Automatically open a rendered reader: all documents, Mermaid documents only, or off.
    pub auto_preview: AutoPreview,
    /// Start in a reader, split reader, or editable source.
    pub default_view: DefaultView,
    /// Reader arrangement. Auto preserves usable width by stacking panes in narrow terminals.
    pub preview_layout: PreviewLayout,
    /// Large renders H1/H2 as terminal glyphs; compact uses normal-size headings.
    pub heading_style: HeadingStyle,
    /// Use compose mode by default in editable Markdown panes. Turn off to show raw syntax.
    pub compose: bool,
}

impl Default for MarkdownConfig {
    fn default() -> Self {
        Self {
            auto_preview: AutoPreview::All,
            default_view: DefaultView::Preview,
            preview_layout: PreviewLayout::Auto,
            heading_style: HeadingStyle::Large,
            compose: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::partial_config::{Merge, PartialConfig};

    #[test]
    fn markdown_defaults_match_deserialization_and_config_resolution() {
        let expected = serde_json::json!({"auto_preview":"all", "default_view":"preview", "preview_layout":"auto", "heading_style":"large", "compose":true});
        let config: crate::config::Config = serde_json::from_str("{}").unwrap();
        assert_eq!(serde_json::to_value(config.markdown).unwrap(), expected);
        assert_eq!(
            serde_json::to_value(PartialConfig::default().resolve().markdown).unwrap(),
            expected
        );
    }

    #[test]
    fn markdown_layers_merge_individual_preferences() {
        let mut project: PartialConfig =
            serde_json::from_value(serde_json::json!({"markdown":{"heading_style":"compact"}}))
                .unwrap();
        let user: PartialConfig = serde_json::from_value(serde_json::json!({"markdown":{"auto_preview":"off", "preview_layout":"stacked", "compose":false}})).unwrap();
        project.merge_from(&user);
        let resolved = project.resolve();
        assert_eq!(
            resolved.markdown,
            MarkdownConfig {
                auto_preview: AutoPreview::Off,
                default_view: DefaultView::Preview,
                preview_layout: PreviewLayout::Stacked,
                heading_style: HeadingStyle::Compact,
                compose: false
            }
        );
        assert_eq!(
            PartialConfig::from(&resolved).resolve().markdown,
            resolved.markdown
        );
    }

    #[test]
    fn legacy_preview_preference_is_preserved_until_native_choice() {
        let legacy: PartialConfig = serde_json::from_value(serde_json::json!({"plugins":{"fresco_markdown":{"settings":{"autoPreviewMermaid":false}}}})).unwrap();
        assert_eq!(legacy.resolve().markdown.auto_preview, AutoPreview::Off);
        let native: PartialConfig = serde_json::from_value(serde_json::json!({"markdown":{"auto_preview":"all"},"plugins":{"fresco_markdown":{"settings":{"autoPreviewMermaid":false}}}})).unwrap();
        assert_eq!(native.resolve().markdown.auto_preview, AutoPreview::All);
    }

    #[test]
    fn markdown_rejects_unknown_choices() {
        assert!(serde_json::from_str::<crate::config::Config>(
            r#"{"markdown":{"heading_style":"giant"}}"#
        )
        .is_err());
    }
}
