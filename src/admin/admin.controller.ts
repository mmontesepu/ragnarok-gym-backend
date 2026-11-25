import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AdminService } from './admin.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('schedule')
  getDailySchedule(@Query('date') date: string) {
    return this.adminService.getDailySchedule(date);
  }
}
