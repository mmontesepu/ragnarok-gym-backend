import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { UserRole } from './user-role.enum';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // =====================================================
  // CREAR USUARIO — SOLO ADMIN
  // =====================================================

  @Post()
  create(
    @Body()
    body: {
      email: string;
      password: string;
      role: UserRole;
    },
  ) {
    return this.usersService.create(body.email, body.password, body.role);
  }

  // =====================================================
  // LISTAR USUARIOS — SOLO ADMIN
  // =====================================================

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // =====================================================
  // LISTAR USUARIOS ACTIVOS — SOLO ADMIN
  // =====================================================

  @Get('active')
  findActive() {
    return this.usersService.findActive();
  }

  // =====================================================
  // DESACTIVAR USUARIO — SOLO ADMIN
  // =====================================================

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deactivate(id);
  }
}
