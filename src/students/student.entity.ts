import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Column,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Plan } from '../plans/plan.entity';
import { Teacher } from '../teachers/teacher.entity';
import { WeekDay } from './week-day.enum';

export enum StudentTurn {
  MORNING = 'MORNING',
  EVENING = 'EVENING',
}

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @ManyToOne(() => Plan, { eager: true })
  plan: Plan;

  @ManyToOne(() => Teacher, (teacher) => teacher.students, {
    eager: true,
    nullable: true, // ✅
  })
  teacher: Teacher | null;

  @Column({
    type: 'enum',
    enum: StudentTurn,
    enumName: 'student_turn_enum',
  })
  turn: StudentTurn;

  @Column({
    type: 'enum',
    enum: WeekDay,
    array: true,
    nullable: true, // 👈 CLAVE
  })
  weekDays: WeekDay[];

  @Column({ type: 'varchar', nullable: true })
  fixedHour: string | null;

  @Column({ default: true })
  active: boolean;
}
