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
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAllActive(@Req() req: any) {
    return this.eventsService.findAllActive(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  findAllForAdmin() {
    return this.eventsService.findAllForAdmin();
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/register')
  register(@Param('id') id: number, @Req() req: any) {
    return this.eventsService.register(+id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/register')
  unregister(@Param('id') id: number, @Req() req: any) {
    return this.eventsService.unregister(+id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id/participants')
  getParticipants(@Param('id') id: number) {
    return this.eventsService.getParticipants(+id);
  }

  @Patch(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  toggleEvent(@Param('id') id: number) {
    return this.eventsService.toggleEvent(+id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteEvent(@Param('id') id: number) {
    return this.eventsService.deleteEvent(+id);
  }
}
