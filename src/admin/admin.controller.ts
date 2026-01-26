import { Controller, Get, Query } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('schedule')
  getDailySchedule(@Query('date') date: string) {
    return this.adminService.getDailySchedule(date);
  }
}
