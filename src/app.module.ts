import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlansModule } from './plans/plans.module';
import { UsersModule } from './users/users.module';
import { TeachersModule } from './teachers/teachers.module';
import { StudentsModule } from './students/students.module';
import { ScheduleSlotsModule } from './schedule-slots/schedule-slots.module';
import { BookingsModule } from './bookings/bookings.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ScheduleModule } from './schedule/schedule.module';
import { FreeScheduleModule } from './free-schedules/free-schedule.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: true,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    }),

    PlansModule,

    UsersModule,

    TeachersModule,

    StudentsModule,

    ScheduleSlotsModule,

    BookingsModule,

    AuthModule,

    AdminModule,

    ScheduleModule,

    FreeScheduleModule,
  ],
})
export class AppModule {}
