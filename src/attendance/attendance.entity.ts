import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('attendance_tokens')
export class AttendanceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  referenceType: 'BOOKING' | 'FREE';

  @Column()
  referenceId: number;

  @Column()
  date: string;

  @Column()
  token: string;

  @Column({ default: false })
  used: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
