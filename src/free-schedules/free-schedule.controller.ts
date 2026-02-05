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
import { FreeScheduleService } from './free-schedule.service';
import { ReplaceFreeWeekDto } from './dto/replace-week.dto';

@Controller('students/me/free-schedule')
@UseGuards(JwtAuthGuard)
export class FreeScheduleController {
  constructor(private readonly service: FreeScheduleService) {}

  // 🔒 EXISTENTE → NO TOCAR
  @Post()
  saveDay(@Req() req, @Body() body: { date: string; hour: string }) {
    return this.service.saveDay(req.user.studentId, body.date, body.hour);
  }

  // 🆕 NUEVO → reemplazar semana completa (PLAN LIBRE)
  @Post('week')
  replaceWeek(@Req() req, @Body() dto: ReplaceFreeWeekDto) {
    return this.service.replaceWeek(
      req.user.userId, // 🔥 NO studentId
      dto.weekStart,
      dto.days,
    );
  }

  @Get('daily')
  async getDaily(@Query('date') date: string) {
    return this.service.getDailyGrouped(date);
  }

  @Get('/admin/daily')
  async getDailyAdmin(@Query('date') date: string) {
    return this.service.getDailyGrouped(date);
  }
}
