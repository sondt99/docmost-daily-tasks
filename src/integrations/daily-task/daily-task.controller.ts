import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsISO8601 } from 'class-validator';
import { DailyTaskService } from './daily-task.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '@docmost/db/types/entity.types';

export class RunDailyTaskDto {
  /** Build the page for this date instead of today. */
  @IsOptional()
  @IsISO8601()
  date?: string;
}

/**
 * Lets the configured owner build the day's page without waiting for the
 * schedule, which is also how the feature is checked after a deploy.
 */
@UseGuards(JwtAuthGuard)
@Controller('daily-task')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @HttpCode(HttpStatus.OK)
  @Post('run')
  async run(@Body() dto: RunDailyTaskDto, @AuthUser() user: User) {
    const owner = (process.env.DAILY_TASK_USER_ID ?? '').trim();
    if (!owner || user.id !== owner) {
      throw new ForbiddenException(
        'Only the configured daily task user may run this',
      );
    }

    const when = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(when.getTime())) {
      throw new ForbiddenException('Invalid date');
    }

    return this.dailyTaskService.createForDate(when);
  }
}
