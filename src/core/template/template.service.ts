import {
  BadRequestException,
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
  CreateTemplateFromPageDto,
  SetSpaceDefaultTemplateDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';
import { SpaceDefaultTemplateService } from './space-default-template.service';

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
    private readonly spaceDefaultTemplate: SpaceDefaultTemplateService,
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

  /**
   * Saves an existing page as a template, optionally making it the space's
   * default in the same call. Writing the page first and saving it second is
   * the only way to author a template here, so the two halves of "set this up
   * for my space" stay a single click.
   */
  async createFromPage(
    dto: CreateTemplateFromPageDto,
    user: User,
    workspace: Workspace,
  ): Promise<Template> {
    const page = await this.pageService.findById(dto.pageId, true);

    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }

    await this.assertSpace(
      user,
      page.spaceId,
      SpaceCaslAction.Edit,
      'You cannot create templates in this space',
    );

    // Checked up front rather than after the insert, so that a member who may
    // write pages but not change space settings gets a plain refusal instead
    // of a stray template plus an error.
    if (dto.setAsSpaceDefault) {
      const ability = await this.spaceAbility.createForUser(user, page.spaceId);
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException(
          'You cannot change the settings of this space',
        );
      }
    }

    const template = await this.create(
      {
        title: dto.title?.trim() || page.title || 'Untitled template',
        description: dto.description,
        icon: page.icon ?? undefined,
        spaceId: page.spaceId,
        content: (page as any).content ?? null,
      },
      user,
      workspace,
    );

    if (dto.setAsSpaceDefault) {
      await this.setSpaceDefault(
        { spaceId: page.spaceId, templateId: template.id },
        user,
        workspace,
      );
    }

    return template;
  }

  /** The space's default template, or null when it has none. */
  async getSpaceDefault(
    spaceId: string,
    user: User,
    workspace: Workspace,
  ): Promise<Template | null> {
    await this.assertSpace(
      user,
      spaceId,
      SpaceCaslAction.Read,
      'You do not have access to this space',
    );

    const templateId = await this.spaceDefaultTemplate.get(
      spaceId,
      workspace.id,
    );
    if (!templateId) return null;

    try {
      return await this.findOne(templateId, user, workspace);
    } catch {
      // The template was deleted after being set as the default.
      return null;
    }
  }

  /**
   * Points a space at a default template, or clears it with a null id.
   *
   * Changing this changes what every member of the space gets when they create
   * a page, so it needs more than page-edit rights: it is a space setting and
   * is gated as one.
   */
  async setSpaceDefault(
    dto: SetSpaceDefaultTemplateDto,
    user: User,
    workspace: Workspace,
  ): Promise<Template | null> {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException(
        'You cannot change the settings of this space',
      );
    }

    if (!dto.templateId) {
      await this.spaceDefaultTemplate.set(dto.spaceId, workspace.id, null);
      return null;
    }

    const template = await this.findOne(dto.templateId, user, workspace);

    if (template.spaceId && template.spaceId !== dto.spaceId) {
      throw new BadRequestException(
        'That template belongs to a different space',
      );
    }

    await this.spaceDefaultTemplate.set(
      dto.spaceId,
      workspace.id,
      template.id,
    );

    return template;
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
