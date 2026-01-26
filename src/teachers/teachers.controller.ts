import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { TeacherTurn } from './teacher.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  // ===============================
  // 👨‍🏫 CREAR PROFESOR (ADMIN)
  // ===============================
  @Post()
  create(
    @Body()
    body: {
      email: string;
      firstName: string;
      lastName: string;
      turn: TeacherTurn;
    },
  ) {
    return this.teachersService.create(
      body.email,
      body.firstName,
      body.lastName,
      body.turn,
    );
  }

  // ===============================
  // 📋 LISTAR PROFESORES (ADMIN)
  // ===============================
  @Get()
  findAll() {
    return this.teachersService.findAll();
  }

  // ===============================
  // 👨‍🎓 ALUMNOS DEL PROFESOR LOGUEADO
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @Get('my-students')
  getMyStudents(@Req() req) {
    const userId = req.user.sub; // viene del JWT
    return this.teachersService.getMyStudents(userId);
  }

  // ===============================
  // 📅 AGENDA DEL PROFESOR LOGUEADO
  // ===============================
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @Get('my-schedule')
  getMySchedule(@Req() req, @Query('date') date: string) {
    const userId = req.user.sub;
    return this.teachersService.getMySchedule(userId, date);
  }
}
