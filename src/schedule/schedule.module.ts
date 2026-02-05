import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';

import { Booking } from '../bookings/booking.entity';
import { Student } from '../students/student.entity';
import { FreeSchedule } from '../free-schedules/free-schedule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Student,
      FreeSchedule, // ✅ CLAVE
    ]),
  ],
  providers: [ScheduleService],
  controllers: [ScheduleController],
})
export class ScheduleModule {}
