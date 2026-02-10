import { IsOptional, IsString, IsNumber } from 'class-validator';
import { StudentTurn } from '../student.entity';

export class UpdateStudentAdminDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsNumber()
  planId?: number;

  @IsOptional()
  @IsNumber()
  teacherId?: number;

  @IsOptional()
  @IsString()
  fixedHour?: string;

  @IsOptional()
  active?: boolean;
}
