import { Module } from '@nestjs/common';
import { DailyTaskService } from './daily-task.service';
import { DailyCarryOverService } from './daily-carry-over.service';
import { DailyTaskController } from './daily-task.controller';
import { PageModule } from '../../core/page/page.module';

/**
 * ScheduleModule.forRoot() is deliberately NOT imported here. Docmost already
 * calls it in TelemetryModule, and calling it a second time stands up a second
 * explorer that registers every @Cron handler again, so the job fires twice and
 * two identical pages are created each morning. One root registration is enough:
 * its explorer scans the whole application, this provider included.
 */
@Module({
  imports: [PageModule],
  controllers: [DailyTaskController],
  providers: [DailyTaskService, DailyCarryOverService],
  // The template interceptor fills a hand-made page the same way the cron
  // fills the morning one, so it needs the same carry-over.
  exports: [DailyTaskService, DailyCarryOverService],
})
export class DailyTaskModule {}
