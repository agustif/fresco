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
pub fn render(source: &str, width: u32) -> Result<Vec<Value>, &'static str> {
    if source.len() > MAX_PREVIEW_BYTES {
        return Err("Markdown preview is limited to 256 KiB; use compose mode for larger files");
    }
    // Strip terminal control characters, retaining document whitespace.
    let source: String = source
        .chars()
        .filter(|c| !c.is_control() || matches!(c, '\n' | '\t'))
        .collect();
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
    for line in output.lines {
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
            entries.push(json!({"text": span.content, "style": decoration}));
        }
        entries.push(json!({"text": "\n"}));
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
    fn markdown_and_mermaid_share_one_styled_document() {
        let entries = render("# Architecture\n\n**Ready**\n\n```mermaid\nflowchart LR\n A[Editor] --> B[Plugin]\n```\n", 100).unwrap();
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
        let rendered = text(&render("```mermaid\npie\n title Budget\n```", 80).unwrap());
        assert!(rendered.contains("Budget"));
    }

    #[test]
    fn oversized_input_is_rejected() {
        assert!(render(&"x".repeat(MAX_PREVIEW_BYTES + 1), 80).is_err());
    }

    #[test]
    fn controls_cannot_escape_into_terminal() {
        assert!(!text(&render("Hello\x1b[2J\x07", 80).unwrap()).contains('\x1b'));
    }
}
