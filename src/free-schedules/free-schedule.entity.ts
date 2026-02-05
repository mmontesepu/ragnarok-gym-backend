import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Student } from '../students/student.entity';

@Entity('free_schedules')
@Unique('uq_free_schedule_student_date', ['studentId', 'date'])
export class FreeSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 5 })
  hour: string;

  // 🔑 ESTA COLUMNA ES LA CLAVE (ANTES NO EXISTÍA BIEN)
  @Column()
  studentId: number;

  @ManyToOne(() => Student, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;
}
