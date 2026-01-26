import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleSlot } from './schedule-slot.entity';
import { ScheduleSlotsService } from './schedule-slots.service';
import { ScheduleSlotsController } from './schedule-slots.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ScheduleSlot])], // 👈 SOLO ESTO
  controllers: [ScheduleSlotsController],
  providers: [ScheduleSlotsService],
  exports: [ScheduleSlotsService],
})
export class ScheduleSlotsModule {}
