import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Req,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';

import { AttendanceService } from './attendance.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

import { ValidateDto } from './dto/validate.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // =====================================================
  // VALIDAR ASISTENCIA
  // COMPATIBLE CON RUT Y UUID
  // =====================================================

  @Post('validate')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  validate(
    @Body(new ValidationPipe({ whitelist: true }))
    body: ValidateDto,
    @Req() req,
  ) {
    return this.service.validate(body.token, req.user.userId, req.user.role);
  }

  // =====================================================
  // GENERAR QR UUID - RESERVA CON PROFESOR
  // COMPATIBILIDAD CON VERSIONES ANTERIORES
  // =====================================================

  @Post('generate/booking/:id')
  @Roles(UserRole.STUDENT)
  generateForBooking(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { date: string },
    @Req() req,
  ) {
    return this.service.generateForBooking(id, body.date, req.user.userId);
  }

  // =====================================================
  // GENERAR QR UUID - PLAN LIBRE
  // COMPATIBILIDAD CON VERSIONES ANTERIORES
  // =====================================================

  @Post('generate/free/:id')
  @Roles(UserRole.STUDENT)
  generateForFree(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { date: string },
    @Req() req,
  ) {
    return this.service.generateForFree(id, body.date, req.user.userId);
  }
}
