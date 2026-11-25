import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

import { UserRole } from './user-role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  // SEGURIDAD: NO RECUPERAR CONTRASEÑA
  // EN CONSULTAS NORMALES
  @Column({ select: false })
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
  })
  role: UserRole;

  @Column({ default: true })
  active: boolean;
}
