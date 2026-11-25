import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  Delete,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';

import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  findAllActive(@Req() req) {
    return this.eventsService.findAllActive(req.user.userId);
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  findAllForAdmin() {
    return this.eventsService.findAllForAdmin();
  }

  @Post(':id/register')
  @Roles(UserRole.STUDENT)
  register(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.eventsService.register(id, req.user.userId);
  }

  @Delete(':id/register')
  @Roles(UserRole.STUDENT)
  unregister(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.eventsService.unregister(id, req.user.userId);
  }

  @Get(':id/participants')
  @Roles(UserRole.ADMIN)
  getParticipants(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getParticipants(id);
  }

  @Patch(':id/toggle')
  @Roles(UserRole.ADMIN)
  toggleEvent(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.toggleEvent(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deleteEvent(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteEvent(id);
  }
}
