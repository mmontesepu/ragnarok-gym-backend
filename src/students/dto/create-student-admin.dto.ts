import { StudentTurn } from '../student.entity';

export class CreateStudentAdminDto {
  email: string;
  password: string;
  planId: number;
  teacherId?: number; // ✅ opcional
  turn: StudentTurn;
  firstName: string;
  lastName: string;
  fixedHour?: string;
}
