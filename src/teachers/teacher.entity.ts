import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Student } from '../students/student.entity';

export enum TeacherTurn {
  MORNING = 'MORNING',
  EVENING = 'EVENING',
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

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Student, (student) => student.teacher)
  students: Student[];
}