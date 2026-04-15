import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
  Query,
  Patch,
  Param,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { TeacherTurn } from './teacher.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { UpdateTeacherAdminDto } from './dto/update-teacher-admin.dto';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  // ===============================
  // 👨‍🏫 CREAR PROFESOR (ADMIN)
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(
    @Body()
    body: {
      email: string;
      firstName: string;
      lastName: string;
      turn: TeacherTurn;
      type: 'PERSONALIZED' | 'CLASS';
      planIds?: number[];
    },
  ) {
    return this.teachersService.create(
      body.email,
      body.firstName,
      body.lastName,
      body.turn,
      body.type as any,
      body.planIds,
    );
  }

  // ===============================
  // 📋 LISTAR PROFESORES (ADMIN)
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@Query('search') search?: string) {
    return this.teachersService.findAll(search);
  }

  // ===============================
  // ✏️ EDITAR PROFESOR (ADMIN)
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  updateTeacher(@Param('id') id: number, @Body() dto: UpdateTeacherAdminDto) {
    return this.teachersService.updateFromAdmin(+id, dto);
  }

  // ===============================
  // 🚫 BLOQUEAR / ACTIVAR (ADMIN)
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: number) {
    return this.teachersService.toggleActive(+id);
  }

  // ===============================
  // 👨‍🎓 ALUMNOS DEL PROFESOR LOGUEADO
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @Get('my-students')
  getMyStudents(@Req() req) {
    const userId = req.user.userId;
    return this.teachersService.getMyStudents(userId);
  }

  // ===============================
  // 📅 AGENDA DEL PROFESOR LOGUEADO
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @Get('my-schedule')
  getMySchedule(@Req() req, @Query('date') date: string) {
    const userId = req.user.userId;
    return this.teachersService.getMySchedule(userId, date);
  }
}
