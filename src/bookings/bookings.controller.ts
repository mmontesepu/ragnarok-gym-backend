import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UseGuards,
  Req,
  Param,
  Query,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlanWeekDto } from './dto/plan-week.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(
    @Body()
    body: {
      studentId: number;
      slotId: number;
      date: string;
    },
  ) {
    return this.bookingsService.create(body.studentId, body.slotId, body.date);
  }

  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post('plan-week')
  planWeek(@Req() req, @Body() dto: PlanWeekDto) {
    return this.bookingsService.planWeekForStudent(req.user.userId, dto);
  }

  // ✅ MARCAR ASISTENCIA
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @Patch(':id/attended')
  markAttended(@Param('id') id: number) {
    return this.bookingsService.markAttended(+id);
  }

  // ❌ MARCAR AUSENCIA
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @Patch(':id/absent')
  markAbsent(@Param('id') id: number) {
    return this.bookingsService.markAbsent(+id);
  }

  // 📅 AGENDA DIARIA DEL PROFESOR
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @Get('teacher/daily')
  getTeacherDailySchedule(@Req() req, @Query('date') date: string) {
    return this.bookingsService.getTeacherDailySchedule(req.user.sub, date);
  }
}
