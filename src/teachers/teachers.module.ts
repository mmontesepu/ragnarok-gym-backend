import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { Teacher } from './teacher.entity';
import { Student } from '../students/student.entity';
import { UsersModule } from '../users/users.module';
import { ScheduleSlotsModule } from '../schedule-slots/schedule-slots.module'; // ✅ ESTE IMPORT
import { Booking } from '../bookings/booking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Teacher, Student, Booking]),
    UsersModule,
    ScheduleSlotsModule, // ✅ ahora sí existe
  ],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService], // 👈 ESTA LÍNEA FALTABA
})
export class TeachersModule {}
