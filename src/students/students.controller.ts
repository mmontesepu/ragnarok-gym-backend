import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentTurn } from './student.entity';
import { CreateStudentAdminDto } from './dto/create-student-admin.dto';

// 🔐 AUTH & ROLES
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

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
  findAll() {
    return this.studentsService.findAll();
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
}
