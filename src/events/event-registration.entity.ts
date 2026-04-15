import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
  Column,
} from 'typeorm';
import { Event } from './event.entity';
import { Student } from '../students/student.entity';

@Entity('event_registrations')
@Unique('uq_event_student', ['event', 'student'])
export class EventRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Event, (event) => event.registrations, {
    onDelete: 'CASCADE',
  })
  event: Event;

  @ManyToOne(() => Student, {
    onDelete: 'CASCADE',
  })
  student: Student;

  @Column({ default: true })
  confirmed: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
