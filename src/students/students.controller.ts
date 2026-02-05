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
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentTurn } from './student.entity';
import { CreateStudentAdminDto } from './dto/create-student-admin.dto';

// 🔐 AUTH & ROLES
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { WeekDay } from './week-day.enum';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // ⚠️ ENDPOINT NORMAL (NO PROTEGIDO AÚN)
  // (lo dejamos así para no romper flujos existentes)
  @Post()
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

  // ⚠️ LISTADO GENERAL (por ahora público)
  @Get()
  findAll(@Query('search') search?: string) {
    return this.studentsService.findAll(search);
  }

  // 🔐 SOLO ADMIN — CREAR ALUMNO DESDE PANEL
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin-create')
  createFromAdmin(@Body() dto: CreateStudentAdminDto) {
    return this.studentsService.createFromAdmin(dto);
  }

  // 🔐 SOLO ADMIN — ACTIVAR / DESACTIVAR
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: number) {
    return this.studentsService.toggleActive(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/schedule')
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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req) {
    return this.studentsService.findByUserId(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/free-schedule')
  addFreeSchedule(
    @Req() req,
    @Body()
    body: {
      date: string;
      hour: string;
    },
  ) {
    return this.studentsService.addFreeSchedule(
      req.user.userId,
      body.date,
      body.hour,
    );
  }
}
