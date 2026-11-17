import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { SpaceDefaultTemplateService } from './space-default-template.service';
import { SpaceDefaultTemplateInterceptor } from './space-default-template.interceptor';
import { PageModule } from '../page/page.module';

@Module({
  controllers: [TemplateController],
  providers: [
    TemplateService,
    SpaceDefaultTemplateService,
    // Nest applies an APP_INTERCEPTOR globally no matter which module declares
    // it, so the "fill a new page from its space's default template" hook can
    // live here with the rest of the template code instead of being bolted
    // onto Docmost's root module.
    {
      provide: APP_INTERCEPTOR,
      useClass: SpaceDefaultTemplateInterceptor,
    },
  ],
  exports: [TemplateService, SpaceDefaultTemplateService],
  imports: [PageModule],
})
export class TemplateModule {}
