import {
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createTemplateFromPage } from "../template-service";

interface SaveAsTemplateModalProps {
  pageId: string;
  spaceId: string;
  pageTitle?: string;
  opened: boolean;
  onClose: () => void;
}

export function SaveAsTemplateModal({
  pageId,
  spaceId,
  pageTitle,
  opened,
  onClose,
}: SaveAsTemplateModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset on each open so a previous attempt never leaks into the next one.
  useEffect(() => {
    if (opened) {
      setTitle(pageTitle ?? "");
      setDescription("");
      setMakeDefault(false);
      setSaving(false);
    }
  }, [opened, pageTitle]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const template = await createTemplateFromPage({
        pageId,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        setAsSpaceDefault: makeDefault,
      });

      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({
        queryKey: ["space-default-template", spaceId],
      });

      notifications.show({
        message: makeDefault
          ? t('Saved. New pages in this space will start from "{{title}}".', {
              title: template.title,
            })
          : t("Saved as a template"),
      });
      onClose();
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("An error occurred"),
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Save as template")}
      size="md"
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t(
            "Copies this page's current content into a reusable template in this space.",
          )}
        </Text>

        <TextInput
          label={t("Name")}
          placeholder={t("Untitled template")}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          data-autofocus
        />

        <Textarea
          label={t("Description")}
          placeholder={t("What is this template for?")}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={5}
        />

        <Checkbox
          label={t("Use it for every new page in this space")}
          description={t(
            "Creating a page here will open it already filled in with this template.",
          )}
          checked={makeDefault}
          onChange={(event) => setMakeDefault(event.currentTarget.checked)}
        />

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose} disabled={saving}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default SaveAsTemplateModal;
