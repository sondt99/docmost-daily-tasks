import { atom } from "jotai";

/**
 * Which template dialog is open.
 *
 * The menu entries and the dialogs themselves are rendered at two different
 * places in Docmost's page header: the entries must sit inside `Menu.Dropdown`,
 * while a modal mounted inside a dropdown unmounts the moment the menu closes.
 * Routing the open/close state through atoms keeps the two halves independent,
 * so each can be dropped into the header on its own line.
 */
export const saveAsTemplateOpenAtom = atom(false);
export const templatePickerOpenAtom = atom(false);
