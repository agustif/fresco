//! Context menu (right-click menus): the menu box and its full-frame
//! close guard.

use anyhow::Result as AnyhowResult;

use super::Editor;
use crate::app::types::MarkdownContextAction;
use crate::input::keybindings::Action;
use crate::model::event::{BufferId, LeafId};

/// Behavior owned by this component (moved from mouse_input.rs —
/// the handlers its arms dispatch to).
impl Editor {
    /// The mode is owned by the reader's virtual buffer, never inferred from its name.
    pub(super) fn is_markdown_preview(&self, buffer_id: BufferId) -> bool {
        self.active_window()
            .buffer_metadata
            .get(&buffer_id)
            .and_then(|metadata| metadata.virtual_mode())
            == Some("fresco-markdown-preview")
    }

    pub(super) fn markdown_action_available(&self, action: MarkdownContextAction) -> bool {
        cfg!(feature = "plugins")
            && self.command_registry.read().unwrap().get_all().iter().any(|command| {
                matches!(&command.action, Action::PluginAction(handler) if handler == action.handler())
            })
    }

    pub(super) fn markdown_context_actions(
        &self,
        buffer_id: BufferId,
    ) -> Vec<MarkdownContextAction> {
        let candidates: &[MarkdownContextAction] = if self.is_markdown_preview(buffer_id) {
            &[MarkdownContextAction::Edit]
        } else if self
            .active_window()
            .buffers
            .get(&buffer_id)
            .is_some_and(|state| state.language == "markdown")
            && self
                .active_window()
                .buffer_metadata
                .get(&buffer_id)
                .is_some_and(|metadata| metadata.virtual_mode().is_none())
        {
            &[MarkdownContextAction::Preview, MarkdownContextAction::Split]
        } else {
            &[]
        };
        candidates
            .iter()
            .copied()
            .filter(|action| self.markdown_action_available(*action))
            .collect()
    }

    /// Resolve against the retained target, then publish focus before invoking TypeScript.
    pub(super) fn execute_markdown_context_action(
        &mut self,
        action: MarkdownContextAction,
        buffer_id: BufferId,
        pane: LeafId,
    ) -> AnyhowResult<()> {
        if !self.markdown_action_available(action)
            || !self.active_window().buffers.contains_key(&buffer_id)
            || self.active_window().pane_buffer(pane).is_none()
        {
            return Ok(());
        }
        self.focus_split(pane, buffer_id);
        self.active_window_mut().focus_editor();
        self.update_plugin_state_snapshot();
        self.handle_action(Action::PluginAction(action.handler().to_string()))
    }

    /// Text context menus reuse the buffer/pane payload and native menu dispatch.
    pub(crate) fn open_editor_context_menu(&mut self, pane: LeafId, x: u16, y: u16) {
        let Some(buffer_id) = self.active_window().pane_buffer(pane) else {
            return;
        };
        let items: Vec<_> = self
            .markdown_context_actions(buffer_id)
            .into_iter()
            .map(crate::app::types::TabContextMenuItem::Markdown)
            .collect();
        if items.is_empty() {
            return;
        }
        let mut menu = crate::app::types::TabContextMenu::new(buffer_id, pane, x, y);
        menu.items = items;
        menu.menu.item_count = menu.items.len();
        self.active_window_mut().close_context_menus();
        self.active_window_mut().tab_context_menu = Some(menu);
    }

    /// Activate the highlighted item of the open context menu: resolve the
    /// item + its payload from the concrete menu, dismiss the menu, then run
    /// the matching `execute_*` action. Shared by both the keyboard (Enter)
    /// and mouse (click) paths so activation lives in exactly one place — the
    /// pointer path now reaches it from the shell (`apply_ui_fact`), the
    /// keyboard path still from this component.
    pub(crate) fn activate_highlighted_context_menu(
        &mut self,
        kind: crate::app::types::ContextMenuKind,
    ) -> AnyhowResult<()> {
        use crate::app::types::ContextMenuKind;
        match kind {
            ContextMenuKind::Tab => {
                let selected = self
                    .active_window()
                    .tab_context_menu
                    .as_ref()
                    .map(|m| (m.highlighted_item(), m.buffer_id, m.split_id));
                self.active_window_mut().close_context_menus();
                if let Some((item, buffer_id, split_id)) = selected {
                    return self.execute_tab_context_menu_action(item, buffer_id, split_id);
                }
            }
            ContextMenuKind::NewTab => {
                let selected = self
                    .active_window()
                    .new_tab_menu
                    .as_ref()
                    .map(|m| (m.highlighted_item(), m.split_id));
                self.active_window_mut().close_context_menus();
                if let Some((item, split_id)) = selected {
                    return self.execute_new_tab_menu_action(item, split_id);
                }
            }
            ContextMenuKind::FileExplorer => {
                let selected = self
                    .active_window()
                    .file_explorer_context_menu
                    .as_ref()
                    .map(|m| (m.highlighted_item(), m.markdown_target.clone()));
                self.active_window_mut().close_context_menus();
                if let Some((item, target)) = selected {
                    self.execute_file_explorer_context_menu_action(item, target)?;
                }
            }
            ContextMenuKind::CloseSplit => {
                let selected = self
                    .active_window()
                    .close_split_menu
                    .as_ref()
                    .map(|m| (m.highlighted_item(), m.split_id));
                self.active_window_mut().close_context_menus();
                if let Some((item, split_id)) = selected {
                    self.execute_close_split_menu_action(item, split_id);
                }
            }
        }
        Ok(())
    }
}
