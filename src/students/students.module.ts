import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student } from './student.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { TeachersModule } from '../teachers/teachers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student]),
    UsersModule,
    PlansModule,
    TeachersModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService], // 👈 OBLIGATORIO
})
export class StudentsModule {}
