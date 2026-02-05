import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FreeSchedule } from './free-schedule.entity';
import { FreeScheduleService } from './free-schedule.service';
import { FreeScheduleController } from './free-schedule.controller';
import { StudentsModule } from '../students/students.module'; // ✅ IMPORT

@Module({
  imports: [
    TypeOrmModule.forFeature([FreeSchedule]),
    StudentsModule, // ✅ CLAVE
  ],
  controllers: [FreeScheduleController],
  providers: [FreeScheduleService],
})
export class FreeScheduleModule {}
