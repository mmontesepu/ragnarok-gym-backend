import { StudentTurn } from '../student.entity';

export class CreateStudentAdminDto {
  email: string;
  password: string;
  planId: number;
  teacherId: number;
  turn: StudentTurn;
  fixedHour: string;
  firstName: string;
  lastName: string;
}
