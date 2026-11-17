import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  pageEditorAtom,
  yjsSyncedAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import {
  deleteTemplate,
  getSpaceDefaultTemplate,
  getTemplateById,
  listTemplates,
  setSpaceDefaultTemplate,
} from "../template-service";
import { ITemplate } from "../types";

interface TemplatePickerModalProps {
  spaceId: string;
  opened: boolean;
  onClose: () => void;
}

export function TemplatePickerModal({
  spaceId,
  opened,
  onClose,
}: TemplatePickerModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const editor = useAtomValue(pageEditorAtom);
  const isSynced = useAtomValue(yjsSyncedAtom);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", spaceId],
    queryFn: () => listTemplates({ spaceId, limit: 100 }),
    enabled: opened,
  });

  const { data: spaceDefault } = useQuery({
    queryKey: ["space-default-template", spaceId],
    queryFn: () => getSpaceDefaultTemplate(spaceId),
    enabled: opened,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["templates"] });
    await queryClient.invalidateQueries({
      queryKey: ["space-default-template", spaceId],
    });
  };

  const handleInsert = async (item: ITemplate) => {
    if (!editor || editor.isDestroyed || !isSynced) {
      notifications.show({
        message: t("The page is still loading, try again in a moment"),
        color: "red",
      });
      return;
    }

    let template: ITemplate;
    try {
      template = await getTemplateById(item.id);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("An error occurred"),
        color: "red",
      });
      return;
    }

    const doc = template.content;
    const nodes = doc?.type === "doc" ? (doc.content ?? []) : doc;

    if (!nodes || (Array.isArray(nodes) && nodes.length === 0)) {
      notifications.show({
        message: t("That template is empty"),
        color: "red",
      });
      return;
    }

    // On a blank page the template replaces the stray empty paragraph the
    // editor starts with; on a page that already has text it lands at the
    // cursor. Both are ordinary editor transactions, so the collaboration
    // session picks them up like anything typed by hand.
    const chain = editor.chain().focus();
    if (editor.isEmpty) chain.selectAll();
    chain.insertContent(nodes).run();

    onClose();
  };

  const handleToggleDefault = async (
    event: React.MouseEvent,
    item: ITemplate,
  ) => {
    event.stopPropagation();
    const isDefault = spaceDefault?.id === item.id;
    try {
      await setSpaceDefaultTemplate(spaceId, isDefault ? null : item.id);
      await refresh();
      notifications.show({
        message: isDefault
          ? t("New pages in this space will start blank again")
          : t('New pages in this space will start from "{{title}}".', {
              title: item.title,
            }),
      });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("An error occurred"),
        color: "red",
      });
    }
  };

  const handleDelete = (event: React.MouseEvent, item: ITemplate) => {
    event.stopPropagation();
    modals.openConfirmModal({
      title: t("Delete template"),
      children: (
        <Text size="sm">
          {t('Delete "{{title}}"? Pages already made from it are not touched.', {
            title: item.title,
          })}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteTemplate(item.id);
          await refresh();
        } catch (err: any) {
          notifications.show({
            message: err?.response?.data?.message || t("An error occurred"),
            color: "red",
          });
        }
      },
    });
  };

  const items = templates?.items ?? [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Insert from template")}
      size="lg"
    >
      {isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : items.length === 0 ? (
        <Stack gap="xs" py="md">
          <Text size="sm">{t("No templates in this space yet.")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              'Write a page the way you want it, then pick "Save as template" from its menu.',
            )}
          </Text>
        </Stack>
      ) : (
        <ScrollArea.Autosize mah={420}>
          <Stack gap="xs">
            {items.map((item) => {
              const isDefault = spaceDefault?.id === item.id;
              return (
                <UnstyledButton
                  key={item.id}
                  onClick={() => handleInsert(item)}
                  style={{
                    borderRadius: "var(--mantine-radius-md)",
                    border: "1px solid var(--mantine-color-default-border)",
                    padding: "var(--mantine-spacing-sm)",
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Box style={{ minWidth: 0 }}>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" fw={500} truncate>
                          {item.title}
                        </Text>
                        {isDefault && (
                          <Badge size="xs" variant="light">
                            {t("Default")}
                          </Badge>
                        )}
                      </Group>
                      {item.description && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {item.description}
                        </Text>
                      )}
                    </Box>

                    <Group gap={4} wrap="nowrap">
                      <Tooltip
                        label={
                          isDefault
                            ? t("Stop using this for new pages")
                            : t("Use for every new page in this space")
                        }
                        withArrow
                      >
                        <ActionIcon
                          variant="subtle"
                          color={isDefault ? "yellow" : "gray"}
                          component="div"
                          onClick={(event) => handleToggleDefault(event, item)}
                        >
                          {isDefault ? (
                            <IconStarFilled size={16} />
                          ) : (
                            <IconStar size={16} />
                          )}
                        </ActionIcon>
                      </Tooltip>

                      <Tooltip label={t("Delete")} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          component="div"
                          onClick={(event) => handleDelete(event, item)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </UnstyledButton>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Modal>
  );
}

export default TemplatePickerModal;
