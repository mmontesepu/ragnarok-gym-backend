import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ScheduleSlotsService } from './schedule-slots.service';

@Controller('schedule-slots')
export class ScheduleSlotsController {
  constructor(private readonly scheduleSlotsService: ScheduleSlotsService) {}

  @Get()
  findAll() {
    return this.scheduleSlotsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.scheduleSlotsService.findOne(id);
  }
}
