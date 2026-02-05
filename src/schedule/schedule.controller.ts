import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScheduleService } from './schedule.service';

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /**
   * Soporta:
   *  - /schedule?date=YYYY-MM-DD
   *  - /schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  getSchedule(
    @Req() req,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.scheduleService.getSchedule(req.user, { date, from, to });
  }
}
