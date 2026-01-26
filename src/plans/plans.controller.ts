import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  create(
    @Body()
    body: {
      name: string;
      classesPerWeek: number;
    },
  ) {
    return this.plansService.create(body.name, body.classesPerWeek);
  }

  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(Number(id));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.plansService.remove(Number(id));
  }
}
