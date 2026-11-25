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
  ParseIntPipe,
} from '@nestjs/common';

import { BookingsService } from './bookings.service';
import { PlanWeekDto } from './dto/plan-week.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // =====================================================
  // CREAR RESERVA MANUAL — ADMIN
  // =====================================================

  @Post()
  @Roles(UserRole.ADMIN)
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

  // =====================================================
  // LISTAR RESERVAS — ADMIN
  // =====================================================

  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.bookingsService.findAll();
  }

  // =====================================================
  // PLANIFICAR SEMANA PERSONALIZED
  // =====================================================

  @Post('plan-week')
  @Roles(UserRole.STUDENT)
  planWeek(@Req() req, @Body() dto: PlanWeekDto) {
    return this.bookingsService.planWeekForStudent(req.user.userId, dto);
  }

  // =====================================================
  // MARCAR ASISTENCIA
  // =====================================================

  @Patch(':id/attended')
  @Roles(UserRole.TEACHER)
  markAttended(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.bookingsService.markAttended(id, req.user.userId);
  }

  // =====================================================
  // MARCAR AUSENCIA
  // =====================================================

  @Patch(':id/absent')
  @Roles(UserRole.TEACHER)
  markAbsent(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.bookingsService.markAbsent(id, req.user.userId);
  }

  // =====================================================
  // AGENDA DIARIA DEL PROFESOR
  // =====================================================

  @Get('teacher/daily')
  @Roles(UserRole.TEACHER)
  getTeacherDailySchedule(@Req() req, @Query('date') date: string) {
    return this.bookingsService.getTeacherDailySchedule(req.user.userId, date);
  }

  // =====================================================
  // RESERVAR CLASE INDIVIDUAL
  // =====================================================

  @Post('class')
  @Roles(UserRole.STUDENT)
  createClassBooking(
    @Req() req,
    @Body()
    body: {
      date: string;
      hour: string;
    },
  ) {
    return this.bookingsService.createClassBooking(req.user.userId, body);
  }

  // =====================================================
  // REEMPLAZAR SEMANA CLASS
  // =====================================================

  @Post('class-week')
  @Roles(UserRole.STUDENT)
  replaceClassWeek(
    @Req() req,
    @Body()
    body: {
      weekStart: string;
      days: {
        date: string;
        hour: string;
      }[];
    },
  ) {
    return this.bookingsService.replaceClassWeek(req.user.userId, body);
  }
}
