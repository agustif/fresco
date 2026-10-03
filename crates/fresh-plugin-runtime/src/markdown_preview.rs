//! Converts the Grok-derived renderer's spans into native plugin decorations.
use anstyle::{AnsiColor, Style};
use ratatui::style::{Color, Modifier};
use serde_json::{json, Value};
use xai_grok_markdown::{
    render_markdown_ratatui_with_buffers_width, MarkdownBuffers, MarkdownStyle,
};

/// Keep whole-document work bounded on the plugin thread. Large files remain editable.
pub const MAX_PREVIEW_BYTES: usize = 256 * 1024;

/// Render a document without executing HTML, fetching images, or invoking a browser.
pub fn render(source: &str, width: u32, large_headings: bool) -> Result<Vec<Value>, &'static str> {
    if source.len() > MAX_PREVIEW_BYTES {
        return Err("Markdown preview is limited to 256 KiB; use compose mode for larger files");
    }
    // Strip terminal control characters, retaining document whitespace.
    let source: String = source
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\t'))
        .collect();
    let source = xai_grok_markdown::normalize_latex_delimiters(&source);
    let mut heading_levels = crate::markdown_heading_levels::heading_levels(&source);
    let accent = Style::new().fg_color(Some(AnsiColor::Cyan.into()));
    let muted = Style::new().fg_color(Some(AnsiColor::BrightBlack.into()));
    let styles = MarkdownStyle {
        heading_inner: [accent.bold(); 6],
        heading_outer: [Style::new().hidden(); 6],
        strong_outer: Style::new().hidden(),
        emphasis_outer: Style::new().hidden(),
        strikethrough_outer: Style::new().hidden(),
        inline_code_outer: Style::new().hidden(),
        code_outer: Style::new().hidden(),
        strong_inner: Style::new().bold(),
        emphasis_inner: Style::new().italic(),
        strikethrough_inner: Style::new().strikethrough(),
        inline_code_inner: accent,
        link_text: accent.underline(),
        link_url: muted,
        blockquote_outer: muted,
        table_outer: muted,
        code_language: accent.hidden(),
        rule: muted,
        task_checked: accent,
        math: accent,
        ..MarkdownStyle::default()
    };
    let (output, _) = render_markdown_ratatui_with_buffers_width(
        &source,
        styles,
        true,
        &mut MarkdownBuffers::new(),
        None,
        Some(width.clamp(20, 240) as usize),
    );
    let mut entries = Vec::new();
    for (index, line) in output.lines.into_iter().enumerate() {
        let source_line = output.line_source_map.get(index).copied().unwrap_or(0);
        if let Some(level) = output
            .line_source_map
            .get(index)
            .and_then(|source_line| heading_levels.get(source_line))
            .copied()
        {
            let text: String = line
                .spans
                .iter()
                .map(|span| span.content.as_ref())
                .collect();
            if !text.trim().is_empty() {
                // A source heading may produce multiple rows; enlarge it only once.
                if let Some(source_line) = output.line_source_map.get(index) {
                    heading_levels.remove(source_line);
                }
                if large_headings && level <= 2 {
                    if let Some(rows) =
                        crate::markdown_big_heading::render(&text, width.clamp(20, 240))
                    {
                        for row in rows {
                            entries.push(json!({"text": format!("{row}\n"), "style": {"fg":"syntax.function", "bold": true}, "properties": {"headingLevel": level, "headingText": text, "sourceLine": source_line}}));
                        }
                        continue;
                    }
                }
            }
        }
        for span in line.spans {
            let style = line.style.patch(span.style);
            let mut decoration = json!({
                "bold": style.add_modifier.contains(Modifier::BOLD),
                "italic": style.add_modifier.contains(Modifier::ITALIC),
                "underline": style.add_modifier.contains(Modifier::UNDERLINED),
                "strikethrough": style.add_modifier.contains(Modifier::CROSSED_OUT),
            });
            match style.fg {
                Some(Color::Cyan | Color::LightCyan) => decoration["fg"] = json!("syntax.function"),
                Some(Color::DarkGray | Color::Gray) => {
                    decoration["fg"] = json!("editor.line_number_fg")
                }
                Some(Color::Rgb(r, g, b)) => decoration["fg"] = json!([r, g, b]),
                _ => {}
            }
            entries.push(json!({"text": span.content, "style": decoration, "properties": {"sourceLine": source_line}}));
        }
        entries.push(json!({"text": "\n", "properties": {"sourceLine": source_line}}));
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(entries: &[Value]) -> String {
        entries
            .iter()
            .filter_map(|entry| entry["text"].as_str())
            .collect()
    }

    #[test]
    fn large_headings_use_reusable_glyphs_and_retain_source_location() {
        let entries = render("# Fresco\n\n## Reader\n\n### Detail\n", 100, true).unwrap();
        let rows: Vec<_> = entries
            .iter()
            .filter(|entry| entry["properties"]["headingLevel"].is_number())
            .collect();
        assert_eq!(rows.len(), 8);
        assert_eq!(rows[0]["properties"]["headingText"], "Fresco");
        assert_eq!(rows[0]["properties"]["sourceLine"], 0);
        assert_eq!(rows[4]["properties"]["sourceLine"], 2);
        assert!(text(&entries).contains("Detail"));
    }

    #[test]
    fn large_heading_fallback_keeps_unicode_and_long_titles_readable() {
        for source in [
            "# 你好 🌍\n",
            "# A heading that cannot fit in this narrow reader\n",
        ] {
            let entries = render(source, 20, true).unwrap();
            assert!(entries
                .iter()
                .all(|entry| entry["properties"]["headingLevel"].is_null()));
            assert!(text(&entries).contains(source.trim_start_matches("# ").trim()));
        }
    }

    #[test]
    fn markdown_structure_distinguishes_headings_from_code_and_bold_text() {
        let entries = render(
            "```rust\n# not a heading\n```\n\n**Bold**\n\nTitle\n=====\n",
            100,
            true,
        )
        .unwrap();
        let titles: Vec<_> = entries
            .iter()
            .filter_map(|entry| entry["properties"]["headingText"].as_str())
            .collect();
        assert_eq!(titles, vec!["Title"; 4]);
        assert!(text(&entries).contains("# not a heading"));
        assert!(text(&entries).contains("Bold"));
    }

    #[test]
    fn compact_mode_keeps_headings_searchable_as_normal_text() {
        let entries = render("# Fresco\n", 100, false).unwrap();
        assert!(text(&entries).contains("Fresco"));
        assert!(entries
            .iter()
            .all(|entry| entry["properties"]["headingLevel"].is_null()));
    }

    #[test]
    fn markdown_and_mermaid_share_one_styled_document() {
        let entries = render("# Architecture\n\n**Ready**\n\n```mermaid\nflowchart LR\n A[Editor] --> B[Plugin]\n```\n", 100, false).unwrap();
        let rendered = text(&entries);
        assert!(rendered.contains("Editor") && rendered.contains("Plugin"));
        assert!(
            rendered.contains('┌') && !rendered.contains("-->"),
            "{rendered}"
        );
        assert!(!rendered.contains("```"));
        assert!(entries.iter().any(|entry| entry["style"]["bold"] == true));
    }

    #[test]
    fn unsupported_diagrams_preserve_source() {
        let rendered = text(&render("```mermaid\npie\n title Budget\n```", 80, false).unwrap());
        assert!(rendered.contains("Budget"));
    }

    #[test]
    fn oversized_input_is_rejected() {
        assert!(render(&"x".repeat(MAX_PREVIEW_BYTES + 1), 80, false).is_err());
    }

    #[test]
    fn controls_cannot_escape_into_terminal() {
        assert!(!text(&render("Hello\x1b[2J\x07", 80, false).unwrap()).contains('\x1b'));
    }
}
