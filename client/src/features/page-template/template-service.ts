import api from "@/lib/api-client";
import { IPagination, QueryParams } from "@/lib/types.ts";
import { ICreateTemplateFromPage, ITemplate } from "./types";

export async function listTemplates(
  params: QueryParams & { spaceId?: string },
): Promise<IPagination<ITemplate>> {
  const req = await api.post<IPagination<ITemplate>>("/templates", params);
  return req.data;
}

export async function getTemplateById(templateId: string): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/info", { templateId });
  return req.data;
}

export async function createTemplateFromPage(
  data: ICreateTemplateFromPage,
): Promise<ITemplate> {
  const req = await api.post<ITemplate>("/templates/create-from-page", data);
  return req.data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await api.post("/templates/delete", { templateId });
}

export async function getSpaceDefaultTemplate(
  spaceId: string,
): Promise<ITemplate | null> {
  const req = await api.post<ITemplate | null>("/templates/space-default", {
    spaceId,
  });
  return req.data ?? null;
}

export async function setSpaceDefaultTemplate(
  spaceId: string,
  templateId: string | null,
): Promise<ITemplate | null> {
  const req = await api.post<ITemplate | null>(
    "/templates/set-space-default",
    { spaceId, templateId },
  );
  return req.data ?? null;
}
