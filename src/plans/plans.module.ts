import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { Plan } from './plan.entity';
import { PlanSchedule } from './plan-schedule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, PlanSchedule])],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService], // 👈 ESTA LÍNEA ES CLAVE
})
export class PlansModule {}
