import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttendanceToken } from './attendance.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';

import { Booking } from '../bookings/booking.entity';
import { FreeSchedule } from '../free-schedules/free-schedule.entity';
import { Student } from '../students/student.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceToken, Booking, FreeSchedule, Student]),
  ],
  providers: [AttendanceService],
  controllers: [AttendanceController],
})
export class AttendanceModule {}
