import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class ListTemplatesDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class TemplateIdDto {
  @IsUUID()
  templateId: string;
}

export class CreateTemplateDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  /** Omit for a workspace-wide template. */
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  /** ProseMirror JSON document. */
  @IsOptional()
  content?: any;
}

export class UpdateTemplateDto {
  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  content?: any;
}

export class UseTemplateDto {
  @IsUUID()
  templateId: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;
}

export class CreateTemplateFromPageDto {
  @IsUUID()
  pageId: string;

  /** Defaults to the page's own title. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Also make this the space's default template, so that every page created
   * in the space from now on starts from it.
   */
  @IsOptional()
  @IsBoolean()
  setAsSpaceDefault?: boolean;
}

export class SpaceIdDto {
  @IsUUID()
  spaceId: string;
}

export class SetSpaceDefaultTemplateDto {
  @IsUUID()
  spaceId: string;

  /** null clears the default. */
  @IsOptional()
  @ValidateIf((o) => o.templateId !== null)
  @IsUUID()
  templateId: string | null;
}
