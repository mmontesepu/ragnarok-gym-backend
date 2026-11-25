import { StudentTurn } from '../student.entity';
import { IsOptional, IsString } from 'class-validator';

export class CreateStudentAdminDto {
  email: string;
  password: string;
  planId: number;
  teacherId?: number;
  turn: StudentTurn;
  firstName: string;
  lastName: string;
  fixedHour?: string;

  // NUEVO: RUT DEL ALUMNO
  @IsOptional()
  @IsString()
  rut?: string;
}
