import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Student } from '../students/student.entity';

export enum FreeScheduleStatus {
  BOOKED = 'BOOKED',
  ATTENDED = 'ATTENDED',
  ABSENT = 'ABSENT',
}

@Entity('free_schedules')
@Unique('uq_free_schedule_student_date', ['studentId', 'date'])
export class FreeSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 5 })
  hour: string;

  @Column()
  studentId: number;

  @ManyToOne(() => Student, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'studentId' })
  student: Student;

  // ✅ NUEVO: estado asistencia
  @Column({
    type: 'enum',
    enum: FreeScheduleStatus,
    default: FreeScheduleStatus.BOOKED,
  })
  status: FreeScheduleStatus;

  // ✅ NUEVO: cuándo asistió (si aplica)
  @Column({ type: 'timestamptz', nullable: true })
  attendedAt: Date | null;
}
