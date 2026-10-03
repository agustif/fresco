//! Large terminal typography through tui-big-text; no terminal-specific escapes.
use font8x8::UnicodeFonts;
use ratatui::{buffer::Buffer, layout::Rect, text::Line, widgets::Widget};
use tui_big_text::{BigText, PixelSize};

/// Draw four-row headings only when every glyph is supported and fits in the pane.
/// Returning None keeps the original, readable Unicode heading intact.
pub fn render(text: &str, width: u32) -> Option<Vec<String>> {
    let fonts: [&dyn UnicodeFonts; 8] = [
        &font8x8::BASIC_FONTS,
        &font8x8::LATIN_FONTS,
        &font8x8::HIRAGANA_FONTS,
        &font8x8::GREEK_FONTS,
        &font8x8::BLOCK_FONTS,
        &font8x8::BOX_FONTS,
        &font8x8::MISC_FONTS,
        &font8x8::SGA_FONTS,
    ];
    let text = text.trim();
    if text.is_empty()
        || !text
            .chars()
            .all(|c| fonts.iter().any(|font| font.get(c).is_some()))
    {
        return None;
    }
    let columns = text.chars().count().checked_mul(4)?;
    if columns > width as usize {
        return None;
    }
    let area = Rect::new(0, 0, u16::try_from(columns).ok()?, 4);
    let mut buffer = Buffer::empty(area);
    BigText::builder()
        .pixel_size(PixelSize::Quadrant)
        .lines(vec![Line::from(text)])
        .build()
        .render(area, &mut buffer);
    let rows = (0..area.height)
        .map(|y| {
            let row: String = (0..area.width).map(|x| buffer[(x, y)].symbol()).collect();
            row.trim_end().to_owned()
        })
        .collect();
    Some(rows)
}
