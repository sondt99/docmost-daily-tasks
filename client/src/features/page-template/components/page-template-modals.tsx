import { useAtom } from "jotai";
import {
  saveAsTemplateOpenAtom,
  templatePickerOpenAtom,
} from "../template-atoms";
import SaveAsTemplateModal from "./save-as-template-modal";
import TemplatePickerModal from "./template-picker-modal";

interface PageTemplateModalsProps {
  pageId: string;
  spaceId: string;
  pageTitle?: string;
}

/**
 * The dialogs behind `PageTemplateMenuItems`. Mounted next to the page
 * header's other modals, outside the dropdown, so they survive the menu
 * closing on click.
 */
export function PageTemplateModals({
  pageId,
  spaceId,
  pageTitle,
}: PageTemplateModalsProps) {
  const [saveOpened, setSaveOpened] = useAtom(saveAsTemplateOpenAtom);
  const [pickerOpened, setPickerOpened] = useAtom(templatePickerOpenAtom);

  if (!pageId || !spaceId) return null;

  return (
    <>
      <SaveAsTemplateModal
        pageId={pageId}
        spaceId={spaceId}
        pageTitle={pageTitle}
        opened={saveOpened}
        onClose={() => setSaveOpened(false)}
      />

      <TemplatePickerModal
        spaceId={spaceId}
        opened={pickerOpened}
        onClose={() => setPickerOpened(false)}
      />
    </>
  );
}

export default PageTemplateModals;
