import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';

import { StudentsService } from './students.service';
import { StudentTurn } from './student.entity';
import { CreateStudentAdminDto } from './dto/create-student-admin.dto';
import { UpdateStudentAdminDto } from './dto/update-student-admin.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { WeekDay } from './week-day.enum';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // =====================================================
  // CREACIÓN NORMAL — SOLO ADMIN
  // =====================================================

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body()
    body: {
      userId: number;
      planId: number;
      teacherId: number;
      turn: StudentTurn;
      fixedHour: string;
    },
  ) {
    return this.studentsService.create(
      body.userId,
      body.planId,
      body.teacherId,
      body.turn,
      body.fixedHour,
    );
  }

  // =====================================================
  // LISTADO GENERAL — ADMIN Y PROFESOR
  // =====================================================

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query('search') search?: string) {
    return this.studentsService.findAll(search);
  }

  // =====================================================
  // CREAR ALUMNO DESDE PANEL ADMIN
  // =====================================================

  @Post('admin-create')
  @Roles(UserRole.ADMIN)
  createFromAdmin(@Body() dto: CreateStudentAdminDto) {
    return this.studentsService.createFromAdmin(dto);
  }

  // =====================================================
  // ACTIVAR / DESACTIVAR ALUMNO
  // =====================================================

  @Patch(':id/toggle-active')
  @Roles(UserRole.ADMIN)
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.studentsService.toggleActive(id);
  }

  // =====================================================
  // ACTUALIZAR AGENDA SEMANAL DEL ALUMNO
  // =====================================================

  @Patch('me/schedule')
  @Roles(UserRole.STUDENT)
  updateMySchedule(
    @Req() req,
    @Body()
    body: {
      weekDays: WeekDay[];
      fixedHour: string;
    },
  ) {
    return this.studentsService.updateStudentSchedule(
      req.user.userId,
      body.weekDays,
      body.fixedHour,
    );
  }

  // =====================================================
  // OBTENER PERFIL DEL ALUMNO + RUT
  // =====================================================

  @Get('me')
  @Roles(UserRole.STUDENT)
  getMe(@Req() req) {
    return this.studentsService.findByUserId(req.user.userId);
  }


  // =====================================================
  // ACTUALIZAR ALUMNO + RUT — SOLO ADMIN
  // =====================================================

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  updateStudent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentAdminDto,
  ) {
    return this.studentsService.updateFromAdmin(id, dto);
  }
}
