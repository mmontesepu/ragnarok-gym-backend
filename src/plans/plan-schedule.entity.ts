import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Plan } from './plan.entity';

@Entity('plan_schedules')
export class PlanSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  dayOfWeek: string; // MONDAY, TUESDAY...

  @Column()
  hour: string; // "19:00"

  @ManyToOne(() => Plan, {
    onDelete: 'CASCADE',
  })
  plan: Plan;
}
