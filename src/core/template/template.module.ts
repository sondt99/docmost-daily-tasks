import { Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { PageModule } from '../page/page.module';

@Module({
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
  imports: [PageModule],
})
export class TemplateModule {}
