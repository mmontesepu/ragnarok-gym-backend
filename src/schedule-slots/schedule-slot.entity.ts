import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Teacher, TeacherTurn } from '../teachers/teacher.entity';

@Entity('schedule_slots')
export class ScheduleSlot {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Teacher, { eager: true, onDelete: 'CASCADE' })
  teacher: Teacher;

  @Column({
    type: 'enum',
    enum: TeacherTurn,
    nullable: true,
  })
  turn: TeacherTurn | null;

  @Column({ type: 'varchar', length: 5 })
  hour: string;

  @Column({ default: 5 })
  maxCapacity: number;

  @Column({ default: 0 })
  currentCapacity: number;

  @Column({ default: true })
  active: boolean;
}
