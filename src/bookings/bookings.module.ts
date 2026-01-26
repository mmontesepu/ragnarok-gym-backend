import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { StudentsModule } from '../students/students.module';
import { ScheduleSlotsModule } from '../schedule-slots/schedule-slots.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking]),
    StudentsModule,
    ScheduleSlotsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
