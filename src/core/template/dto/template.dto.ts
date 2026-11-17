import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
