import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Student } from '../students/student.entity';
import { Plan } from '../plans/plan.entity';

export enum TeacherTurn {
  MORNING = 'MORNING',
  EVENING = 'EVENING',
}

// 🔥 NUEVO
export enum TeacherType {
  PERSONALIZED = 'PERSONALIZED',
  CLASS = 'CLASS',
}

@Entity('teachers')
export class Teacher {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({
    type: 'enum',
    enum: TeacherTurn,
    enumName: 'teacher_turn_enum',
  })
  turn: TeacherTurn;

  // 🔥 NUEVO
  @Column({
    type: 'enum',
    enum: TeacherType,
    enumName: 'teacher_type_enum',
    default: TeacherType.PERSONALIZED,
  })
  type: TeacherType;

  // 🔥 SOLO PARA CLASS
  @ManyToMany(() => Plan, { eager: true })
  @JoinTable()
  plans: Plan[];

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Student, (student) => student.teacher)
  students: Student[];
}
