import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

import { Student } from './student.entity';
import { FreeSchedule } from '../free-schedules/free-schedule.entity';

import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Student,
      FreeSchedule, // ✅ CLAVE
    ]),
    UsersModule,
    PlansModule,
    TeachersModule,
  ],
  providers: [StudentsService],
  controllers: [StudentsController],
  exports: [StudentsService],
})
export class StudentsModule {}
