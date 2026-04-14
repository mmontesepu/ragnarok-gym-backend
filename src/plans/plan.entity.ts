import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PlanSchedule } from './plan-schedule.entity';

export enum PlanType {
  PERSONALIZED = 'PERSONALIZED',
  FREE = 'FREE',
  CLASS = 'CLASS',
}

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  classesPerWeek: number;

  // 🔥 NUEVO
  @Column({
    type: 'enum',
    enum: PlanType,
    enumName: 'plan_type_enum',
    default: PlanType.FREE,
  })
  type: PlanType;

  // 🔹 Se mantiene por compatibilidad (puedes eliminar después)
  @Column({ default: true })
  requiresTeacher: boolean;

  // 🔹 SOLO PARA FREE
  @Column({ nullable: true })
  weekdayStartHour: string;

  @Column({ nullable: true })
  weekdayEndHour: string;

  @Column({ nullable: true })
  saturdayStartHour: string;

  @Column({ nullable: true })
  saturdayEndHour: string;

  // 🔹 SOLO PARA CLASS
  @OneToMany(() => PlanSchedule, (schedule) => schedule.plan, {
    cascade: true,
    eager: true,
  })
  schedules: PlanSchedule[];
}
