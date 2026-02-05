import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  classesPerWeek: number;

  // 🔹 NUEVO: ¿requiere profesor?
  @Column({ default: true })
  requiresTeacher: boolean;

  // 🔹 Horarios permitidos (L–V)
  @Column({ nullable: true })
  weekdayStartHour: string;

  @Column({ nullable: true })
  weekdayEndHour: string;

  // 🔹 Horarios permitidos (Sábado)
  @Column({ nullable: true })
  saturdayStartHour: string;

  @Column({ nullable: true })
  saturdayEndHour: string;
}
