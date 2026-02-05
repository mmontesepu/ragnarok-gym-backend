import { StudentTurn } from '../student.entity';

export class CreateStudentAdminDto {
  email: string;
  password: string;
  planId: number;
  teacherId?: number; // ✅ opcional
  turn: StudentTurn;
  fixedHour?: string; // ✅ opcional
  firstName: string;
  lastName: string;
}
