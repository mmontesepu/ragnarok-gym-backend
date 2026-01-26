import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique, // 🔧 NUEVO
} from 'typeorm';
import { Student } from '../students/student.entity';
import { ScheduleSlot } from '../schedule-slots/schedule-slot.entity';

export enum BookingStatus {
  BOOKED = 'BOOKED',
  ATTENDED = 'ATTENDED',
  ABSENT = 'ABSENT',
}

@Entity('bookings')
@Unique('uq_booking_student_slot_date', ['student', 'slot', 'date']) // 🔧 NUEVO
export class Booking {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Student)
  student: Student;

  @ManyToOne(() => ScheduleSlot)
  slot: ScheduleSlot;

  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.BOOKED,
  })
  status: BookingStatus;
}
