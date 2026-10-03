//! Heading recognition uses Markdown structure, so fenced code stays literal.
use pulldown_cmark::{Event, Parser, Tag};
use std::collections::HashMap;

/// Locate heading source lines without scanning the document once per heading.
pub fn heading_levels(source: &str) -> HashMap<usize, u8> {
    let starts: Vec<usize> = std::iter::once(0)
        .chain(source.match_indices('\n').map(|(offset, _)| offset + 1))
        .collect();
    Parser::new(source)
        .into_offset_iter()
        .filter_map(|(event, range)| {
            if let Event::Start(Tag::Heading { level, .. }) = event {
                let line = starts
                    .partition_point(|start| *start <= range.start)
                    .saturating_sub(1);
                Some((line, level as u8))
            } else {
                None
            }
        })
        .collect()
}
