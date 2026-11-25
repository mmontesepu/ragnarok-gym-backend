import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Query,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

import { FreeScheduleService } from './free-schedule.service';
import { ReplaceFreeWeekDto } from './dto/replace-week.dto';

@Controller('students/me/free-schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FreeScheduleController {
  constructor(private readonly service: FreeScheduleService) {}

  // =====================================================
  // GUARDAR DÍA FREE
  // =====================================================

  @Post()
  @Roles(UserRole.STUDENT)
  saveDay(
    @Req() req,
    @Body()
    body: {
      date: string;
      hour: string;
    },
  ) {
    return this.service.saveDayForUser(req.user.userId, body.date, body.hour);
  }

  // =====================================================
  // REEMPLAZAR SEMANA FREE
  // =====================================================

  @Post('week')
  @Roles(UserRole.STUDENT)
  replaceWeek(@Req() req, @Body() dto: ReplaceFreeWeekDto) {
    return this.service.replaceWeek(req.user.userId, dto.weekStart, dto.days);
  }

  // =====================================================
  // AGENDA DIARIA
  // =====================================================

  @Get('daily')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  getDaily(@Query('date') date: string) {
    return this.service.getDailyGrouped(date);
  }

  // =====================================================
  // AGENDA ADMINISTRATIVA
  // =====================================================

  @Get('admin/daily')
  @Roles(UserRole.ADMIN)
  getDailyAdmin(@Query('date') date: string) {
    return this.service.getDailyGrouped(date);
  }
}
