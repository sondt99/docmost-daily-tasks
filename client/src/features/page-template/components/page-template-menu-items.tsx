import { Menu } from "@mantine/core";
import { IconFileDescription, IconTemplate } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  saveAsTemplateOpenAtom,
  templatePickerOpenAtom,
} from "../template-atoms";

interface PageTemplateMenuItemsProps {
  readOnly?: boolean;
}

/**
 * The two template entries in a page's "..." menu. Rendered inside
 * `Menu.Dropdown`; the dialogs they open live in `PageTemplateModals`.
 */
export function PageTemplateMenuItems({
  readOnly,
}: PageTemplateMenuItemsProps) {
  const { t } = useTranslation();
  const openPicker = useSetAtom(templatePickerOpenAtom);
  const openSave = useSetAtom(saveAsTemplateOpenAtom);

  if (readOnly) return null;

  return (
    <>
      <Menu.Item
        leftSection={<IconTemplate size={16} />}
        onClick={() => openPicker(true)}
      >
        {t("Insert from template")}
      </Menu.Item>

      <Menu.Item
        leftSection={<IconFileDescription size={16} />}
        onClick={() => openSave(true)}
      >
        {t("Save as template")}
      </Menu.Item>
    </>
  );
}

export default PageTemplateMenuItems;
