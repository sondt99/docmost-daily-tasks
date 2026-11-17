import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DailyTaskService } from './daily-task.service';
import { DailyTaskController } from './daily-task.controller';
import { PageModule } from '../../core/page/page.module';

@Module({
  imports: [ScheduleModule.forRoot(), PageModule],
  controllers: [DailyTaskController],
  providers: [DailyTaskService],
  exports: [DailyTaskService],
})
export class DailyTaskModule {}
