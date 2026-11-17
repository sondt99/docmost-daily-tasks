export interface ITemplate {
  id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  spaceId?: string | null;
  workspaceId: string;
  creatorId?: string | null;
  /** ProseMirror document; only present on the single-template endpoints. */
  content?: any;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

export interface ICreateTemplateFromPage {
  pageId: string;
  title?: string;
  description?: string;
  setAsSpaceDefault?: boolean;
}
