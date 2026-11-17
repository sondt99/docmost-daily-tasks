import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { Page, Template, User, Workspace } from '@docmost/db/types/entity.types';
import { PageService } from '../page/services/page.service';
import { jsonToText } from '../../collaboration/collaboration.util';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';

/**
 * Templates for the community edition.
 *
 * Access model:
 *  - A template bound to a space follows that space's page permissions:
 *    Read to view or use it, Edit to create, change or delete it.
 *  - A template with no space is workspace-wide: any member may view and use
 *    it, only its creator may change or delete it.
 */
@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async list(
    user: User,
    workspace: Workspace,
    pagination: PaginationOptions,
    spaceId?: string,
  ) {
    const accessibleSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(
      user.id,
    );

    return this.templateRepo.findTemplates(
      workspace.id,
      accessibleSpaceIds,
      pagination,
      { spaceId },
    );
  }

  async findOne(
    templateId: string,
    user: User,
    workspace: Workspace,
    opts?: { includeContent?: boolean },
  ): Promise<Template> {
    const template = await this.templateRepo.findById(
      templateId,
      workspace.id,
      { includeContent: opts?.includeContent ?? false },
    );

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.spaceId) {
      await this.assertSpace(
        user,
        template.spaceId,
        SpaceCaslAction.Read,
        'You do not have access to this template',
      );
    }

    return template;
  }

  async create(
    dto: CreateTemplateDto,
    user: User,
    workspace: Workspace,
  ): Promise<Template> {
    if (dto.spaceId) {
      await this.assertSpace(
        user,
        dto.spaceId,
        SpaceCaslAction.Edit,
        'You cannot create templates in this space',
      );
    }

    const content = dto.content ?? null;

    const inserted = await this.templateRepo.insertTemplate({
      title: dto.title,
      description: dto.description,
      icon: dto.icon,
      spaceId: dto.spaceId ?? null,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
      content,
      textContent: content ? jsonToText(content) : null,
    });

    return this.findOne(inserted.id, user, workspace, {
      includeContent: true,
    });
  }

  async update(
    dto: UpdateTemplateDto,
    user: User,
    workspace: Workspace,
  ): Promise<Template> {
    const template = await this.findOne(dto.templateId, user, workspace);
    await this.assertCanWrite(template, user);

    const changes: Record<string, any> = { lastUpdatedById: user.id };

    if (dto.title !== undefined) changes.title = dto.title;
    if (dto.description !== undefined) changes.description = dto.description;
    if (dto.icon !== undefined) changes.icon = dto.icon;
    if (dto.content !== undefined) {
      changes.content = dto.content;
      changes.textContent = dto.content ? jsonToText(dto.content) : null;
    }

    await this.templateRepo.updateTemplate(
      changes,
      dto.templateId,
      workspace.id,
    );

    return this.findOne(dto.templateId, user, workspace, {
      includeContent: true,
    });
  }

  async delete(
    templateId: string,
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    const template = await this.findOne(templateId, user, workspace);
    await this.assertCanWrite(template, user);

    await this.templateRepo.deleteTemplate(templateId, workspace.id);
  }

  /** Creates a page in the target space from the template's content. */
  async use(
    dto: UseTemplateDto,
    user: User,
    workspace: Workspace,
  ): Promise<Page> {
    const template = await this.findOne(dto.templateId, user, workspace, {
      includeContent: true,
    });

    await this.assertSpace(
      user,
      dto.spaceId,
      SpaceCaslAction.Create,
      'You cannot create pages in this space',
    );

    return this.pageService.create(user.id, workspace.id, {
      title: template.title,
      icon: template.icon,
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      content: (template as any).content ?? undefined,
      format: 'json',
    });
  }

  private async assertCanWrite(template: Template, user: User): Promise<void> {
    if (template.spaceId) {
      await this.assertSpace(
        user,
        template.spaceId,
        SpaceCaslAction.Edit,
        'You cannot modify templates in this space',
      );
      return;
    }

    if (template.creatorId !== user.id) {
      throw new ForbiddenException(
        'Only the creator can modify a workspace template',
      );
    }
  }

  private async assertSpace(
    user: User,
    spaceId: string,
    action: SpaceCaslAction,
    message: string,
  ): Promise<void> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(action, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(message);
    }
  }
}
