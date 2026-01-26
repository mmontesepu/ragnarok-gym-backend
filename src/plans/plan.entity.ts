import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  classesPerWeek: number;
}
