import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Teacher } from '../teachers/teacher.entity';
import { TeacherTurn } from '../teachers/teacher.entity';

@Entity('schedule_slots')
export class ScheduleSlot {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Teacher)
  teacher: Teacher;

  @Column({
    type: 'enum',
    enum: TeacherTurn,
    enumName: 'schedule_slot_turn_enum',
  })
  turn: TeacherTurn;

  @Column()
  hour: string; // "18:00"

  @Column({ default: 3 })
  maxCapacity: number;

  @Column({ default: 0 })
  currentCapacity: number;

  @Column({ default: true })
  active: boolean;
}
