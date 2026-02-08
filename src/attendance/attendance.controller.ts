import { Controller, Post, Body, UseGuards, Param, Req } from '@nestjs/common';

import { AttendanceService } from './attendance.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@Controller('attendance')
@UseGuards(JwtAuthGuard) // ✅ cualquier usuario autenticado puede generar QR
export class AttendanceController {
  constructor(private service: AttendanceService) {}

  // =====================================================
  // ✅ SOLO ADMIN Y PROFESOR PUEDEN VALIDAR ASISTENCIA
  // =====================================================
  @Post('validate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  validate(@Body('token') token: string) {
    return this.service.validate(token);
  }

  // =====================================================
  // 🧑‍🎓 QR PARA RESERVA CON PROFESOR
  // (alumno genera — profe/admin escanean)
  // =====================================================
  @Post('generate/booking/:id')
  generateForBooking(@Param('id') id: number, @Body() body: { date: string }) {
    return this.service.generateForBooking(+id, body.date);
  }

  // =====================================================
  // 🧑‍🎓 QR PARA PLAN LIBRE
  // =====================================================
  @Post('generate/free/:id')
  generateForFree(@Param('id') id: number, @Body() body: { date: string }) {
    return this.service.generateForFree(+id, body.date);
  }
}
